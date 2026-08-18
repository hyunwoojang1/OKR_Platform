import { getAuctionPicks, getEconDigest, getHubJobs } from '@/lib/hub-sources';
import { sendJobToTask } from '@/lib/hub-actions';

export const dynamic = 'force-dynamic';

function won(n: number | null): string {
  if (n == null) return '-';
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  return `${Math.round(n / 10_000).toLocaleString()}만`;
}

// 데이터 허브: econ·경매·채용을 읽고, 쓰기는 「공고→할일」부터 (전부 Supabase 경유)
export default async function HubPage() {
  const [auction, econ, jobs] = await Promise.allSettled([getAuctionPicks(5), getEconDigest(), getHubJobs(12)]);

  return (
    <main className="space-y-4">
      <header>
        <h1 className="t-large">허브</h1>
        <p className="text-xs opacity-50">econ-dashboard · 경매 · 채용 크롤러가 여기로 모여요</p>
      </header>

      {/* 경매 추천 */}
      <section className="tile" style={{ borderLeft: '4px solid #f59e0b' }}>
        <h2 className="tile-title">🏠 경매 차익 추천 (보수 차익 기준)</h2>
        {auction.status === 'rejected' ? (
          <p className="text-xs text-red-500">불러오기 실패: {String(auction.reason).slice(0, 80)}</p>
        ) : auction.value.length === 0 ? (
          <p className="text-xs opacity-50">예정 매각기일 물건 없음</p>
        ) : (
          <ul className="space-y-1.5">
            {auction.value.map((a) => (
              <li key={a.case_no} className="flex items-baseline gap-2 text-sm">
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">{a.grade ?? '-'}</span>
                <span className="min-w-0 flex-1 truncate">{a.apt_name ?? a.address ?? a.case_no}</span>
                <span className="text-xs tabular-nums opacity-70">최저 {won(a.min_bid_price)}</span>
                <span className="text-xs font-medium tabular-nums text-emerald-600">+{won(a.profit_low)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* econ 다이제스트 */}
      <section className="tile" style={{ borderLeft: '4px solid #3b82f6' }}>
        <h2 className="tile-title">📊 경제 브리핑 (econ-dashboard)</h2>
        {econ.status === 'rejected' ? (
          <p className="text-xs text-red-500">불러오기 실패: {String(econ.reason).slice(0, 80)}</p>
        ) : (
          <>
            {econ.value.summary ? (
              <p className="text-sm leading-relaxed opacity-90">{econ.value.summary.slice(0, 200)}{econ.value.summary.length > 200 ? '…' : ''}</p>
            ) : (
              <p className="text-xs opacity-50">발행된 리포트 없음</p>
            )}
            {econ.value.topNews.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-[var(--line)] pt-2">
                {econ.value.topNews.map((n, i) => (
                  <li key={i} className="truncate text-xs opacity-70">· {n.title}</li>
                ))}
              </ul>
            )}
            {econ.value.reportDate && <p className="mt-1 text-[10px] opacity-40">{econ.value.reportDate} 리포트</p>}
          </>
        )}
      </section>

      {/* 채용 공고 → 할일 보내기 (쓰기 1호) */}
      <section className="tile" style={{ borderLeft: '4px solid #10b981' }}>
        <h2 className="tile-title">💼 최신 채용 공고</h2>
        {jobs.status === 'rejected' ? (
          <p className="text-xs text-red-500">불러오기 실패: {String(jobs.reason).slice(0, 80)}</p>
        ) : jobs.value.length === 0 ? (
          <p className="text-xs opacity-50">수집된 공고 없음</p>
        ) : (
          <ul className="space-y-1.5">
            {jobs.value.map((j) => (
              <li key={`${j.origin}-${j.id}`} className="flex items-center gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <a href={j.url} target="_blank" rel="noreferrer" className="block truncate hover:underline">
                    <b>{j.company}</b> {j.title}
                  </a>
                  <p className="text-[10px] opacity-50">
                    {j.source}{j.dday ? ` · ${j.dday}` : j.deadline ? ` · ~${j.deadline}` : ''}
                  </p>
                </div>
                {j.sent_to_task ? (
                  <span className="text-[10px] opacity-40">✓ 할일로 보냄</span>
                ) : (
                  <form action={sendJobToTask}>
                    <input type="hidden" name="origin" value={j.origin} />
                    <input type="hidden" name="id" value={String(j.id)} />
                    <input type="hidden" name="company" value={j.company} />
                    <input type="hidden" name="title" value={j.title} />
                    <input type="hidden" name="url" value={j.url} />
                    <button type="submit" className="btn whitespace-nowrap px-2.5 py-1.5 text-[12px]">
                      할일로 ↴
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
