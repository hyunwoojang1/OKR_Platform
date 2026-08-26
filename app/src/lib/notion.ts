// 노션 REST 최소 클라이언트 — 코테 기록(「푼 문제」 DB)을 읽고 되쓰기 위한 용도.
// 서버 전용. MCP가 아니라 REST를 직접 쓴다(앱 런타임엔 MCP가 없다).

const NOTION_VERSION = '2025-09-03';
const BASE = 'https://api.notion.com/v1';

function token(): string {
  const t = process.env.NOTION_TOKEN;
  if (!t) throw new Error('NOTION_TOKEN 미설정');
  return t;
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token()}`,
      'notion-version': NOTION_VERSION,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Notion ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/**
 * 노션 속성 하나 — 이 앱이 실제로 읽는 모양만 적는다.
 * 노션의 전체 속성 스키마는 훨씬 크지만, 안 읽는 것까지 적으면 유지가 안 된다.
 */
export type NotionProp = {
  title?: { plain_text?: string }[];
  rich_text?: { plain_text?: string; href?: string | null }[];
  url?: string | null;
  date?: { start?: string | null } | null;
  select?: { name?: string } | null;
  multi_select?: { name: string }[];
};

export type NotionPage = {
  id: string;
  properties: Record<string, NotionProp | undefined>;
};

/** 데이터소스(=DB) 전체 조회. 페이지네이션 따라가되 상한을 둔다. */
export async function queryDataSource(dataSourceId: string, pageSize = 100): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const body: Record<string, unknown> = { page_size: pageSize };
    if (cursor) body.start_cursor = cursor;
    const r = await call<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
      `/data_sources/${dataSourceId}/query`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    out.push(...r.results);
    if (!r.has_more || !r.next_cursor) break;
    cursor = r.next_cursor;
  }
  return out;
}

export async function patchPage(pageId: string, properties: Record<string, unknown>): Promise<void> {
  await call(`/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
}

// ── 속성 읽기 헬퍼 (노션 응답은 타입별로 모양이 달라 매번 분기하면 지저분해진다) ──
export function readTitle(p: NotionPage, name: string): string {
  const v = p.properties?.[name];
  return (v?.title ?? []).map((x) => x.plain_text ?? '').join('').trim();
}
export function readUrl(p: NotionPage, name: string): string {
  return (p.properties?.[name]?.url ?? '').trim();
}
/** rich_text 속성에서 URL 뽑기 — 걸린 링크(href)를 먼저 보고, 없으면 본문 텍스트를 본다. */
export function readRichTextUrl(p: NotionPage, name: string): string {
  const parts = p.properties?.[name]?.rich_text ?? [];
  const href = parts.find((x) => x?.href)?.href;
  if (href) return String(href).trim();
  const plain = parts.map((x) => x?.plain_text ?? '').join('').trim();
  return /^https?:\/\//.test(plain) ? plain : '';
}
/** 클릭 가능한 앵커 텍스트 — 긴 URL 대신 "문제 링크"로 보이게 한다. */
export function linkRichText(label: string, url: string) {
  return { rich_text: [{ type: 'text', text: { content: label, link: { url } } }] };
}
export function readDate(p: NotionPage, name: string): string | null {
  return p.properties?.[name]?.date?.start ?? null;
}
export function readSelect(p: NotionPage, name: string): string | null {
  return p.properties?.[name]?.select?.name ?? null;
}
export function readMultiSelect(p: NotionPage, name: string): string[] {
  return (p.properties?.[name]?.multi_select ?? []).map((o) => o.name);
}
