// 달력 스켈레톤 (QA 2번)
export default function CalendarLoading() {
  return (
    <main className="w-full animate-pulse">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <div className="h-7 w-16 rounded" style={{ background: 'var(--line)' }} />
          <div className="tile h-[340px]" />
          <div className="tile h-40" />
        </div>
        <div className="space-y-2.5 md:pt-[52px]">
          <div className="h-3 w-12 rounded" style={{ background: 'var(--line)' }} />
          <div className="tile h-28" />
          <div className="tile h-28" />
        </div>
      </div>
    </main>
  );
}
