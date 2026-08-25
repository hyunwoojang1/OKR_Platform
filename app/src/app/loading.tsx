// 홈 스켈레톤 — 클릭 즉시 뼈대가 떠서 "죽은 것 같은" 전환 지연을 없앤다 (QA 2번)
export default function HomeLoading() {
  return (
    <main className="animate-pulse space-y-4">
      <header className="pt-1">
        <div className="h-3.5 w-28 rounded" style={{ background: 'var(--line)' }} />
        <div className="mt-2 h-7 w-20 rounded" style={{ background: 'var(--line)' }} />
      </header>
      <div className="h-[88px] rounded-2xl" style={{ background: 'var(--line-soft, var(--line))' }} />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="tile h-64 lg:col-span-4" />
        <div className="tile h-64 lg:col-span-4" />
        <div className="space-y-4 lg:col-span-4">
          <div className="tile h-[120px]" />
          <div className="tile h-[120px]" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="tile h-48 lg:col-span-8" />
        <div className="tile h-48 lg:col-span-4" />
      </div>
    </main>
  );
}
