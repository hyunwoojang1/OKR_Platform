import 'server-only';
import { db } from './db';

/**
 * 지표 숫자를 움직이는 유일한 통로와, 그 정확한 역연산.
 *
 * 왜 한 곳으로 모으나 — 2026-08-27 감사에서 5/5 재현된 사고:
 *   마감 완료를 되돌려도 지표가 안 내려갔다. 완료↔해제를 세 번 하면 지표가 4까지 갔다.
 *   올리는 코드와 내리는 코드가 서로 다른 파일, 다른 축으로 짜여 있어서
 *   짝이 안 맞는 걸 눈으로 잡을 수가 없었다. 같은 산수를 다섯 곳이 제각각 다시 쓰고 있었다.
 *
 * 이 파일의 불변식 둘:
 *   ① 기록(session_logs)이 사라질 때는 반드시 지표가 같은 양만큼 되돌아간다.
 *   ② 기록을 지우는 건 사용자의 "되돌리기"뿐이다.
 *      그 외의 삭제(지표 삭제·일정 삭제)는 참조만 끊고 기록은 남긴다.
 *
 * 지표 증감은 DB 함수 kr_add(013)를 쓴다. 읽고-더하고-쓰기를 하면 동시에 들어온 두 요청이
 * 같은 값을 읽고 같은 값을 써서 하나가 사라진다(실제로 "기록은 2건인데 숫자는 1"이 났다).
 */

export type KrCredit = {
  krId: string;
  /** sum 이면 더할 양, set 이면 새로 갈아끼울 값 */
  delta: number;
  /** 'sum' 누적 / 'set' 측정값 갈아끼우기 (014) */
  accrual?: 'sum' | 'set';
  note: string;
  objectiveId?: string | null;
  taskId?: string | null;
  eventId?: string | null;
  initiativeId?: string | null;
  /** 내용형은 적은 글이 본문이라 metrics 를 안 남긴다 — 되돌릴 때 step 으로 계산한다. */
  textMode?: boolean;
  unit?: string;
};

/** 지표를 움직이고 그 근거 기록을 남긴다. 이 함수 밖에서 current_value 를 만지지 않는다. */
export async function creditKr(c: KrCredit): Promise<{ logId: string }> {
  const set = c.accrual === 'set';

  // 갈아끼우는 지표는 되돌릴 때 '이전 값'이 있어야 한다. 지금 값을 먼저 읽어 기록에 같이 남긴다.
  let before = 0;
  if (set) {
    const { data: cur, error: curErr } = await db()
      .from('key_results').select('current_value').eq('id', c.krId).maybeSingle();
    if (curErr) throw new Error(`지표 조회 실패: ${curErr.message}`);
    before = Number(cur?.current_value ?? 0);
    const { error: setErr } = await db()
      .from('key_results').update({ current_value: c.delta }).eq('id', c.krId);
    if (setErr) throw new Error(`지표 반영 실패: ${setErr.message}`);
  } else {
    const { error: addErr } = await db().rpc('kr_add', { p_id: c.krId, p_delta: c.delta });
    if (addErr) throw new Error(`지표 반영 실패: ${addErr.message}`);
  }

  const { data, error } = await db().from('session_logs').insert({
    objective_id: c.objectiveId ?? null,
    key_result_id: c.krId,
    task_id: c.taskId ?? null,
    event_id: c.eventId ?? null,
    initiative_id: c.initiativeId ?? null,
    kind: 'check',
    note: c.note,
    // set 형은 [새 값, 이전 값] 두 개를 남긴다 — 두 번째가 되돌리기의 근거다.
    metrics: c.textMode ? null
      : set ? [{ v: c.delta, u: c.unit ?? '' }, { v: before, u: 'prev' }]
        : [{ v: c.delta, u: c.unit ?? '' }],
  }).select('id').single();

  if (error) {
    // 지표만 움직이고 되돌릴 근거가 없는 상태를 만들지 않는다.
    // 이 되돌리기마저 실패하면 그건 조용히 넘길 일이 아니라 로그로 남긴다.
    if (set) {
      const { error: backErr } = await db()
        .from('key_results').update({ current_value: before }).eq('id', c.krId);
      if (backErr) console.error('[kr-ledger] 값 되돌리기 실패:', backErr.message, c.krId);
    } else {
      const { error: backErr } = await db().rpc('kr_add', { p_id: c.krId, p_delta: -c.delta });
      if (backErr) console.error('[kr-ledger] 값 되돌리기 실패:', backErr.message, c.krId);
    }
    throw new Error(`기록 남기기 실패: ${error.message}`);
  }
  return { logId: data.id };
}

/** creditKr 한 건의 정확한 역연산 — 올린 만큼 되돌리고 기록을 지운다. */
export async function revertKrLog(logId: string): Promise<void> {
  const { data: log, error } = await db()
    .from('session_logs').select('id,key_result_id,metrics').eq('id', logId).maybeSingle();
  if (error) throw new Error(`기록 조회 실패: ${error.message}`);
  if (!log) return;                     // 이미 없으면 할 일이 없다
  await revertOne(log as LogRow);
}

type LogRow = { id: string; key_result_id: string | null; metrics: { v: number; u: string }[] | null };

async function revertOne(log: LogRow): Promise<void> {
  if (log.key_result_id) {
    const { data: kr, error: krErr } = await db()
      .from('key_results').select('step,input_mode,accrual').eq('id', log.key_result_id).maybeSingle();
    // 조회가 실패했으면 지우지 않는다 — 지표는 그대로인데 근거만 사라지는 게 최악이다.
    if (krErr) throw new Error(`지표 조회 실패: ${krErr.message}`);
    if (kr) {
      const prev = log.metrics?.find((m) => m.u === 'prev');
      if (kr.accrual === 'set') {
        // 갈아끼운 지표는 '뺀다'가 성립하지 않는다. 그때 적어둔 이전 값으로 되돌린다.
        if (prev) {
          const { error: setErr } = await db()
            .from('key_results').update({ current_value: prev.v }).eq('id', log.key_result_id);
          if (setErr) throw new Error(`지표 되돌리기 실패: ${setErr.message}`);
        }
        // prev 가 없으면 014 이전에 남은 옛 기록이다 — 값을 함부로 흔들지 않고 기록만 지운다.
      } else {
        const fallback = Number(kr.step) || 1;
        const back = kr.input_mode === 'text' ? fallback : (log.metrics?.[0]?.v ?? fallback);
        const { error: addErr } = await db().rpc('kr_add', { p_id: log.key_result_id, p_delta: -back });
        if (addErr) throw new Error(`지표 되돌리기 실패: ${addErr.message}`);
      }
    }
    // kr 이 null 이면 지표가 이미 지워진 것 — 013 이후 기록은 남고 참조만 끊긴다. 로그만 치운다.
  }
  const { error: delErr } = await db().from('session_logs').delete().eq('id', log.id);
  if (delErr) throw new Error(`기록 삭제 실패: ${delErr.message}`);
}

/**
 * 어떤 출처에서 나온 기록을 통째로 되돌린다 (일정 되돌리기·할일 삭제용).
 * 지표가 안 걸린 기록은 값을 건드릴 게 없으므로 그냥 지운다.
 */
export async function revertKrLogsWhere(
  where: { eventId?: string; taskId?: string; initiativeId?: string },
): Promise<number> {
  let q = db().from('session_logs').select('id,key_result_id,metrics');
  if (where.eventId) q = q.eq('event_id', where.eventId);
  else if (where.taskId) q = q.eq('task_id', where.taskId);
  else if (where.initiativeId) q = q.eq('initiative_id', where.initiativeId);
  else throw new Error('되돌릴 출처를 지정해야 합니다');

  const { data, error } = await q;
  if (error) throw new Error(`기록 조회 실패: ${error.message}`);
  for (const log of (data ?? []) as LogRow[]) await revertOne(log);
  return (data ?? []).length;
}
