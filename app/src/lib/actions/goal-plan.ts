'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { kstQuarter, kstMonday } from '../types';
import { must, run } from '../form';

/**
 * 목표 만들기 마법사 — AI 초안 제안과 확정 저장. 프롬프트가 길어 따로 둔다.
 */

// v4 위저드 AI 초안: 목표 한 줄 → 지표(KR)·주별 계획 제안. 로컬 Ollama(무료) 우선.
// 제안만 한다 — 저장은 사용자가 검토 후 확정할 때(createGoalPlan)만 일어난다.
/**
 * 모델이 붙이는 "1주차:" 같은 접두어 — 화면이 이미 "N주" 라벨을 다니까 중복이라 떼어낸다.
 * (?![가-힣]) 가 핵심: 이게 없으면 "7주간 계획"의 '7주'와 "주 3회 러닝"의 '주 3'까지
 * 접두어로 오인해 "간 계획", "회 러닝"으로 잘라먹는다.
 */
const WEEK_PREFIX = /^[\[(（【]?\s*(?:week\s*)?(?:\d+\s*주\s*차?|주\s*\d+|week\s*\d+)(?![가-힣])\s*[\])）】]?\s*[:：)\-–·]?\s*/i;

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
  krs?: { title: string; target: number; unit: string; start?: number; cadence?: 'total' | 'weekly'; mode?: 'check' | 'number' | 'text' }[];
}): Promise<GoalSuggestionResult> {
  const { chatCompleteJson } = await import('../llm');
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
    .map((w) => String(w ?? '').trim().replace(WEEK_PREFIX, '').slice(0, 60))
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
  const { chatCompleteJson } = await import('../llm');
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
  const { suggestParent } = await import('../goal-link');
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
  krs: { title: string; target: number; unit: string; start?: number; cadence?: 'total' | 'weekly'; mode?: 'check' | 'number' | 'text' }[];
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
    const { ensureGoalAggKR } = await import('../goal-link');
    await ensureGoalAggKR(payload.parentId).catch((e) => console.error('[goal-rollup]', e));
  }

  const krRows = payload.krs
    // 내용형은 목표 개수 없이도 성립한다 — 적은 게 기록으로 쌓이는 게 목적인 지표가 있다.
    .filter((k) => k.title.trim() && (k.mode === 'text' || (Number.isFinite(k.target) && k.target > 0)))
    .map((k) => {
      const cadence = k.cadence === 'weekly' ? 'weekly' : 'total';
      const start = cadence === 'total' && Number.isFinite(k.start) && (k.start as number) >= 0 ? (k.start as number) : 0;
      return {
        objective_id: obj.id,
        title: k.title.trim().slice(0, 200),
        target_value: Number.isFinite(k.target) && k.target > 0 ? k.target : null,
        unit: k.unit.trim().slice(0, 20),
        source: 'manual' as const,
        start_value: start,
        // 시작값이 있으면 현재값도 거기서 출발 — 진행률 (현재-시작)/(목표-시작)이 0%부터 시작하게
        current_value: start,
        cadence,
        input_mode: k.mode ?? 'number',
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

// ── 목표 편집 (한 페이지에서 제목·기한·지표·주간계획을 한 번에 저장) ──
// 원칙: 지표는 id로 맞춰 갱신하고, 화면에서 사라진 지표만 삭제한다.
// 진행값(current_value)은 건드리지 않는다 — 그건 매일 쌓는 실적이라 편집의 몫이 아니다.
export async function updateGoalPlan(payload: {
  id: string;
  areaId: string;
  title: string;
  dueDate: string | null;
  krs: { id?: string; title: string; target: number; unit: string; start?: number; cadence?: 'total' | 'weekly'; mode?: 'check' | 'number' | 'text' }[];
  weeks: { weekOf: string; title: string }[];
}) {
  const id = must(payload.id, '목표');
  if (!payload.title.trim()) throw new Error('목표 제목이 비어 있습니다');

  await run('목표 수정', () =>
    db().from('objectives').update({
      area_id: payload.areaId,
      title: payload.title.trim().slice(0, 200),
      due_date: payload.dueDate,
    }).eq('id', id),
  );

  const { data: existingRows, error: exErr } = await db().from('key_results').select('id,current_value').eq('objective_id', id);
  if (exErr) throw new Error(`지표 조회 실패: ${exErr.message}`);
  const existing = new Map((existingRows ?? []).map((r) => [r.id as string, Number(r.current_value)]));

  const valid = payload.krs.filter((k) => k.title.trim() && (k.mode === 'text' || (Number.isFinite(k.target) && k.target > 0)));
  const keptIds = new Set<string>();

  for (const k of valid) {
    const cadence = k.cadence === 'weekly' ? 'weekly' : 'total';
    const start = cadence === 'total' && Number.isFinite(k.start) && (k.start as number) >= 0 ? (k.start as number) : 0;
    const base = {
      title: k.title.trim().slice(0, 200),
      // 내용형은 목표 개수가 없어도 성립한다 — 그때는 null로 두고 진행률 대신 기록만 쌓는다.
      target_value: k.target > 0 ? k.target : null,
      unit: k.unit.trim().slice(0, 20),
      start_value: start,
      cadence,
      input_mode: k.mode ?? 'number',
    };
    if (k.id && existing.has(k.id)) {
      keptIds.add(k.id);
      await run('지표 수정', () => db().from('key_results').update(base).eq('id', k.id!));
    } else {
      await run('지표 추가', () =>
        db().from('key_results').insert({ ...base, objective_id: id, source: 'manual' as const, current_value: start }),
      );
    }
  }

  const removed = [...existing.keys()].filter((eid) => !keptIds.has(eid));
  if (removed.length > 0) {
    // 지표만 지운다. session_logs(러닝 기록 등)는 활동 기록이라 그대로 남긴다.
    await run('지표 삭제', () => db().from('key_results').delete().in('id', removed));
  }

  // 주간 계획: 이번 주 이후만 갈아끼운다(지난 주 기록은 보존).
  const monday = kstMonday();
  const { error: delErr } = await db().from('initiatives').delete().eq('objective_id', id).gte('week_of', monday);
  if (delErr) throw new Error(`주간 계획 정리 실패: ${delErr.message}`);
  const iniRows = payload.weeks
    .filter((w) => w.title.trim() && w.weekOf >= monday)
    .map((w) => ({
      area_id: payload.areaId,
      objective_id: id,
      milestone_id: null,
      title: w.title.trim().slice(0, 300),
      week_of: w.weekOf,
      priority: 2,
    }));
  if (iniRows.length > 0) {
    const { error: iniErr } = await db().from('initiatives').insert(iniRows);
    if (iniErr) throw new Error(`주간 계획 저장 실패: ${iniErr.message}`);
  }

  revalidatePath('/okr');
  revalidatePath(`/okr/${id}`);
  revalidatePath('/');
  return id;
}
