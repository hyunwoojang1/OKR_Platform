import { createClient } from '@supabase/supabase-js';
import { env } from './env.mjs';

export const db = createClient(env.supabaseUrl, env.supabaseKey, {
  db: { schema: 'goalhub' },
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * 가짜 데이터에 반드시 붙이는 표식.
 * 청소는 두 번 한다 — ① 만들면서 기록해 둔 id 로 ② 그 뒤 이 표식으로 훑어서.
 * 그래서 표식이 없는 행은 어떤 경우에도 손대지 않는다.
 */
export const TAG = '⟦QA⟧';

/**
 * 자격증명이라 스냅샷에서 뺀다. 이 목록에 없는 테이블은 전부 스냅샷 대상이다 —
 * 나중에 새 테이블이 생겨도 자동으로 포함되게 하려는 것.
 */
const EXCLUDED = new Set(['oauth_tokens']);

let tableCache = null;

/** PostgREST 가 스스로 알려주는 스키마. 테이블 목록을 손으로 적지 않는 이유. */
export async function introspect() {
  if (tableCache) return tableCache;
  const r = await fetch(`${env.supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: env.supabaseKey,
      Authorization: `Bearer ${env.supabaseKey}`,
      'Accept-Profile': 'goalhub',
    },
  });
  if (!r.ok) throw new Error(`스키마 조회 실패: HTTP ${r.status}`);
  const doc = await r.json();
  const defs = doc.definitions ?? {};
  tableCache = {
    /** 테이블 → { columns: {이름: {type, format}}, notNull: Set<이름> } */
    tables: Object.fromEntries(Object.entries(defs).map(([name, d]) => [name, {
      columns: d.properties ?? {},
      notNull: new Set(d.required ?? []),
    }])),
    names: Object.keys(defs).filter((t) => !EXCLUDED.has(t)).sort(),
  };
  return tableCache;
}

/** 한 테이블 전량. 잘림을 조용히 넘기지 않으려고 총 개수와 대조한다. */
async function readAll(table) {
  const PAGE = 1000;
  const rows = [];
  let from = 0;
  let total = null;
  for (let guard = 0; guard < 100; guard += 1) {
    const { data, error, count } = await db
      .from(table).select('*', { count: 'exact' }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    if (total === null) total = count ?? 0;
    rows.push(...(data ?? []));
    if (rows.length >= total || (data ?? []).length === 0) break;
    from += PAGE;
  }
  if (total !== null && rows.length !== total) {
    throw new Error(`${table} 을 다 못 읽었습니다 (${rows.length}/${total}). 스냅샷이 불완전하면 복구 검증이 거짓말을 합니다.`);
  }
  return rows;
}

/** 전 테이블 전 행. 이걸 못 뜨면 아무것도 시작하지 않는다. */
export async function snapshot() {
  const { names } = await introspect();
  const snap = {};
  for (const t of names) snap[t] = await readAll(t);
  return snap;
}

export function rowCount(snap) {
  return Object.values(snap).reduce((n, rows) => n + rows.length, 0);
}

/** id 기준 행 단위 비교. 추가·삭제·변경을 전부 뽑는다. */
export function diff(before, after, { ignore = {} } = {}) {
  const out = [];
  for (const t of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = new Map((before[t] ?? []).map((r) => [r.id, r]));
    const a = new Map((after[t] ?? []).map((r) => [r.id, r]));
    const skip = new Set(ignore[t] ?? []);
    for (const [id, row] of a) if (!b.has(id)) out.push({ table: t, kind: '추가', id, row });
    for (const [id, row] of b) if (!a.has(id)) out.push({ table: t, kind: '삭제', id, row });
    for (const [id, row] of a) {
      const prev = b.get(id);
      if (!prev) continue;
      const changed = {};
      for (const k of new Set([...Object.keys(row), ...Object.keys(prev)])) {
        if (skip.has(k)) continue;
        if (JSON.stringify(row[k]) !== JSON.stringify(prev[k])) changed[k] = [prev[k], row[k]];
      }
      if (Object.keys(changed).length) out.push({ table: t, kind: '변경', id, changed });
    }
  }
  return out;
}

/** 변한 테이블 이름만. "이 연쇄가 어디를 건드렸나" 를 묻는 검사에 쓴다. */
export function touchedTables(d) {
  return [...new Set(d.map((x) => x.table))].sort();
}

const label = (row) => String(row?.title ?? row?.name ?? row?.note ?? '').slice(0, 60);

export function fmtDiff(d, indent = '    ') {
  if (!d.length) return `${indent}(변화 없음)`;
  return d.map((x) => (x.kind === '변경'
    ? `${indent}~ ${x.table} ${String(x.id).slice(0, 8)} `
      + Object.entries(x.changed).map(([k, [p, n]]) => `${k}: ${JSON.stringify(p)}→${JSON.stringify(n)}`).join(', ')
    : `${indent}${x.kind === '추가' ? '+' : '-'} ${x.table} ${String(x.id).slice(0, 8)} ${label(x.row)}`)).join('\n');
}
