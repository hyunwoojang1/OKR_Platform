// 공고 보드 스켈레톤 (QA 2번)
export default function JobsLoading() {
  return (
    <main className="animate-pulse space-y-5">
      <div className="h-7 w-16 rounded" style={{ background: 'var(--line)' }} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="tile h-40" />
        <div className="tile h-40" />
        <div className="tile h-40" />
        <div className="tile h-40" />
      </div>
    </main>
  );
}
