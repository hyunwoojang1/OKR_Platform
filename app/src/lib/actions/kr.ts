'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { must, run } from '../form';

/**
 * 지표를 만들고 기록하는 것들. 숫자를 실제로 움직이는 산수는 kr-ledger.ts 에만 있다.
 */

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
  const { syncAutoKRs } = await import('../kr-sync');
  await syncAutoKRs();
  revalidatePath('/okr');
  revalidatePath('/');
}

export async function updateKRProgress(form: FormData) {
  const id = must(form.get('id'), 'KR');
  const raw = must(form.get('current_value'), '현재값');

  // 페이스는 6:16처럼 적는 게 자연스럽다 — 저장은 소수 분으로, 입력은 둘 다 받는다.
  const { data: kr } = await db().from('key_results').select('title').eq('id', id).maybeSingle();
  const { isPaceKr, parsePace } = await import('../types');
  let value: number | null;
  if (kr && isPaceKr(kr as { title: string })) {
    value = parsePace(raw);
    if (value == null) throw new Error('페이스는 6:16 처럼 적어주세요');
  } else {
    value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error('현재값이 올바르지 않습니다');
  }

  await run('KR 갱신', () => db().from('key_results').update({ current_value: value }).eq('id', id));
  revalidatePath('/okr');
  revalidatePath('/');
}

/**
 * 오늘 할일에서 지표를 한 번 해냈다고 찍는다 — "체크 = 기록 = 지표"의 실행부.
 *
 * 지금까지 체크는 할일 목록에만 남고 지표는 손으로 고쳐야 해서 진척률이 0%에 멈춰 있었다.
 * 여기서 지표를 올리고 기록도 같이 남긴다. 무엇을 받을지는 지표의 input_mode가 정한다.
 *   check  — 받는 것 없음, step(보통 1)만큼
 *   number — 사용자가 적은 숫자만큼
 *   text   — 1만큼 오르고, 적은 내용이 기록으로 남아 나중에 되짚을 수 있다
 */
export async function logKrProgress(form: FormData) {
  const id = must(form.get('id'), '지표');
  const rawAmount = ((form.get('amount') as string) ?? '').trim();
  const note = ((form.get('note') as string) ?? '').trim().slice(0, 300);

  const { data: kr, error } = await db()
    .from('key_results')
    .select('id,title,unit,current_value,objective_id,input_mode,step,cadence,source,accrual')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`지표 조회 실패: ${error.message}`);
  if (!kr) throw new Error('지표를 찾을 수 없습니다');
  // 자동으로 세는 지표는 손으로 올려봐야 다음 동기화가 덮어쓴다.
  // "분명 체크했는데 왜 원래대로 돌아갔지"가 되므로, 아예 받지 않고 이유를 말한다.
  if (kr.source !== 'manual') {
    throw new Error(`'${kr.title}'은(는) 자동으로 세는 지표예요. 루틴을 체크하면 따라 올라갑니다`);
  }

  const isSet = kr.accrual === 'set';
  let delta = Number(kr.step) || 1;
  if (kr.input_mode === 'number') {
    const { parsePace, isPaceKr } = await import('../types');
    const parsed = isPaceKr(kr as { title: string }) ? parsePace(rawAmount) : Number(rawAmount);
    if (parsed == null || !Number.isFinite(parsed) || parsed <= 0) {
      // 재서 적는 지표는 "얼마나 더"가 아니라 "지금 얼마"를 묻는 것이라 말도 그렇게 한다.
      throw new Error(isSet ? '지금 값을 숫자로 적어주세요' : '얼마나 했는지 숫자로 적어주세요');
    }
    delta = parsed;
  } else if (kr.input_mode === 'text' && !note) {
    throw new Error('무엇을 했는지 적어주세요');
  }

  /*
     갈아끼우기 — 노션이 세어주는 코테처럼 '오늘 총 몇 개'가 들어오는 지표.
     그냥 더하면 5문제 뒤에 8을 넣었을 때 13이 된다. 오늘 것만 먼저 물리고 새 값을 얹는다.
     어제 것은 안 건드리므로 이번 주 누적은 그대로 이어진다.
  */
  if (form.get('replace_today') === 'true') {
    const { revertKrLogsToday } = await import('../kr-ledger');
    await revertKrLogsToday(kr.id);
  }

  // 지표를 올리고 기록을 남기는 건 원장 한 곳에서만 한다.
  // 기록은 내용형에서 "언제 어디 지원했는지"를 되짚는 근거이기도 하다.
  const body = note || `${kr.title} ${delta}${kr.unit ?? ''}`;
  const { creditKr } = await import('../kr-ledger');
  await creditKr({
    krId: kr.id,
    delta,
    accrual: isSet ? 'set' : 'sum',
    note: body,
    objectiveId: kr.objective_id,
    unit: kr.unit || '',
    textMode: kr.input_mode === 'text',
  });

  revalidatePath('/');
  revalidatePath('/okr');
  if (kr.objective_id) revalidatePath(`/okr/${kr.objective_id}`);
}

/** 방금 찍은 걸 되돌린다 — 지표에서 빼고 기록도 지운다. */
export async function undoKrProgress(form: FormData) {
  const logId = must(form.get('log_id'), '기록');
  const { data: log, error } = await db()
    .from('session_logs').select('id,objective_id,key_result_id').eq('id', logId).maybeSingle();
  if (error) throw new Error(`기록 조회 실패: ${error.message}`);
  if (!log?.key_result_id) throw new Error('되돌릴 기록이 없습니다');

  // 되돌리는 산수는 원장 한 곳에만 있다 — 올리는 쪽과 짝이 어긋나지 않게.
  const { revertKrLog } = await import('../kr-ledger');
  await revertKrLog(logId);

  revalidatePath('/');
  revalidatePath('/okr');
  if (log.objective_id) revalidatePath(`/okr/${log.objective_id}`);
}

/**
 * 주 1회 재는 숫자(몸무게 등)를 홈에서 바로 적는다.
 * 목표 화면 깊숙이 들어가야만 고칠 수 있어서 아무도 안 적던 값을, 재는 김에 남기게 하는 통로.
 * 지표를 갱신하면서 기록도 함께 남긴다 — 지표는 지금 값만 알고 지난주 값을 모르기 때문.
 */
export async function recordWeeklyMetric(form: FormData) {
  const id = must(form.get('id'), '지표');
  const value = Number(must(form.get('value'), '값'));
  if (!Number.isFinite(value) || value <= 0) throw new Error('숫자를 다시 확인해주세요');

  const { data: kr, error } = await db()
    .from('key_results').select('title,unit,current_value,objective_id').eq('id', id).maybeSingle();
  if (error) throw new Error(`지표 조회 실패: ${error.message}`);
  if (!kr) throw new Error('지표를 찾을 수 없습니다');

  await run('지표 기록', () => db().from('key_results').update({ current_value: value }).eq('id', id));
  await run('기록 남기기', () =>
    db().from('session_logs').insert({
      objective_id: kr.objective_id,
      kind: 'log',
      note: `${kr.title} ${value}${kr.unit}`,
      metrics: [{ v: value, u: kr.unit || '' }],
    }),
  );
  revalidatePath('/');
  revalidatePath('/okr');
}

/** 잘못 남은 기록 한 줄 지우기. */
export async function deleteLog(form: FormData) {
  const id = must(form.get('id'), '기록');
  const back = (form.get('redirect') as string)?.trim();
  await run('기록 삭제', () => db().from('session_logs').delete().eq('id', id));
  revalidatePath('/');
  revalidatePath('/calendar');
  if (back) revalidatePath(back);
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

/**
 * 지표를 지운다 — "이제 이건 안 잰다"는 뜻이다.
 *
 * 그동안 쌓인 기록은 남긴다(사용자 확인, 2026-08-27). 013에서 기록↔지표 연결을
 * 끊기만 하도록 바꿔둬서, 지표가 사라져도 "8월 27일 우리자산운용 제출" 같은 줄은
 * 타임라인에 그대로 있다. 한 일은 한 일이다.
 */
export async function deleteKeyResult(form: FormData) {
  const id = must(form.get('id'), '지표');
  const { data: kr, error } = await db()
    .from('key_results').select('id,title,objective_id').eq('id', id).maybeSingle();
  if (error) throw new Error(`지표 조회 실패: ${error.message}`);
  if (!kr) return;                      // 이미 없으면 할 일이 없다

  await run('지표 삭제', () => db().from('key_results').delete().eq('id', id));
  revalidatePath('/');
  revalidatePath('/okr');
  if (kr.objective_id) revalidatePath(`/okr/${kr.objective_id}`);
}

/**
 * 노션 「푼 문제」에서 오늘 푼 개수를 가져온다 — 오늘 할일의 코테 줄 버튼.
 *
 * 지표 값은 여기서 안 건드린다(writeKr:false). 숫자를 칸에 넣어주기만 하고,
 * 실제 기록은 사용자가 '기록'을 눌러 원장을 거친다 — 되돌릴 근거가 남아야 하기 때문이다.
 * 밤 10시 크론은 같은 함수를 writeKr:true 로 돌려 사람이 안 눌러도 값이 맞게 한다.
 *
 * 프로덕션에서 throw 는 digest 로 가려지므로 던지지 않고 한국어 문장을 돌려준다.
 */
export async function pullCodingFromNotion(): Promise<
  { ok: true; today: number; thisWeek: number; filled: number } | { ok: false; message: string }
> {
  try {
    const { runCodingIngest } = await import('../coding-ingest');
    const r = await runCodingIngest({ writeKr: false });
    revalidatePath('/');
    return { ok: true, today: r.today, thisWeek: r.thisWeek, filled: r.filled.length };
  } catch (e) {
    console.error('[pullCodingFromNotion]', e);
    const raw = e instanceof Error ? e.message : '';
    return {
      ok: false,
      message: /Notion 401|unauthorized/i.test(raw)
        ? '노션 연결이 끊겼어요. 토큰을 다시 확인해 주세요'
        : /NOTION_CODING_DS_ID|연결돼 있지 않/.test(raw)
          ? '노션 표가 연결돼 있지 않아요'
          : '노션에서 못 가져왔어요. 잠시 뒤 다시 눌러보세요',
    };
  }
}
