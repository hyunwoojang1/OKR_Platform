import Link from 'next/link';
import { db } from '@/lib/db';
import type { JobPosting } from '@/lib/types';
import { kstToday } from '@/lib/types';
import JobActions from './JobActions';

export const dynamic = 'force-dynamic';

function dDay(deadline: string | null, today: string): number | null {
  if (!deadline) return null;
  return Math.round((Date.parse(deadline) - Date.parse(today)) / 86400_000);
}

// 공고 보드 (job_applications 크롤 → job_postings): 지원예정 먼저, 마감 임박순.
export default async function JobsPage() {
  const today = kstToday();
  const { data, error } = await db()
    .from('job_postings')
    .select('*')
    .in('stage', ['수집함', '지원예정'])
    .or(`deadline.gte.${today},deadline.is.null`)
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(`공고 조회 실패: ${error.message}`);
  const jobs = data as JobPosting[];
  const promoted = jobs.filter((j) => j.stage === '지원예정');
  const collected = jobs.filter((j) => j.stage !== '지원예정');
  const dated = collected.filter((j) => j.deadline);
  const anytime = collected.filter((j) => !j.deadline);

  const Card = ({ job }: { job: JobPosting }) => {
    const d = dDay(job.deadline, today);
    return (
      <div className="tile space-y-3 !p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-medium">{job.company}</span>
              {job.stage === '지원예정' && <span className="badge badge-accent shrink-0">지원예정</span>}
              {job.analyzed && <span className="mono shrink-0 text-[10px]" style={{ color: 'var(--ink-4)' }}>분석✓</span>}
              {job.essay && <span className="mono shrink-0 text-[10px]" style={{ color: 'var(--ink-4)' }}>자소서✓</span>}
            </div>
            <a href={job.url} target="_blank" rel="noreferrer" className="block truncate text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-2)' }}>
              {job.title}
            </a>
          </div>
          <div className="mono shrink-0 text-right text-xs" style={{ color: d !== null && d <= 3 ? 'var(--urgent)' : 'var(--ink-3)' }}>
            {d === null ? '상시' : d === 0 ? 'D-DAY' : d > 0 ? `D-${d}` : `D+${-d}`}
            {job.deadline && <div style={{ color: 'var(--ink-4)' }}>{job.deadline.slice(5).replace('-', '/')}</div>}
          </div>
        </div>
        <JobActions job={job} />
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <Link href="/calendar" className="text-sm" style={{ color: 'var(--ink-2)' }}>←</Link>
          <h1 className="t-large">공고</h1>
        </div>
        <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>{jobs.length}건</span>
      </header>

      {promoted.length > 0 && (
        <section className="space-y-2.5">
          <div className="sec-label">지원예정 · {promoted.length}건</div>
          <div className="space-y-2.5">{promoted.map((j) => <Card key={j.id} job={j} />)}</div>
        </section>
      )}

      <section className="space-y-2.5">
        <div className="sec-label">마감 있는 공고 · {dated.length}건</div>
        {dated.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>다가오는 마감 공고가 없어요.</p>}
        <div className="space-y-2.5">{dated.map((j) => <Card key={j.id} job={j} />)}</div>
      </section>

      {anytime.length > 0 && (
        <details className="space-y-2.5">
          <summary className="sec-label cursor-pointer list-none">상시 채용 · {anytime.length}건 펼치기</summary>
          <div className="mt-2.5 space-y-2.5">{anytime.map((j) => <Card key={j.id} job={j} />)}</div>
        </details>
      )}
    </main>
  );
}
