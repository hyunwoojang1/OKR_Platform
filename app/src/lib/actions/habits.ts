'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { kstToday } from '../types';
import { must, run } from '../form';

/**
 * 루틴(습관).
 */

// ── 루틴 (저장은 habits 테이블. 화면에서는 전부 "루틴"으로 부른다) ──
export async function createHabit(form: FormData) {
  const cadence = form.get('cadence') === 'weekly' ? 'weekly' : 'daily';
  await run('루틴 생성', () =>
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

/** 루틴 고치기 — 주 3회를 5회로 바꾸는 것처럼, 목표량은 살면서 바뀐다. */
export async function updateHabit(form: FormData) {
  const id = must(form.get('id'), '루틴');
  const perWeek = Math.min(7, Math.max(1, Number(form.get('target_per_week') ?? 7) || 7));
  await run('루틴 수정', () =>
    db().from('habits').update({
      title: must(form.get('title'), '제목'),
      area_id: (form.get('area_id') as string)?.trim() || null,
      target_per_week: perWeek,
      cadence: perWeek >= 7 ? 'daily' : 'weekly',
    }).eq('id', id),
  );
  revalidatePath('/');
}

/**
 * 루틴 지우기. 체크 기록(habit_logs)은 함께 사라진다 —
 * 지표가 그 기록을 세고 있었다면 숫자가 줄 수 있어서, 화면에서 미리 알린다.
 */
export async function deleteHabit(form: FormData) {
  const id = must(form.get('id'), '루틴');
  await run('루틴 기록 삭제', () => db().from('habit_logs').delete().eq('habit_id', id));
  await run('루틴 삭제', () => db().from('habits').delete().eq('id', id));
  revalidatePath('/');
}

export async function toggleHabitLog(form: FormData) {
  const habitId = must(form.get('habit_id'), '루틴');
  const date = (form.get('date') as string)?.trim() || kstToday();
  const done = form.get('done') === 'true';
  if (done) {
    await run('루틴 체크', () =>
      db().from('habit_logs').upsert({ habit_id: habitId, date, done: true }, { onConflict: 'habit_id,date' }),
    );
  } else {
    await run('루틴 해제', () => db().from('habit_logs').delete().eq('habit_id', habitId).eq('date', date));
  }
  revalidatePath('/habits');
  revalidatePath('/');
}
