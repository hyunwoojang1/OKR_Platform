'use server';

import { revalidatePath } from 'next/cache';
import { db } from './db';
import { kstToday, kstQuarter } from './types';

// 모든 액션 공통: 입력을 서버에서 검증하고(빈 문자열 거부), 실패는 명시적으로 던진다.
function must(v: FormDataEntryValue | null, name: string): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) throw new Error(`${name} 값이 비어 있습니다`);
  if (s.length > 500) throw new Error(`${name}이(가) 너무 깁니다`);
  return s;
}

async function run(op: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await fn();
  if (error) throw new Error(`${op} 실패: ${error.message}`);
}

// ── 영역 ──
export async function createArea(form: FormData) {
  await run('영역 생성', () =>
    db().from('areas').insert({
      name: must(form.get('name'), '영역명'),
      color: must(form.get('color'), '컬러'),
      icon: (form.get('icon') as string)?.trim() || null,
    }),
  );
  revalidatePath('/okr');
}

// ── OKR 트리 ──
export async function createObjective(form: FormData) {
  await run('Objective 생성', () =>
    db().from('objectives').insert({
      area_id: must(form.get('area_id'), '영역'),
      title: must(form.get('title'), '제목'),
      period: must(form.get('period'), '분기'),
    }),
  );
  revalidatePath('/okr');
}

export async function createMilestone(form: FormData) {
  await run('마일스톤 생성', () =>
    db().from('milestones').insert({
      objective_id: must(form.get('objective_id'), 'Objective'),
      month: must(form.get('month'), '월'),
      title: must(form.get('title'), '제목'),
    }),
  );
  revalidatePath('/okr');
}

export async function createKeyResult(form: FormData) {
  const target = Number(must(form.get('target_value'), '목표값'));
  if (!Number.isFinite(target) || target <= 0) throw new Error('목표값은 양수여야 합니다');
  // auto 필드: "" | "habit:<habitId>" | "api:<커넥터키>"
  const auto = ((form.get('auto') as string) ?? '').trim();
  let source: 'manual' | 'habit_agg' | 'api' = 'manual';
  let sourceRef: string | null = null;
  if (auto.startsWith('habit:')) {
    source = 'habit_agg';
    sourceRef = auto.slice(6);
  } else if (auto.startsWith('api:')) {
    source = 'api';
    if (!['auction_grade_a', 'jobs_sent'].includes(auto.slice(4))) throw new Error('허용되지 않은 커넥터');
    sourceRef = auto.slice(4);
  }
  await run('KR 생성', () =>
    db().from('key_results').insert({
      objective_id: must(form.get('objective_id'), 'Objective'),
      title: must(form.get('title'), '제목'),
      target_value: target,
      unit: (form.get('unit') as string)?.trim() || '',
      source,
      source_ref: sourceRef,
    }),
  );
  revalidatePath('/okr');
}

export async function syncKRsNow() {
  const { syncAutoKRs } = await import('./kr-sync');
  await syncAutoKRs();
  revalidatePath('/okr');
  revalidatePath('/');
}

export async function updateKRProgress(form: FormData) {
  const value = Number(must(form.get('current_value'), '현재값'));
  if (!Number.isFinite(value) || value < 0) throw new Error('현재값이 올바르지 않습니다');
  await run('KR 갱신', () =>
    db().from('key_results').update({ current_value: value }).eq('id', must(form.get('id'), 'KR')),
  );
  revalidatePath('/okr');
  revalidatePath('/');
}

export async function createInitiative(form: FormData) {
  await run('이니셔티브 생성', () =>
    db().from('initiatives').insert({
      milestone_id: (form.get('milestone_id') as string)?.trim() || null,
      area_id: (form.get('area_id') as string)?.trim() || null,
      title: must(form.get('title'), '제목'),
      week_of: must(form.get('week_of'), '주'),
      priority: Math.min(3, Math.max(1, Number(form.get('priority') ?? 2) || 2)),
    }),
  );
  revalidatePath('/okr');
  revalidatePath('/');
}

export async function setStatus(form: FormData) {
  const table = must(form.get('table'), '대상');
  const status = must(form.get('status'), '상태');
  if (!['objectives', 'milestones', 'initiatives'].includes(table)) throw new Error('허용되지 않은 대상');
  if (!['active', 'done', 'dropped'].includes(status)) throw new Error('허용되지 않은 상태');
  const id = must(form.get('id'), 'id');
  await run('상태 변경', () => db().from(table).update({ status }).eq('id', id));
  // 소목표 완료/취소 → 대목표의 "소목표 달성" 지표 롤업 + 물결 로그 (실패해도 상태 변경은 유지)
  if (table === 'objectives') {
    const { completeChildRollup, ensureGoalAggKR } = await import('./goal-link');
    if (status === 'done') await completeChildRollup(id);
    else {
      const { data } = await db().from('objectives').select('parent_id').eq('id', id).maybeSingle();
      if (data?.parent_id) await ensureGoalAggKR(data.parent_id).catch((e) => console.error('[goal-rollup]', e));
    }
  }
  revalidatePath('/okr');
  revalidatePath('/');
}

// ── 오늘 할일 ──
export async function createTask(form: FormData) {
  await run('할일 생성', () =>
    db().from('daily_tasks').insert({
      title: must(form.get('title'), '제목'),
      date: (form.get('date') as string)?.trim() || kstToday(),
      area_id: (form.get('area_id') as string)?.trim() || null,
      initiative_id: (form.get('initiative_id') as string)?.trim() || null,
      due_date: (form.get('due_date') as string)?.trim() || null,
      source: (form.get('initiative_id') as string)?.trim() ? 'initiative' : 'manual',
    }),
  );
  revalidatePath('/');
}

export async function toggleTask(form: FormData) {
  const id = must(form.get('id'), '할일');
  const done = form.get('done') === 'true';
  await run('할일 체크', () =>
    db().from('daily_tasks').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', id),
  );
  if (done) {
    // 체크 = 자동 로그 (만능 원자 원칙 — 실패해도 체크는 유지)
    const { data } = await db().from('daily_tasks').select('title,area_id,initiative_id').eq('id', id).maybeSingle();
    let objectiveId: string | null = null;
    if (data?.initiative_id) {
      const { data: ini } = await db().from('initiatives').select('objective_id').eq('id', data.initiative_id).maybeSingle();
      objectiveId = ini?.objective_id ?? null;
    }
    await db().from('session_logs').insert({
      task_id: id, objective_id: objectiveId, area_id: data?.area_id ?? null, kind: 'check', note: data?.title ?? null,
    });
  }
  revalidatePath('/');
  revalidatePath('/calendar');
}

// ── 습관 ──
export async function createHabit(form: FormData) {
  const cadence = form.get('cadence') === 'weekly' ? 'weekly' : 'daily';
  await run('습관 생성', () =>
    db().from('habits').insert({
      title: must(form.get('title'), '제목'),
      area_id: (form.get('area_id') as string)?.trim() || null,
      cadence,
      target_per_week: cadence === 'daily' ? 7 : Math.min(7, Math.max(1, Number(form.get('target_per_week') ?? 3) || 3)),
    }),
  );
  revalidatePath('/habits');
  revalidatePath('/');
}

export async function toggleHabitLog(form: FormData) {
  const habitId = must(form.get('habit_id'), '습관');
  const date = (form.get('date') as string)?.trim() || kstToday();
  const done = form.get('done') === 'true';
  if (done) {
    await run('습관 체크', () =>
      db().from('habit_logs').upsert({ habit_id: habitId, date, done: true }, { onConflict: 'habit_id,date' }),
    );
  } else {
    await run('습관 해제', () => db().from('habit_logs').delete().eq('habit_id', habitId).eq('date', date));
  }
  revalidatePath('/habits');
  revalidatePath('/');
}

// ── 캘린더 (v1: 앱 일정. Google 동기화는 크리덴셜 수령 후 sync_status로 밀어냄) ──
export async function createEvent(form: FormData) {
  const startsAt = must(form.get('starts_at'), '시작');
  await run('일정 생성', () =>
    db().from('calendar_events').insert({
      title: must(form.get('title'), '제목'),
      starts_at: new Date(startsAt).toISOString(),
      ends_at: (form.get('ends_at') as string)?.trim() ? new Date(form.get('ends_at') as string).toISOString() : null,
      all_day: form.get('all_day') === 'on',
      source: 'app',
      sync_status: 'pending_push', // Google 연결되면 이 상태를 보고 밀어올림
    }),
  );
  revalidatePath('/calendar');
  revalidatePath('/');
}

export async function deleteEvent(form: FormData) {
  const id = must(form.get('id'), '일정');
  const { data, error } = await db()
    .from('calendar_events').select('google_event_id').eq('id', id).eq('source', 'app').maybeSingle();
  if (error) throw new Error(`일정 조회 실패: ${error.message}`);
  if (data?.google_event_id) {
    const { deleteGoogleEvent } = await import('./google-calendar');
    await deleteGoogleEvent(data.google_event_id);
  }
  await run('일정 삭제', () => db().from('calendar_events').delete().eq('id', id).eq('source', 'app'));
  revalidatePath('/calendar');
}

// D-day 보드 핀: 달력 일정에 📌 → 홈 카운트다운 등재/해제
export async function togglePinEvent(form: FormData) {
  const id = must(form.get('id'), '일정');
  const pinned = form.get('pinned') === 'true';
  await run('핀 변경', () => db().from('calendar_events').update({ pinned }).eq('id', id));
  revalidatePath('/calendar');
  revalidatePath('/');
}

// D-day 보드 핀 (목표): 목표 상세의 📌 → 홈 카운트다운 등재/해제 (QA 6번)
export async function togglePinObjective(form: FormData) {
  const id = must(form.get('id'), '목표');
  const pinned = form.get('pinned') === 'true';
  await run('목표 핀 변경', () => db().from('objectives').update({ pinned }).eq('id', id));
  revalidatePath(`/okr/${id}`);
  revalidatePath('/okr');
  revalidatePath('/');
}

export async function syncCalendarNow() {
  const { syncCalendar } = await import('./google-calendar');
  const result = await syncCalendar(true);
  if (result.error) throw new Error(`캘린더 동기화 실패: ${result.error}`);
  revalidatePath('/calendar');
  revalidatePath('/');
}

// ── 세션 로그 (v4: 만능 원자 — 체크·한 줄 기록·회고가 한 타임라인) ──
export async function createLog(form: FormData) {
  const note = must(form.get('note'), '기록');
  await run('기록 저장', () =>
    db().from('session_logs').insert({
      objective_id: (form.get('objective_id') as string)?.trim() || null,
      area_id: (form.get('area_id') as string)?.trim() || null,
      kind: 'log',
      note,
    }),
  );
  const oid = (form.get('objective_id') as string)?.trim();
  revalidatePath(oid ? `/okr/${oid}` : '/okr');
}

export async function toggleInitiativeDone(form: FormData) {
  const id = must(form.get('id'), '할 일');
  const done = form.get('done') === 'true';
  await run('할 일 체크', () =>
    db().from('initiatives').update({ status: done ? 'done' : 'active' }).eq('id', id),
  );
  if (done) {
    // 체크 = 자동 로그 (실패해도 체크는 유지)
    const { data } = await db().from('initiatives').select('title,area_id,milestone_id').eq('id', id).maybeSingle();
    const oid = (form.get('objective_id') as string)?.trim() || null;
    await db().from('session_logs').insert({
      objective_id: oid, area_id: data?.area_id ?? null, kind: 'check', note: data?.title ?? null,
    });
  }
  const oid = (form.get('objective_id') as string)?.trim();
  revalidatePath(oid ? `/okr/${oid}` : '/okr');
  revalidatePath('/');
}

// v4 위저드 AI 초안: 목표 한 줄 → 지표(KR)·주별 계획 제안. 로컬 Ollama(무료) 우선.
// 제안만 한다 — 저장은 사용자가 검토 후 확정할 때(createGoalPlan)만 일어난다.
export type GoalSuggestion = {
  krs: { title: string; target: number; unit: string }[];
  weeks: string[];
  engine: string;
};

// 프로덕션에서 서버 액션의 throw 는 메시지가 가려진다(digest만 노출) — AI 실패는
// 사용자 잘못이 아니므로 던지지 않고 ok:false 로 돌려줘 위저드가 친절하게 안내한다.
export type GoalSuggestionResult = ({ ok: true } & GoalSuggestion) | { ok: false; message: string };

export async function suggestGoalPlan(payload: {
  title: string;
  areaName: string;
  weekCount: number;
  /** 사용자가 이미 고른 지표 — 주별 계획이 이 지표들을 향해 쓰이도록 프롬프트에 먹인다. */
  krs?: { title: string; target: number; unit: string; start?: number; cadence?: 'total' | 'weekly' }[];
}): Promise<GoalSuggestionResult> {
  const { chatCompleteJson } = await import('./llm');
  const title = payload.title.trim().slice(0, 200);
  if (!title) return { ok: false, message: '목표 제목을 먼저 써주세요.' };
  const weekCount = Math.min(12, Math.max(1, Math.floor(payload.weekCount) || 6));
  const areaName = payload.areaName.trim().slice(0, 50);
  const chosenKrs = (payload.krs ?? [])
    .filter((k) => k.title.trim() && Number.isFinite(k.target) && k.target > 0)
    .slice(0, 5)
    .map((k) => {
      const name = k.title.trim().slice(0, 30);
      const unit = k.unit.trim().slice(0, 6);
      if (k.cadence === 'weekly') return `${name} 매주 ${k.target}${unit}`;
      if (typeof k.start === 'number' && k.start > 0 && k.start !== k.target) {
        return `${name} ${k.start}${unit} → ${k.target}${unit}`; // 시작→목표 (줄이기 포함)
      }
      return `${name} ${k.target}${unit}`;
    });
  const krLine = chosenKrs.length > 0 ? `\n확정된 지표: ${chosenKrs.join(', ')}` : '';
  const weeksRule = chosenKrs.length > 0
    ? 'weeks는 정확히 요청된 주 수만큼, 각 한 줄 25자 이내 — 반드시 확정된 지표의 숫자를 주 단위로 쪼개 구체적으로(예: "주 15km + 인터벌 1회"). 뻔한 일반론 금지.'
    : 'weeks는 정확히 요청된 주 수만큼, 각 한 줄 25자 이내, 앞 주는 준비·뒷 주는 마무리 흐름으로.';

  let llm: Awaited<ReturnType<typeof chatCompleteJson>>;
  try {
    llm = await chatCompleteJson([
      {
        role: 'system',
        content:
          '너는 개인 목표 설계 코치다. 반드시 JSON 객체 하나만 출력한다. 다른 텍스트 금지. ' +
          '형식: {"krs":[{"title":"지표 이름(명사형, 15자 이내)","target":숫자,"unit":"단위(회/개/km/점 등 3자 이내)"}],"weeks":["1주차 계획 한 줄", ...]}. ' +
          `krs는 정확히 2~3개 — 숫자로 셀 수 있는 것만. ${weeksRule}`,
      },
      {
        role: 'user',
        content: `목표: "${title}"\n영역: ${areaName || '일반'}\n기간: ${weekCount}주${krLine}\n이 목표의 달성 판단 지표(krs)와 ${weekCount}주 주별 계획(weeks)을 JSON으로.`,
      },
    ]);
  } catch {
    // 배포 서버엔 로컬 Ollama가 없고 Groq 키도 없으면 여기로 온다 — 수동 입력은 멀쩡하다.
    return { ok: false, message: '지금은 AI 초안을 쓸 수 없어요. 직접 입력해도 충분해요.' };
  }
  const { content, engine, model } = llm;

  // LLM 출력은 외부 입력 — 구조를 엄격히 검증하고 넘치는 것은 자른다.
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, message: 'AI 응답을 해석하지 못했어요. 다시 시도해주세요.' };
  }
  const obj = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as {
    krs?: unknown;
    weeks?: unknown;
  };
  const krs = (Array.isArray(obj.krs) ? obj.krs : [])
    .map((k) => {
      const r = (typeof k === 'object' && k !== null ? k : {}) as Record<string, unknown>;
      // 모델이 "30km"처럼 단위를 섞어 반환하기도 한다 — 숫자만 관대하게 추출
      const target = Number(String(r.target ?? '').match(/\d+(?:\.\d+)?/)?.[0]);
      return {
        title: String(r.title ?? '').trim().slice(0, 30),
        target: Number.isFinite(target) && target > 0 ? target : 0,
        unit: String(r.unit ?? '').trim().slice(0, 6),
      };
    })
    .filter((k) => k.title && k.target > 0)
    .slice(0, 3);
  const weeks = (Array.isArray(obj.weeks) ? obj.weeks : [])
    // UI가 이미 "N주" 라벨을 붙이므로 모델이 넣은 "1주차:" 접두어는 중복 — 제거
    .map((w) => String(w ?? '').trim().replace(/^(\d+\s*주차?|주\s*\d+)\s*[:：)-]?\s*/, '').slice(0, 60))
    .slice(0, weekCount);
  // 지표·주별 계획 중 하나라도 건졌으면 성공 — 유령 초안(주별만 쓰는 쪽)이 지표 파싱 실패에 볼모 잡히지 않게.
  if (krs.length === 0 && weeks.length === 0) return { ok: false, message: '쓸 만한 제안이 안 나왔어요. 다시 시도해주세요.' };
  return { ok: true, krs, weeks, engine: engine === 'ollama' ? `로컬 AI(${model})` : `Groq(${model})` };
}

// 확정 전 지표 검토 (QA): 사용자가 자유 입력한 지표("주당 러닝 30km", 시작 "지금 5km")를
// AI가 구조화·정돈한다. 실패하면 ok:false — 호출부는 로컬 파싱으로 조용히 진행한다.
export type NormalizedKr = { title: string; target: number; unit: string; start?: number; cadence: 'total' | 'weekly' };

export async function normalizeKrDrafts(payload: {
  goalTitle: string;
  krs: { title: string; target: string; start?: string; weekly?: boolean }[];
}): Promise<{ ok: true; krs: NormalizedKr[] } | { ok: false }> {
  const { chatCompleteJson } = await import('./llm');
  const items = (payload.krs ?? [])
    .slice(0, 5)
    .map((k) => ({
      title: String(k.title ?? '').trim().slice(0, 40),
      target: String(k.target ?? '').trim().slice(0, 30),
      start: String(k.start ?? '').trim().slice(0, 30),
      weekly: !!k.weekly,
    }))
    .filter((k) => k.title && k.target);
  if (items.length === 0) return { ok: false };

  const lines = items
    .map((k, i) => `${i + 1}. 이름: "${k.title}" / 목표 입력: "${k.target}"${k.start ? ` / 시작 입력: "${k.start}"` : ''}${k.weekly ? ' / 매주 반복' : ''}`)
    .join('\n');

  let content = '';
  try {
    const r = await chatCompleteJson(
      [
        {
          role: 'system',
          content:
            '너는 목표 지표 정리 도우미다. 사용자가 자유롭게 쓴 지표에서 숫자 목표(target)·단위(unit)·시작값(start)을 뽑아 정리한다. ' +
            '반드시 JSON 객체 하나만 출력: {"krs":[{"title":"지표 이름(간결한 명사형)","target":숫자,"unit":"단위(3자 이내, 없으면 빈 문자열)","start":숫자또는null}]}. ' +
            '입력 순서 그대로, 같은 개수로. 의미를 바꾸거나 새 지표를 만들지 마라. 단위가 이름에 섞여 있으면 unit으로 옮겨라.',
        },
        { role: 'user', content: `목표: "${payload.goalTitle.trim().slice(0, 200)}"\n지표들:\n${lines}` },
      ],
      20_000,
    );
    content = r.content;
  } catch {
    return { ok: false };
  }

  // LLM 출력은 외부 입력 — 엄격 검증, 개수 불일치·이상값이면 통째로 포기한다.
  try {
    const obj = JSON.parse(content) as { krs?: unknown };
    const arr = Array.isArray(obj.krs) ? obj.krs : [];
    if (arr.length !== items.length) return { ok: false };
    const krs: NormalizedKr[] = arr.map((k, i) => {
      const r = (typeof k === 'object' && k !== null ? k : {}) as Record<string, unknown>;
      const target = Number(String(r.target ?? '').match(/\d+(?:\.\d+)?/)?.[0]);
      const start = Number(String(r.start ?? '').match(/\d+(?:\.\d+)?/)?.[0]);
      return {
        title: (String(r.title ?? '').trim() || items[i].title).slice(0, 30),
        target: Number.isFinite(target) && target > 0 ? target : 0,
        unit: String(r.unit ?? '').trim().slice(0, 6),
        start: Number.isFinite(start) && start > 0 ? start : undefined,
        cadence: items[i].weekly ? 'weekly' : 'total',
      };
    });
    if (krs.some((k) => !k.title || k.target <= 0)) return { ok: false };
    return { ok: true, krs };
  } catch {
    return { ok: false };
  }
}

// 계열화 제안: 위저드 검토 단계에서 호출 — 같은 영역의 최상위 활성 목표 중 대목표 후보를 AI가 고른다.
// 2단 트리로 제한(소목표 아래 또 소목표 금지) — 후보는 parent_id 없는 목표만.
export async function suggestParentGoal(payload: {
  title: string;
  areaId: string;
  dueDate: string | null;
}) {
  const { suggestParent } = await import('./goal-link');
  const { data, error } = await db()
    .from('objectives').select('id,title,due_date')
    .eq('area_id', payload.areaId).eq('status', 'active').is('parent_id', null)
    .order('created_at').limit(10);
  if (error) throw new Error(`대목표 후보 조회 실패: ${error.message}`);
  return suggestParent(
    { title: payload.title, dueDate: payload.dueDate },
    (data ?? []).map((o) => ({ id: o.id, title: o.title, dueDate: o.due_date })),
  );
}

// v4 목표 생성 위저드 확정: Objective + KR들 + 주별 계획을 한 번에 저장
// parentId가 오면 소목표로 연결하고 대목표의 "소목표 달성" 지표를 자동 생성·갱신 (계열화)
export async function createGoalPlan(payload: {
  areaId: string;
  title: string;
  dueDate: string | null;
  krs: { title: string; target: number; unit: string; start?: number; cadence?: 'total' | 'weekly' }[];
  weeks: { weekOf: string; title: string }[];
  parentId?: string | null;
}) {
  if (!payload.title.trim()) throw new Error('목표 제목이 비어 있습니다');
  const { data: obj, error } = await db()
    .from('objectives')
    .insert({
      area_id: payload.areaId,
      title: payload.title.trim().slice(0, 200),
      period: kstQuarter(),
      due_date: payload.dueDate,
      parent_id: payload.parentId ?? null,
    })
    .select('id')
    .single();
  if (error || !obj) throw new Error(`목표 생성 실패: ${error?.message}`);
  if (payload.parentId) {
    const { ensureGoalAggKR } = await import('./goal-link');
    await ensureGoalAggKR(payload.parentId).catch((e) => console.error('[goal-rollup]', e));
  }

  const krRows = payload.krs
    .filter((k) => k.title.trim() && Number.isFinite(k.target) && k.target > 0)
    .map((k) => {
      const cadence = k.cadence === 'weekly' ? 'weekly' : 'total';
      const start = cadence === 'total' && Number.isFinite(k.start) && (k.start as number) >= 0 ? (k.start as number) : 0;
      return {
        objective_id: obj.id,
        title: k.title.trim().slice(0, 200),
        target_value: k.target,
        unit: k.unit.trim().slice(0, 20),
        source: 'manual' as const,
        start_value: start,
        // 시작값이 있으면 현재값도 거기서 출발 — 진행률 (현재-시작)/(목표-시작)이 0%부터 시작하게
        current_value: start,
        cadence,
      };
    });
  if (krRows.length > 0) {
    const { error: krErr } = await db().from('key_results').insert(krRows);
    if (krErr) throw new Error(`지표 생성 실패: ${krErr.message}`);
  }

  const iniRows = payload.weeks
    .filter((w) => w.title.trim())
    .map((w) => ({
      area_id: payload.areaId,
      objective_id: obj.id,
      milestone_id: null,
      title: w.title.trim().slice(0, 300),
      week_of: w.weekOf,
      priority: 2,
    }));
  if (iniRows.length > 0) {
    const { error: iniErr } = await db().from('initiatives').insert(iniRows);
    if (iniErr) throw new Error(`주별 계획 생성 실패: ${iniErr.message}`);
  }
  revalidatePath('/okr');
  return obj.id as string;
}

// ── 공고 파이프라인 (job_applications 연동): 버튼 → job_commands 큐 + 로컬 stage 즉시 반영 ──
const JOB_ACTION_STAGE: Record<string, string> = {
  promote: '지원예정',
  submitted: '제출완료',
  rejected: '미지원',
};

export async function sendJobCommand(form: FormData) {
  const action = must(form.get('action'), '동작');
  if (!(action in JOB_ACTION_STAGE)) throw new Error('허용되지 않은 동작');
  const postingId = must(form.get('posting_id'), '공고');
  const url = (form.get('url') as string)?.trim() || null;
  const company = (form.get('company') as string)?.trim() || null;
  // 로컬 실행기(apply_commands.py)가 다음 크롤 때 폴더를 옮긴다
  await run('명령 큐 등록', () => db().from('job_commands').insert({ action, url, company }));
  // 앱 화면은 즉시 반영 (원본 폴더 이동은 비동기)
  await run('공고 상태 갱신', () => db().from('job_postings').update({ stage: JOB_ACTION_STAGE[action] }).eq('id', postingId));
  revalidatePath('/jobs');
  revalidatePath('/calendar');
}

// ── 저녁 마감 ──
export async function saveReview(form: FormData) {
  const date = (form.get('date') as string)?.trim() || kstToday();
  const note = (form.get('note') as string)?.trim() || null;
  const checked = Number(form.get('checked_count') ?? 0) || 0;
  await run('회고 저장', () =>
    db().from('daily_reviews').upsert({ date, note, checked_count: checked }, { onConflict: 'date' }),
  );
  revalidatePath('/close');
}
