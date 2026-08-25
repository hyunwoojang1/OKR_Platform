// 목표 목록 스켈레톤 (QA 2번)
export default function OkrLoading() {
  return (
    <main className="mx-auto max-w-5xl animate-pulse space-y-5">
      <header className="flex items-center justify-between">
        <div className="h-7 w-16 rounded" style={{ background: 'var(--line)' }} />
        <div className="h-9 w-9 rounded-full" style={{ background: 'var(--line)' }} />
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="tile h-40" />
        <div className="tile h-40" />
        <div className="tile h-40" />
        <div className="tile h-40" />
      </div>
    </main>
  );
}
