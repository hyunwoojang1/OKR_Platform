// 목표 상세 스켈레톤 (QA 2번)
export default function GoalDetailLoading() {
  return (
    <main className="mx-auto max-w-2xl animate-pulse space-y-6">
      <div className="h-4 w-14 rounded" style={{ background: 'var(--line)' }} />
      <div className="space-y-3">
        <div className="h-3 w-24 rounded" style={{ background: 'var(--line)' }} />
        <div className="h-8 w-3/4 rounded" style={{ background: 'var(--line)' }} />
        <div className="h-1.5 w-full rounded" style={{ background: 'var(--line)' }} />
      </div>
      <div className="tile h-36" />
      <div className="tile h-44" />
      <div className="tile h-32" />
    </main>
  );
}
