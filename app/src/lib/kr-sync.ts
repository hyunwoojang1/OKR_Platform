import { db } from './db';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import type { KeyResult } from './types';

// ── KR 자동채움 ──
// source='habit_agg' : source_ref = habit id → 해당 분기 내 habit_logs 완료 수
// source='api'       : source_ref = 커넥터 키 → 외부 앱 데이터 집계 (읽기 전용)
//   auction_grade_a : 경매 큐레이션 중 A급 이상 발굴 수 (public.auction_scored_listings, SELECT만)
//   jobs_sent       : 허브에서 할일로 보낸 공고 수 (goalhub.job_postings)

function quarterRange(period: string): { from: string; to: string } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]) - 1;
  const from = new Date(Date.UTC(year, q * 3, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, q * 3 + 3, 0)).toISOString().slice(0, 10);
  return { from, to };
}

async function apiConnectorValue(key: string): Promise<number | null> {
  if (key === 'auction_grade_a') {
    const pub = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      db: { schema: 'public' }, auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }) },
    });
    // 경매 등급은 한글 라벨 체계: 최상급 = '양호' (그 다음 '관심')
    const { count, error } = await pub
      .from('auction_scored_listings').select('case_no', { count: 'exact', head: true }).in('grade', ['양호']);
    if (error) return null;
    return count ?? 0;
  }
  if (key === 'jobs_sent') {
    const { count, error } = await db()
      .from('job_postings').select('id', { count: 'exact', head: true }).eq('sent_to_task', true);
    if (error) return null;
    return count ?? 0;
  }
  return null;
}

export async function syncAutoKRs(): Promise<{ updated: number; unchanged: number; skipped: number }> {
  const { data, error } = await db()
    .from('key_results').select('*, objectives!inner(period, status)').neq('source', 'manual');
  if (error) throw new Error(`자동 KR 조회 실패: ${error.message}`);
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  for (const kr of (data ?? []) as Array<KeyResult & { objectives: { period: string; status: string } }>) {
    if (kr.objectives.status !== 'active' || !kr.source_ref) {
      skipped += 1;
      continue;
    }
    let value: number | null = null;
    if (kr.source === 'habit_agg') {
      const range = quarterRange(kr.objectives.period);
      let q = db().from('habit_logs').select('id', { count: 'exact', head: true })
        .eq('habit_id', kr.source_ref).eq('done', true);
      if (range) q = q.gte('date', range.from).lte('date', range.to);
      const { count, error: cntErr } = await q;
      value = cntErr ? null : (count ?? 0);
    } else if (kr.source === 'api') {
      value = await apiConnectorValue(kr.source_ref);
    }
    if (value == null) {
      skipped += 1;
      continue;
    }
    if (value !== Number(kr.current_value)) {
      const { error: upErr } = await db().from('key_results').update({ current_value: value }).eq('id', kr.id);
      if (upErr) {
        skipped += 1;
        continue;
      }
      updated += 1;
    } else {
      unchanged += 1;
    }
  }
  return { updated, unchanged, skipped };
}
