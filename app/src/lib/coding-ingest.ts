import 'server-only';
import { db } from './db';
import { CODING_TAGS, classifyProblem, fetchProgrammersProblem, isProgrammersUrl } from './coding';
import { linkRichText, patchPage, queryDataSource, readDate, readMultiSelect, readRichTextUrl, readTitle } from './notion';
import type { KeyResult, Objective } from './types';
import { isCodingKr, kstMonday, kstToday } from './types';

/**
 * 노션 「푼 문제」 → 코테 지표.
 *
 * 크론(밤 10시)과 오늘 할일의 '노션에서 가져오기' 버튼이 이 함수 하나를 같이 쓴다.
 * 두 벌로 두면 버튼으로 채운 것과 크론이 채운 것이 서로 다른 규칙으로 세는 날이 온다.
 *
 * 하는 일 순서대로:
 *   ① 링크만 붙여둔 행을 찾아 프로그래머스에서 제목·난이도를 긁고, 설명으로 유형을 분류해 되쓴다
 *   ② 날짜가 비어 있으면 오늘로 채운다 — 날짜가 없으면 오늘 몫도 주간 몫도 셀 수 없다
 *   ③ 표 전체를 집계해 코테 지표(KR)의 current_value 를 맞춘다
 *
 * 지표는 이름으로 찾는다. 사용자가 목표에 어떤 이름을 붙이든 붙게 하려는 것이고,
 * 화면의 '노션에서 가져오기' 버튼도 같은 잣대(isCodingKr)를 쓴다.
 */

const FILL_LIMIT = 8; // 한 번에 채울 행 수 — 페이지 크롤 + AI 호출이라 상한을 둔다

export type CodingIngestResult = {
  /** 이번에 채운 행 설명 */
  filled: string[];
  /** 표 전체에서 제목·날짜가 갖춰진 행 수 */
  total: number;
  /** 이번 주(월요일 이후) 푼 개수 */
  thisWeek: number;
  /** 오늘 푼 개수 — 오늘 할일의 숫자 칸에 넣는 값 */
  today: number;
  byTagWeek: Record<string, number>;
  updatedKrs: string[];
};

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

/**
 * @param writeKr 지표 값까지 맞출지. 크론은 true(사람이 안 눌러도 맞아야 하니까),
 *   화면의 '노션에서 가져오기' 버튼은 false — 버튼은 숫자를 칸에 넣어주기만 하고,
 *   실제 기록은 사용자가 '기록'을 눌러 원장을 거친다. 두 경로가 같은 값으로 만난다.
 */
export async function runCodingIngest({ writeKr = true }: { writeKr?: boolean } = {}): Promise<CodingIngestResult> {
  const dsId = process.env.NOTION_CODING_DS_ID;
  if (!dsId) throw new Error('노션 표가 연결돼 있지 않아요 (NOTION_CODING_DS_ID 미설정)');

  const rows = await queryDataSource(dsId);

  // ── ① 링크만 넣은 행 자동 채움 ──
  // 링크는 「문제」(제목) 칸에 붙여넣는 게 기본이다 — 노션에서 제목 칸은 항상 맨 앞이라
  // 새 행 만들고 바로 붙여넣을 수 있다. 「링크」 칸에 넣어도 받아준다.
  const urlOf = (r: (typeof rows)[number]) => {
    const t = readTitle(r, '문제');
    if (/^https?:\/\//.test(t)) return t;
    return readRichTextUrl(r, '링크');
  };
  const filled: string[] = [];
  const todo = rows
    .filter((r) => {
      const u = urlOf(r);
      if (!isProgrammersUrl(u)) return false;
      // 제목이 아직 URL이거나 비어 있으면 = 아직 안 채워진 행
      const t = readTitle(r, '문제');
      return !t || /^https?:\/\//.test(t);
    })
    .slice(0, FILL_LIMIT);

  for (const row of todo) {
    const url = urlOf(row);
    const info = await fetchProgrammersProblem(url);
    if (!info) continue;
    const tags = await classifyProblem(info.title, info.description);
    const props: Record<string, unknown> = {
      문제: { title: [{ text: { content: info.title } }] },
      // 긴 URL 대신 클릭 가능한 "문제 링크"로 보이게 한다
      링크: linkRichText('문제 링크', url),
      사이트: { select: { name: '프로그래머스' } },
      유형: { multi_select: tags.map((t) => ({ name: t })) },
    };
    if (info.level) props['난이도'] = { select: { name: `Lv.${info.level}` } };
    // 날짜가 비어 있으면 오늘로 — 오늘 몫도 주간 집계도 날짜가 있어야 센다.
    if (!readDate(row, '날짜')) props['날짜'] = { date: { start: kstToday() } };
    await patchPage(row.id, props);
    filled.push(`${info.title}${info.level ? ` (Lv.${info.level})` : ''} · ${tags.join('/')}`);
  }

  // ── ② 집계 ──
  // 되쓴 값을 반영해 다시 읽는다(방금 채운 행도 이번 집계에 포함되게).
  const fresh = filled.length > 0 ? await queryDataSource(dsId) : rows;
  const monday = kstMonday();
  const today = kstToday();
  // 아직 URL 그대로인 행(채우기 실패)은 집계에서 뺀다
  const solved = fresh.filter((r) => {
    const t = readTitle(r, '문제');
    return t && !/^https?:\/\//.test(t) && readDate(r, '날짜');
  });
  const dayOf = (r: (typeof solved)[number]) => (readDate(r, '날짜') ?? '').slice(0, 10);
  const countAll = solved.length;
  const countWeek = solved.filter((r) => dayOf(r) >= monday).length;
  const countToday = solved.filter((r) => dayOf(r) === today).length;

  const byTagWeek = new Map<string, number>();
  const byTagToday = new Map<string, number>();
  for (const r of solved) {
    const d = dayOf(r);
    for (const t of readMultiSelect(r, '유형')) {
      if (d >= monday) byTagWeek.set(t, (byTagWeek.get(t) ?? 0) + 1);
      if (d === today) byTagToday.set(t, (byTagToday.get(t) ?? 0) + 1);
    }
  }

  /*
    ── ③ 지표 반영 ──

    예전엔 여기서 current_value 를 노션 개수로 직접 덮어썼다. 그러면 사용자가 오늘 할일에서
    '기록'을 눌러 올린 값과 이중으로 계산되고, 되돌릴 근거(session_logs)도 안 남는다.
    그래서 원장을 거친다 — 오늘 것만 물리고 오늘 개수를 다시 얹는다.
    어제까지는 그대로 두므로 이번 주 누적은 이어지고, 몇 번을 눌러도 오늘 값은 갈아끼워진다.

    Supabase가 간헐적으로 'JWT issued at future'(노드 시계 오차)를 뱉는다 — 짧게 재시도한다.
  */
  const updated: string[] = [];
  if (writeKr) {
    const [objRows, krRows] = await Promise.all([
      withRetry('목표 조회', () => db().from('objectives').select('id').eq('status', 'active')),
      withRetry('지표 조회', () => db().from('key_results').select('*')),
    ]);
    const activeIds = new Set((objRows as Pick<Objective, 'id'>[]).map((o) => o.id));
    const krs = (krRows as KeyResult[]).filter((k) => activeIds.has(k.objective_id) && k.source === 'manual');
    const { creditKr, revertKrLogsToday } = await import('./kr-ledger');

    for (const kr of krs) {
      // 유형 지표가 우선 — "DP 문제"처럼 유형명이 들어 있으면 그 유형만 센다.
      const tag = CODING_TAGS.find((t) => kr.title.toUpperCase().includes(t.toUpperCase()));
      if (!tag && !isCodingKr(kr)) continue;
      const todayCount = tag ? byTagToday.get(tag) ?? 0 : countToday;
      const before = Number(kr.current_value);
      await revertKrLogsToday(kr.id);
      if (todayCount > 0) {
        await creditKr({
          krId: kr.id,
          delta: todayCount,
          accrual: 'sum',
          note: `노션에서 오늘 ${todayCount}문제`,
          objectiveId: kr.objective_id,
          unit: kr.unit || '',
        });
      }
      updated.push(`${kr.title} ${before}→${before - 0 + todayCount}${kr.unit}`);
    }
  }

  return {
    filled,
    total: countAll,
    thisWeek: countWeek,
    today: countToday,
    byTagWeek: Object.fromEntries(byTagWeek),
    updatedKrs: updated,
  };
}
