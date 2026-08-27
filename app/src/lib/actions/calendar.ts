'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { cleanEventTitle, isDeadlineEvent } from '../deadline';
import { must, run } from '../form';

/**
 * 달력 일정. 마감 완료의 연쇄와 그 역연산은 event-done.ts 가 짝지어 갖고 있다.
 */

// ── 캘린더 (v1: 앱 일정. Google 동기화는 크리덴셜 수령 후 sync_status로 밀어냄) ──
export async function createEvent(form: FormData) {
  const startsAt = must(form.get('starts_at'), '시작');
  const rawTitle = must(form.get('title'), '제목');
  await run('일정 생성', () =>
    db().from('calendar_events').insert({
      // 구글에서 들어오는 것과 같은 규칙: 원본으로 마감 여부를 판정하고, 제목은 앞머리를 뗀다.
      title: cleanEventTitle(rawTitle),
      is_deadline: isDeadlineEvent({ title: rawTitle, is_deadline: null }),
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

/**
 * 일정 삭제 — 구글에서 내려온 일정도 지운다.
 * 예전에는 source='app'으로 막혀 있어서, 구글 일정에 ✕를 눌러도 0건이 지워지고 조용히 성공했다.
 * 구글 쪽을 먼저 지우는 이유: 로컬만 지우면 다음 동기화 때 그대로 되살아난다.
 */
export async function deleteEvent(form: FormData) {
  const ids = form.getAll('id').map((v) => String(v).trim()).filter(Boolean);
  if (ids.length === 0) throw new Error('지울 일정을 고르지 않았습니다');

  const { data, error } = await db()
    .from('calendar_events').select('id,google_event_id').in('id', ids);
  if (error) throw new Error(`일정 조회 실패: ${error.message}`);
  const rows = (data ?? []) as { id: string; google_event_id: string | null }[];
  if (rows.length === 0) throw new Error('일정을 찾을 수 없습니다');

  const { deleteGoogleEvent } = await import('../google-calendar');
  const failed: string[] = [];
  for (const row of rows) {
    if (!row.google_event_id) continue;
    // 구글 삭제가 실패한 건은 로컬도 남긴다 — 한쪽만 사라져 두 달력이 어긋나는 게 더 나쁘다.
    try {
      await deleteGoogleEvent(row.google_event_id);
    } catch {
      failed.push(row.id);
    }
  }
  const deletable = rows.filter((r) => !failed.includes(r.id)).map((r) => r.id);
  if (deletable.length > 0) {
    // 일정을 먼저 지우면 event_id 가 끊겨(on delete set null) 딸린 할일·기록을 되돌릴
    // 근거가 사라진다. 그래서 지우기 전에 완료 흔적을 먼저 걷는다.
    const { eventDone } = await import('../event-done');
    for (const id of deletable) await eventDone.revert(id);
    await run('일정 삭제', () => db().from('calendar_events').delete().in('id', deletable));
  }
  revalidatePath('/calendar');
  revalidatePath('/');
  if (failed.length > 0) throw new Error(`${failed.length}건은 구글에서 지우지 못해 그대로 두었습니다`);
}

/**
 * 달력 마감을 해냈다고 찍는다 — 마감일이 아직 안 왔어도 지금 누를 수 있다.
 * "다음 주까지 낼 서류를 오늘 다 냈는데 마감일까지 기다려야 하는 건 말이 안 된다"가 요구였다.
 *
 * 한 번 누르면 세 가지가 같이 일어난다.
 *   ① 일정에 완료 표시(취소선) — 달력에서 바로 보인다
 *   ② 오늘 할일에 완료된 채로 들어감 — 오늘 한 일이니까
 *   ③ 연결된 지표가 오름 + 기록에 남음 — "자소서 제출 3/12 → 4/12"
 */
export async function toggleEventDone(form: FormData) {
  const id = must(form.get('id'), '일정');
  const done = form.get('done') === 'true';
  const { eventDone } = await import('../event-done');

  // 완료와 되돌리기가 무엇을 건드리는지는 event-done.ts 맨 위 대조표에 나란히 적혀 있다.
  // 여기서 몸통을 벌려 놓으면 또 둘이 갈라진다.
  if (done) await eventDone.apply(id);
  else await eventDone.revert(id);

  revalidatePath('/');
  revalidatePath('/calendar');
  revalidatePath('/okr');
}

/** 이게 마감이 맞는지 손으로 정한다 — 제목 규칙이 틀렸을 때의 탈출구. */
export async function setEventDeadline(form: FormData) {
  const id = must(form.get('id'), '일정');
  const raw = (form.get('is_deadline') as string) ?? '';
  const value = raw === 'null' ? null : raw === 'true';
  await run('마감 표시', () => db().from('calendar_events').update({ is_deadline: value }).eq('id', id));
  revalidatePath('/calendar');
  revalidatePath('/');
}

/** 이 일정을 끝내면 어느 지표가 오를지 연결한다. */
export async function setEventKr(form: FormData) {
  const id = must(form.get('id'), '일정');
  const krId = ((form.get('key_result_id') as string) ?? '').trim() || null;
  // 화면에서 안 보여주는 것만으로는 부족하다 — 예전에 열린 화면이나 오래된 링크가 남는다.
  // 자동으로 세는 지표에 마감을 걸면, 완료해서 숫자를 올려도 다음 동기화가 계산값으로 덮어쓴다.
  if (krId) {
    const { data: kr, error: krErr } = await db()
      .from('key_results').select('source,title').eq('id', krId).maybeSingle();
    if (krErr) throw new Error(`지표 조회 실패: ${krErr.message}`);
    if (!kr) throw new Error('지표를 찾을 수 없습니다');
    if (kr.source !== 'manual') {
      throw new Error(`'${kr.title}'은(는) 자동으로 세는 지표라 마감에 걸 수 없어요`);
    }
  }
  await run('지표 연결', () => db().from('calendar_events').update({ key_result_id: krId }).eq('id', id));
  revalidatePath('/calendar');
  revalidatePath('/');
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
  const { syncCalendar } = await import('../google-calendar');
  const result = await syncCalendar(true);
  if (result.error) throw new Error(`캘린더 동기화 실패: ${result.error}`);
  revalidatePath('/calendar');
  revalidatePath('/');
}
