import { getOkrTree } from '@/lib/queries';
import { createArea, createObjective, createKeyResult, createMilestone, createInitiative, updateKRProgress, setStatus } from '@/lib/actions';
import { kstQuarter, kstMonth, kstMonday } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Weekdone식 4색 신호등: 진척률 → 색
function signal(pct: number): string {
  if (pct > 100) return '#3b82f6';
  if (pct >= 66) return '#10b981';
  if (pct >= 33) return '#f59e0b';
  return '#ef4444';
}

export default async function OkrPage() {
  const tree = await getOkrTree();

  return (
    <main className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">목표</h1>
        <span className="text-sm opacity-60">{kstQuarter()}</span>
      </header>

      {tree.areas.map((area) => {
        const objectives = tree.objectives.filter((o) => o.area_id === area.id);
        return (
          <section key={area.id} className="tile" style={{ borderLeft: `4px solid ${area.color}` }}>
            <div className="mb-3 flex items-center gap-2">
              <span aria-hidden>{area.icon}</span>
              <h2 className="font-semibold">{area.name}</h2>
              <span className="text-xs opacity-50">{objectives.length}개 목표</span>
            </div>

            {objectives.map((obj) => {
              const krs = tree.keyResults.filter((k) => k.objective_id === obj.id);
              const milestones = tree.milestones.filter((m) => m.objective_id === obj.id);
              const avgPct = krs.length
                ? Math.round(krs.reduce((s, k) => s + Math.min(150, (k.current_value / k.target_value) * 100), 0) / krs.length)
                : 0;
              return (
                <details key={obj.id} className="group mb-2 rounded-xl border border-[var(--line)] p-3" open={obj.status === 'active'}>
                  <summary className="flex cursor-pointer items-center gap-2 list-none">
                    <span className={`text-sm font-medium ${obj.status === 'done' ? 'line-through opacity-50' : ''}`}>{obj.title}</span>
                    <span className="ml-auto text-xs tabular-nums" style={{ color: signal(avgPct) }}>{avgPct}%</span>
                  </summary>

                  <div className="mt-3 space-y-3 pl-1">
                    {/* KR 목록: 진척바 + 인라인 갱신 */}
                    {krs.map((kr) => {
                      const pct = Math.min(100, Math.round((kr.current_value / kr.target_value) * 100));
                      return (
                        <div key={kr.id} className="text-sm">
                          <div className="flex items-center gap-2">
                            <span className="area-dot" style={{ background: signal(pct) }} />
                            <span className="flex-1">{kr.title}</span>
                            <form action={updateKRProgress} className="flex items-center gap-1">
                              <input type="hidden" name="id" value={kr.id} />
                              <input name="current_value" defaultValue={kr.current_value} inputMode="decimal" className="w-16 text-right text-xs" aria-label="현재값" />
                              <span className="text-xs opacity-60">/ {kr.target_value}{kr.unit}</span>
                              <button type="submit" className="px-1.5 py-0.5 text-xs opacity-60 hover:opacity-100">저장</button>
                            </form>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: signal(pct) }} />
                          </div>
                          {kr.source !== 'manual' && <p className="mt-0.5 text-[10px] opacity-50">자동: {kr.source} {kr.source_ref ?? ''}</p>}
                        </div>
                      );
                    })}
                    <form action={createKeyResult} className="flex flex-wrap items-center gap-1.5 text-xs">
                      <input type="hidden" name="objective_id" value={obj.id} />
                      <input name="title" placeholder="새 KR" className="flex-1 min-w-32" required />
                      <input name="target_value" placeholder="목표값" inputMode="decimal" className="w-16" required />
                      <input name="unit" placeholder="단위" className="w-12" />
                      <button type="submit" className="border border-[var(--line)] px-2 py-1">＋KR</button>
                    </form>

                    {/* 월 마일스톤 */}
                    <div className="space-y-1.5 border-t border-[var(--line)] pt-2">
                      {milestones.map((ms) => {
                        const inis = tree.initiatives.filter((i) => i.milestone_id === ms.id);
                        return (
                          <div key={ms.id} className="text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium opacity-60">{ms.month}</span>
                              <span className={ms.status === 'done' ? 'line-through opacity-50' : ''}>{ms.title}</span>
                              {ms.status === 'active' && (
                                <form action={setStatus} className="ml-auto">
                                  <input type="hidden" name="table" value="milestones" />
                                  <input type="hidden" name="id" value={ms.id} />
                                  <input type="hidden" name="status" value="done" />
                                  <button type="submit" className="text-xs opacity-50 hover:opacity-100">완료</button>
                                </form>
                              )}
                            </div>
                            {inis.length > 0 && (
                              <ul className="mt-1 space-y-0.5 pl-4 text-xs opacity-80">
                                {inis.map((i) => (
                                  <li key={i.id} className={i.status === 'done' ? 'line-through opacity-50' : ''}>
                                    {i.priority === 1 ? '⚡ ' : ''}{i.title} <span className="opacity-40">({i.week_of}주)</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <form action={createInitiative} className="mt-1 flex gap-1.5 pl-4 text-xs">
                              <input type="hidden" name="milestone_id" value={ms.id} />
                              <input type="hidden" name="area_id" value={area.id} />
                              <input type="hidden" name="week_of" value={kstMonday()} />
                              <input name="title" placeholder="이번 주 이니셔티브" className="flex-1" required />
                              <button type="submit" className="border border-[var(--line)] px-2">＋</button>
                            </form>
                          </div>
                        );
                      })}
                      <form action={createMilestone} className="flex gap-1.5 text-xs">
                        <input type="hidden" name="objective_id" value={obj.id} />
                        <input name="month" defaultValue={kstMonth()} className="w-20" required />
                        <input name="title" placeholder="새 월 마일스톤" className="flex-1" required />
                        <button type="submit" className="border border-[var(--line)] px-2 py-1">＋마일스톤</button>
                      </form>
                    </div>
                  </div>
                </details>
              );
            })}

            <form action={createObjective} className="mt-2 flex gap-1.5 text-xs">
              <input type="hidden" name="area_id" value={area.id} />
              <input type="hidden" name="period" value={kstQuarter()} />
              <input name="title" placeholder={`${area.name} 분기 목표 추가`} className="flex-1" required />
              <button type="submit" className="border border-[var(--line)] px-2 py-1">＋목표</button>
            </form>
          </section>
        );
      })}

      <details className="tile">
        <summary className="cursor-pointer text-sm font-medium opacity-70">＋ 새 영역</summary>
        <form action={createArea} className="mt-2 flex gap-1.5 text-sm">
          <input name="icon" placeholder="🏷" className="w-12" />
          <input name="name" placeholder="영역 이름" className="flex-1" required />
          <input name="color" type="color" defaultValue="#3b82f6" className="h-9 w-12 p-0.5" />
          <button type="submit" className="border border-[var(--line)] px-3">추가</button>
        </form>
      </details>
    </main>
  );
}
