'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { kstToday } from '../types';
import { must, run } from '../form';

/**
 * 오늘 할일.
 */

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

  // 이미 그 상태면 0행이 돌아온다 — 더블탭·재시도로 들어온 두 번째 요청은 여기서 끝난다.
  // 코드로 "이미 있나" 를 먼저 물어보면 동시에 들어온 둘이 나란히 통과해버린다.
  const { data, error: lockErr } = await db()
    .from('daily_tasks')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('done', !done)
    .select('title,area_id,initiative_id')
    .maybeSingle();
  if (lockErr) throw new Error(`할일 체크 실패: ${lockErr.message}`);
  if (!data) return;

  if (done) {
    // 체크 = 자동 로그 (만능 원자 원칙 — 실패해도 체크는 유지)
    let objectiveId: string | null = null;
    if (data?.initiative_id) {
      const { data: ini } = await db().from('initiatives').select('objective_id').eq('id', data.initiative_id).maybeSingle();
      objectiveId = ini?.objective_id ?? null;
    }
    await run('체크 기록', () =>
      db().from('session_logs').insert({
        task_id: id, objective_id: objectiveId, area_id: data?.area_id ?? null, kind: 'check', note: data?.title ?? null,
      }),
    );
    // 목표에서 내려온 할일이면 그 주간 계획도 같이 완료 (지금까지 따로 놀던 빈틈)
    if (data?.initiative_id) {
      await run('주간 계획 완료', () =>
        db().from('initiatives').update({ status: 'done' }).eq('id', data.initiative_id!),
      );
    }
  } else {
    // 되돌리기 = 흔적도 되돌린다. 안 지우면 체크·해제를 반복할 때마다 유령 기록이 쌓인다.
    // 원장을 거치는 이유: 그 기록이 지표를 올려뒀다면 지표도 같은 양만큼 내려야 한다.
    const { revertKrLogsWhere } = await import('../kr-ledger');
    await revertKrLogsWhere({ taskId: id });
    if (data?.initiative_id) {
      await run('주간 계획 되돌리기', () =>
        db().from('initiatives').update({ status: 'active' }).eq('id', data.initiative_id!),
      );
    }
  }
  revalidatePath('/');
  revalidatePath('/calendar');
  revalidatePath('/okr');
}

/** 할일 고치기 — 제목 오타·바뀐 마감·잘못 고른 영역을 지우고 새로 만들지 않고 바로잡는다. */
export async function updateTask(form: FormData) {
  const id = must(form.get('id'), '할일');
  await run('할일 수정', () =>
    db().from('daily_tasks').update({
      title: must(form.get('title'), '제목'),
      area_id: (form.get('area_id') as string)?.trim() || null,
      due_date: (form.get('due_date') as string)?.trim() || null,
    }).eq('id', id),
  );
  revalidatePath('/');
}

/** 할일 지우기. 딸린 완료 기록도 같이 치운다 — 없는 할일을 가리키는 기록만 남으면 타임라인이 거짓말을 한다. */
export async function deleteTask(form: FormData) {
  const id = must(form.get('id'), '할일');
  // 기록을 그냥 지우면 그 기록이 올려둔 지표가 부풀린 채로 남는다(원장 불변식 ①).
  const { revertKrLogsWhere } = await import('../kr-ledger');
  await revertKrLogsWhere({ taskId: id });
  await run('할일 삭제', () => db().from('daily_tasks').delete().eq('id', id));
  revalidatePath('/');
  revalidatePath('/calendar');
}

/** 할일 → 루틴 이사. '러닝'처럼 매번 반복하는 일이 마감형 할일로 잡혀 이월이 쌓이는 걸 푸는 통로. */
export async function promoteTaskToRoutine(form: FormData) {
  const id = must(form.get('id'), '할일');
  const perWeek = Math.min(7, Math.max(1, Number(form.get('target_per_week') ?? 7) || 7));
  const { data: task, error } = await db()
    .from('daily_tasks').select('title,area_id,done').eq('id', id).maybeSingle();
  if (error) throw new Error(`할일 조회 실패: ${error.message}`);
  if (!task) throw new Error('할일을 찾을 수 없습니다');

  await run('루틴 생성', () =>
    db().from('habits').insert({
      title: task.title,
      area_id: task.area_id,
      cadence: perWeek >= 7 ? 'daily' : 'weekly',
      target_per_week: perWeek,
    }),
  );
  // 오늘 이미 체크된 상태였다면 루틴에서도 오늘 체크로 이어받는다 (한 일이 사라지지 않게)
  if (task.done) {
    const { data: habit } = await db()
      .from('habits').select('id').eq('title', task.title).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (habit) {
      await run('오늘 체크 이어받기', () =>
        db().from('habit_logs').upsert({ habit_id: habit.id, date: kstToday(), done: true }, { onConflict: 'habit_id,date' }),
      );
    }
  }
  await run('할일 정리', () => db().from('daily_tasks').delete().eq('id', id));
  revalidatePath('/');
}
