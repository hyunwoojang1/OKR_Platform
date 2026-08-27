'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { kstToday } from '../types';
import { must, run } from '../form';

/**
 * 공고 보내기·회고 저장.
 */

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
