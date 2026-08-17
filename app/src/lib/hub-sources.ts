import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

// ★ 허브 읽기 전용 층 — econ·auction이 사는 public 스키마.
// 안전 원칙: 이 모듈에서는 SELECT만 한다. INSERT/UPDATE/DELETE 금지.
type PublicClient = SupabaseClient<any, any, 'public', any, any>;
let cached: PublicClient | null = null;
function pub(): PublicClient {
  if (!cached) {
    cached = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      db: { schema: 'public' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

export type AuctionPick = {
  case_no: string; apt_name: string | null; address: string | null; min_bid_price: number | null;
  profit_low: number | null; arb_score: number | null; grade: string | null; sale_date: string | null;
};

// 경매: 보수 차익(profit_low) 기준 상위 추천 (auction 프로젝트의 「보수차익 UI」 원칙 준수)
export async function getAuctionPicks(limit = 5): Promise<AuctionPick[]> {
  const { data, error } = await pub()
    .from('auction_scored_listings')
    .select('case_no, apt_name, address, min_bid_price, profit_low, arb_score, grade, sale_date')
    .not('arb_score', 'is', null)
    .gte('sale_date', new Date().toISOString().slice(0, 10))
    .order('arb_score', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`경매 조회 실패: ${error.message}`);
  return (data ?? []) as AuctionPick[];
}

export type EconDigest = {
  reportDate: string | null;
  summary: string | null;
  topNews: Array<{ title: string; importance: number | null; url: string }>;
};

// econ: 최신 일일 리포트 요약 + 중요 뉴스
export async function getEconDigest(): Promise<EconDigest> {
  const [report, news] = await Promise.all([
    pub().from('daily_reports').select('report_date, summary').eq('status', 'published')
      .order('report_date', { ascending: false }).limit(1).maybeSingle(),
    pub().from('news_items').select('title, importance, url')
      .order('published_at', { ascending: false }).order('importance', { ascending: false }).limit(3),
  ]);
  if (report.error) throw new Error(`리포트 조회 실패: ${report.error.message}`);
  if (news.error) throw new Error(`뉴스 조회 실패: ${news.error.message}`);
  return {
    reportDate: report.data?.report_date ?? null,
    summary: report.data?.summary ?? null,
    topNews: (news.data ?? []) as EconDigest['topNews'],
  };
}

export type HubJob = {
  id: string | number; source: string; company: string; title: string; url: string;
  deadline: string | null; dday: string | null; origin: 'econ' | 'goalhub';
  starred?: boolean; sent_to_task?: boolean;
};

// 채용: econ 크롤(public.job_postings, 매일 적재 중) + goalhub 브리지(로컬 5소스 크롤러 업로드분) 합본
export async function getHubJobs(limit = 12): Promise<HubJob[]> {
  const { db } = await import('./db');
  const [econJobs, bridged] = await Promise.all([
    pub().from('job_postings').select('id, source, company, title, url, deadline, dday')
      .order('fetched_at', { ascending: false }).limit(limit),
    db().from('job_postings').select('id, source, company, title, url, deadline, starred, sent_to_task')
      .order('crawled_at', { ascending: false }).limit(limit),
  ]);
  if (econJobs.error) throw new Error(`econ 채용 조회 실패: ${econJobs.error.message}`);
  if (bridged.error) throw new Error(`브리지 채용 조회 실패: ${bridged.error.message}`);
  const seen = new Set<string>();
  const out: HubJob[] = [];
  for (const j of bridged.data ?? []) {
    seen.add(j.url);
    out.push({ ...j, dday: null, origin: 'goalhub' } as HubJob);
  }
  for (const j of econJobs.data ?? []) {
    if (!seen.has(j.url)) out.push({ ...j, origin: 'econ' } as HubJob);
  }
  return out.slice(0, limit);
}
