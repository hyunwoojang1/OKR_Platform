import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cronAuthorized } from '@/lib/cron-guard';
import { CODING_TAGS, classifyProblem, fetchProgrammersProblem, isProgrammersUrl } from '@/lib/coding';
import { patchPage, queryDataSource, readDate, readMultiSelect, readTitle, readUrl } from '@/lib/notion';
import type { KeyResult, Objective } from '@/lib/types';
import { kstMonday, kstToday } from '@/lib/types';

export const maxDuration = 60;

// 코테 기록 연동:
//  ① 노션 「푼 문제」에서 링크만 있고 제목이 빈 행을 찾아 → 프로그래머스에서 제목·난이도를 긁고
//     문제 설명으로 유형을 분류해 노션에 되써준다 (사용자는 링크만 붙여넣으면 된다)
//  ② 그 표를 집계해 코테 지표(KR)를 채운다
// 지표는 "이름"으로 찾는다 — 사용자가 목표에 어떤 이름으로 만들든 붙게.
const CODING_WORDS = /코테|코딩\s*테스트|알고리즘|문제\s*풀이|PS\b/i;
const FILL_LIMIT = 8; // 한 번에 채울 행 수 — 페이지 크롤 + AI 호출이라 상한을 둔다

async function withRetry<T>(
  label: string,
  fn: () => PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  let last = '';
  for (let i = 0; i < 3; i++) {
    const r = await fn();
    if (!r.error) return r.data;
    last = r.error.message;
    if (i < 2) await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw new Error(`${label} 실패: ${last}`);
}

function ingestAuthorized(req: NextRequest): boolean {
  const t = process.env.INGEST_TOKEN;
  if (!t) return false;
  if (req.headers.get('authorization') === `Bearer ${t}`) return true;
  return req.nextUrl.searchParams.get('key') === t;
}

export async function POST(req: NextRequest) {
  if (!ingestAuthorized(req) && !cronAuthorized(req)) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  return run();
}
// 크론은 GET으로 때린다
export async function GET(req: NextRequest) {
  if (!ingestAuthorized(req) && !cronAuthorized(req)) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  return run();
}

async function run() {
  const dsId = process.env.NOTION_CODING_DS_ID;
  if (!dsId) return NextResponse.json({ error: 'NOTION_CODING_DS_ID 미설정' }, { status: 500 });

  try {
    const rows = await queryDataSource(dsId);

    // ── ① 링크만 있는 행 자동 채움 ──
    const filled: string[] = [];
    const todo = rows
      .filter((r) => !readTitle(r, '문제') && isProgrammersUrl(readUrl(r, '링크')))
      .slice(0, FILL_LIMIT);

    for (const row of todo) {
      const url = readUrl(row, '링크');
      const info = await fetchProgrammersProblem(url);
      if (!info) continue;
      const tags = await classifyProblem(info.title, info.description);
      const props: Record<string, unknown> = {
        문제: { title: [{ text: { content: info.title } }] },
        사이트: { select: { name: '프로그래머스' } },
        유형: { multi_select: tags.map((t) => ({ name: t })) },
      };
      if (info.level) props['난이도'] = { select: { name: `Lv.${info.level}` } };
      // 날짜가 비어 있으면 오늘로 — 주간 집계가 되려면 날짜가 반드시 있어야 한다.
      if (!readDate(row, '날짜')) props['날짜'] = { date: { start: kstToday() } };
      await patchPage(row.id, props);
      filled.push(`${info.title}${info.level ? ` (Lv.${info.level})` : ''} · ${tags.join('/')}`);
    }

    // ── ② 집계 ──
    // 되쓴 값을 반영해 다시 읽는다(방금 채운 행도 이번 집계에 포함되게).
    const fresh = filled.length > 0 ? await queryDataSource(dsId) : rows;
    const monday = kstMonday();
    const solved = fresh.filter((r) => readTitle(r, '문제') && readDate(r, '날짜'));
    const weekRows = solved.filter((r) => (readDate(r, '날짜') ?? '') >= monday);

    const countAll = solved.length;
    const countWeek = weekRows.length;
    const byTagAll = new Map<string, number>();
    const byTagWeek = new Map<string, number>();
    for (const r of solved) {
      const isWeek = (readDate(r, '날짜') ?? '') >= monday;
      for (const t of readMultiSelect(r, '유형')) {
        byTagAll.set(t, (byTagAll.get(t) ?? 0) + 1);
        if (isWeek) byTagWeek.set(t, (byTagWeek.get(t) ?? 0) + 1);
      }
    }

    // ── ③ 지표 반영 ──
    // Supabase가 간헐적으로 'JWT issued at future'(노드 시계 오차)를 뱉는다 — 짧게 재시도한다.
    const [objRows, krRows] = await Promise.all([
      withRetry('목표 조회', () => db().from('objectives').select('id').eq('status', 'active')),
      withRetry('지표 조회', () => db().from('key_results').select('*')),
    ]);
    const activeIds = new Set((objRows as Pick<Objective, 'id'>[]).map((o) => o.id));
    const krs = (krRows as KeyResult[]).filter((k) => activeIds.has(k.objective_id) && k.source === 'manual');

    const updated: string[] = [];
    for (const kr of krs) {
      const title = kr.title;
      // 유형 지표가 우선 — "DP 문제"처럼 유형명이 들어 있으면 그 유형만 센다.
      const tag = CODING_TAGS.find((t) => title.toUpperCase().includes(t.toUpperCase()));
      const isCoding = CODING_WORDS.test(title);
      if (!tag && !isCoding) continue;
      const weekly = kr.cadence === 'weekly';
      const next = tag
        ? (weekly ? byTagWeek.get(tag) ?? 0 : byTagAll.get(tag) ?? 0)
        : (weekly ? countWeek : countAll);
      if (Number(kr.current_value) === next) continue;
      const { error } = await db().from('key_results').update({ current_value: next }).eq('id', kr.id);
      if (!error) updated.push(`${title} ${kr.current_value}→${next}${kr.unit}`);
    }

    return NextResponse.json({
      ok: true,
      filled,
      total: countAll,
      thisWeek: countWeek,
      byTagWeek: Object.fromEntries(byTagWeek),
      updatedKrs: updated,
    });
  } catch (e) {
    console.error('ingest/coding 실패:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
