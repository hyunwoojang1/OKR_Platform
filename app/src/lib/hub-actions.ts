'use server';

import { revalidatePath } from 'next/cache';
import { db } from './db';
import { kstToday } from './types';

// 쓰기 1호: 공고 → 취업 영역 오늘 할일. goalhub에만 쓴다(econ public 테이블은 불변).
export async function sendJobToTask(form: FormData) {
  const company = (form.get('company') as string)?.trim();
  const title = (form.get('title') as string)?.trim();
  const url = (form.get('url') as string)?.trim();
  const origin = form.get('origin') as string;
  const id = (form.get('id') as string)?.trim();
  if (!company || !title || !url) throw new Error('공고 정보가 비어 있습니다');

  const { data: jobArea } = await db().from('areas').select('id').eq('name', '취업').maybeSingle();

  const { error } = await db().from('daily_tasks').insert({
    title: `[지원검토] ${company} — ${title}`,
    date: kstToday(),
    area_id: jobArea?.id ?? null,
    source: 'job_posting',
    source_ref: url,
  });
  if (error) throw new Error(`할일 생성 실패: ${error.message}`);

  // goalhub 브리지 공고면 「보냄」 마킹 (econ 공고는 goalhub에 마킹 사본 upsert)
  if (origin === 'goalhub' && id) {
    await db().from('job_postings').update({ sent_to_task: true }).eq('id', id);
  } else {
    await db().from('job_postings').upsert(
      { source: 'econ', company, title, url, sent_to_task: true },
      { onConflict: 'url' },
    );
  }
  revalidatePath('/hub');
  revalidatePath('/');
}
