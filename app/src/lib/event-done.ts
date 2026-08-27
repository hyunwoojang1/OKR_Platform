import 'server-only';
import { db } from './db';
import { kstToday } from './types';
import { creditKr, revertKrLogsWhere } from './kr-ledger';

/**
 * 달력 마감의 "다 했음"과 그 역연산. 둘은 항상 이 파일에서 나란히 산다.
 *
 *   apply                                revert
 *   ───────────────────────────────────  ──────────────────────────────────────
 *   ① calendar_events.done_at = now()    ①' done_at = null
 *   ② daily_tasks 한 줄 (완료된 채로)      ②' 그 할일 삭제
 *   ③ 지표 +step & 기록(event_id 붙임)     ③' event_id 로 찾아 지표까지 되돌림
 *   ③' 지표가 없으면 기록만 (event_id)      ③'' 같은 경로로 지워짐
 *
 * 효과를 하나 늘리면 아래 revert 에도 한 줄이 늘어야 한다.
 * 예전엔 이 둘이 60줄 떨어진 서로 다른 축으로 짜여 있어서, 완료가 네 곳을 움직이는데
 * 되돌리기는 두 곳만 되돌리는 걸 눈으로 못 잡았다(5/5 재현).
 * 되돌리기가 기록을 task_id 로 찾았는데 지표 기록에는 task_id 가 안 붙어서 애초에 안 걸렸다.
 */
export const eventDone = {
  /**
   * 완료 처리. 이미 완료된 일정이면 아무것도 하지 않는다.
   *
   * 멱등성은 조건부 UPDATE 한 번으로 얻는다 — done_at 이 비어 있을 때만 채우고,
   * 0행이 돌아오면 남이 먼저 했다는 뜻이니 조용히 끝낸다.
   * 코드의 `if (!exists)` 로는 동시에 들어온 두 요청을 못 막는다(할일 2건·기록 2건 재현).
   */
  async apply(eventId: string): Promise<void> {
    const { data: locked, error } = await db()
      .from('calendar_events')
      .update({ done_at: new Date().toISOString() })
      .eq('id', eventId)
      .is('done_at', null)
      .select('id,title,key_result_id')
      .maybeSingle();
    if (error) throw new Error(`일정 완료 실패: ${error.message}`);
    if (!locked) return;                  // 이미 완료됨 — 두 번째 요청은 여기서 끝난다

    try {
      const today = kstToday();
      const { data: full } = await db()
        .from('calendar_events').select('starts_at,objective_id:key_result_id').eq('id', eventId).maybeSingle();
      const dueDate = full
        ? new Date(new Date((full as { starts_at: string }).starts_at).getTime() + 9 * 3600_000)
          .toISOString().slice(0, 10)
        : today;

      // ② 오늘 할일에 완료된 채로. (source_ref, date) 유니크라 중복이 DB에서 막힌다(013).
      const { data: task, error: taskErr } = await db().from('daily_tasks').insert({
        title: locked.title,
        date: today,
        done: true,
        done_at: new Date().toISOString(),
        due_date: dueDate,
        source: 'job_posting',
        source_ref: eventId,
        key_result_id: locked.key_result_id,
      }).select('id').single();
      if (taskErr) throw new Error(`오늘 할일 등재 실패: ${taskErr.message}`);

      // ③ 지표가 걸려 있으면 올리고, 없으면 기록만. 어느 쪽이든 event_id 를 남긴다.
      if (locked.key_result_id) {
        const { data: kr, error: krErr } = await db()
          .from('key_results').select('id,unit,objective_id,step,input_mode').eq('id', locked.key_result_id).maybeSingle();
        if (krErr) throw new Error(`지표 조회 실패: ${krErr.message}`);
        if (kr) {
          await creditKr({
            krId: kr.id,
            delta: Number(kr.step) || 1,
            note: locked.title,
            objectiveId: kr.objective_id,
            taskId: task.id,
            eventId,
            unit: kr.unit || '',
            textMode: kr.input_mode === 'text',
          });
        }
      } else {
        const { error: logErr } = await db().from('session_logs')
          .insert({ kind: 'check', note: locked.title, task_id: task.id, event_id: eventId });
        if (logErr) throw new Error(`기록 남기기 실패: ${logErr.message}`);
      }
    } catch (e) {
      // 중간에 엎어지면 done_at 까지 되돌린다 — 반만 적용된 채 "완료됨"으로 갇히면
      // 다시 눌러 온전히 처리할 길이 없어진다.
      await this.revert(eventId).catch(() => {});
      throw e;
    }
  },

  /** apply 의 역순. 위 대조표의 ①' ②' ③' 을 그대로 따른다. */
  async revert(eventId: string): Promise<void> {
    // ③' 지표까지 되돌린다 (kr-ledger 가 올린 만큼 정확히 뺀다)
    await revertKrLogsWhere({ eventId });
    // ②' 이 일정으로 만들어진 할일 정리
    const { data: tasks, error: tErr } = await db()
      .from('daily_tasks').select('id').eq('source_ref', eventId).eq('source', 'job_posting');
    if (tErr) throw new Error(`할일 조회 실패: ${tErr.message}`);
    for (const t of tasks ?? []) {
      await revertKrLogsWhere({ taskId: t.id });   // 할일에 딸린 기록도 같은 규칙으로
      const { error: dErr } = await db().from('daily_tasks').delete().eq('id', t.id);
      if (dErr) throw new Error(`할일 삭제 실패: ${dErr.message}`);
    }
    // ①' 완료 표시 해제
    const { error: uErr } = await db().from('calendar_events').update({ done_at: null }).eq('id', eventId);
    if (uErr) throw new Error(`완료 해제 실패: ${uErr.message}`);
  },
};
