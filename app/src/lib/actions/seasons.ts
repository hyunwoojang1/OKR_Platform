'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { kstToday } from '../types';
import { CERT_NAMES } from '../deadline';
import { must, run } from '../form';

/**
 * 지난 마감이 모이는 시즌 폴더.
 */

/** "마감, 공채 , ,신입" → ['마감','공채','신입'] — 쉼표·줄바꿈 아무거나 받는다. */
function parseKeywords(v: FormDataEntryValue | null): string[] {
  const raw = typeof v === 'string' ? v : '';
  const out: string[] = [];
  for (const k of raw.split(/[,\n]/)) {
    const s = k.trim();
    if (s && s.length <= 60 && !out.includes(s)) out.push(s);
  }
  if (out.length > 200) throw new Error('키워드가 너무 많습니다 (200개까지)');
  return out;
}

/** 시즌의 날짜 칸은 비워둘 수 있다 — '자격증'처럼 기간이 없고 이름으로만 갈리는 폴더가 있다. */
function optionalDate(v: FormDataEntryValue | null, name: string): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${name} 날짜 형식이 올바르지 않습니다`);
  return s;
}

function revalidateSeasons() {
  revalidatePath('/deadlines');
  revalidatePath('/calendar');
}

export async function createSeason(form: FormData) {
  const starts = optionalDate(form.get('starts_on'), '시작');
  const ends = optionalDate(form.get('ends_on'), '종료');
  if (starts && ends && starts > ends) throw new Error('시작이 종료보다 늦습니다');
  await run('시즌 생성', () =>
    db().from('seasons').insert({
      name: must(form.get('name'), '시즌 이름'),
      starts_on: starts,
      ends_on: ends,
      keywords: parseKeywords(form.get('keywords')),
      sort_order: Number(form.get('sort_order')) || 0,
    }),
  );
  revalidateSeasons();
}

export async function updateSeason(form: FormData) {
  const id = must(form.get('id'), '시즌');
  const starts = optionalDate(form.get('starts_on'), '시작');
  const ends = optionalDate(form.get('ends_on'), '종료');
  if (starts && ends && starts > ends) throw new Error('시작이 종료보다 늦습니다');
  await run('시즌 수정', () =>
    db().from('seasons').update({
      name: must(form.get('name'), '시즌 이름'),
      starts_on: starts,
      ends_on: ends,
      keywords: parseKeywords(form.get('keywords')),
    }).eq('id', id),
  );
  revalidateSeasons();
}

/**
 * 시즌만 지운다. 일정은 안 지운다 —
 * season_id는 on delete set null이라 자동 배정(키워드·기간)으로 돌아갈 뿐이다.
 */
export async function deleteSeason(form: FormData) {
  const id = must(form.get('id'), '시즌');
  await run('시즌 삭제', () => db().from('seasons').delete().eq('id', id));
  revalidateSeasons();
}

/**
 * 이 마감을 어느 폴더에 넣을지 손으로 정한다.
 * 빈 값이면 지정을 풀고 자동 배정(키워드 → 기간)으로 되돌린다.
 */
export async function setEventSeason(form: FormData) {
  const id = must(form.get('id'), '일정');
  const seasonId = ((form.get('season_id') as string) ?? '').trim() || null;
  await run('시즌 이동', () => db().from('calendar_events').update({ season_id: seasonId }).eq('id', id));
  revalidateSeasons();
}

/**
 * 처음 쓰는 사람을 위한 시즌 두 개.
 *
 * 왜 하필 '공채'와 '자격증'인가: 달력에 실제로 섞여 있는 두 종류이고,
 * '필기'·'접수'·'발표' 같은 행위 단어가 양쪽에 똑같이 쓰여서 날짜로는 원리적으로 못 가른다.
 * 갈리는 건 대상이 회사냐 자격증이냐뿐이라, 자격증 쪽에 이름 사전을 통째로 넣어준다.
 */
export async function seedSeasons() {
  const { data: existing } = await db().from('seasons').select('id').limit(1);
  if (existing && existing.length > 0) throw new Error('이미 시즌이 있습니다');

  const today = kstToday();
  const year = Number(today.slice(0, 4));
  const isSecondHalf = Number(today.slice(5, 7)) >= 7;
  const half = isSecondHalf
    ? { name: `${year} 하반기 공채`, starts_on: `${year}-07-01`, ends_on: `${year}-12-31` }
    : { name: `${year} 상반기 공채`, starts_on: `${year}-01-01`, ends_on: `${year}-06-30` };

  await run('시즌 생성', () =>
    db().from('seasons').insert([
      // 자격증이 먼저다. 키워드가 기간보다 먼저 판정되므로 순서 자체는 결과를 안 바꾸지만,
      // 목록에서 좁은 폴더가 위에 오는 편이 읽기 쉽다.
      { name: '자격증', starts_on: null, ends_on: null, keywords: CERT_NAMES, sort_order: 0 },
      { ...half, keywords: ['마감', '공채', '신입', '채용'], sort_order: 1 },
    ]),
  );
  revalidateSeasons();
}
