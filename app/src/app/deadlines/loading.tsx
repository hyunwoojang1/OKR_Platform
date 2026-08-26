// 지난 마감 스켈레톤 — 달력에서 넘어올 때 빈 화면이 깜빡이지 않게.
export default function DeadlinesLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl animate-pulse space-y-5">
      <div className="h-7 w-28 rounded" style={{ background: 'var(--line)' }} />
      <div className="tile h-16" />
      <div className="tile h-44" />
      <div className="tile h-32" />
    </main>
  );
}
