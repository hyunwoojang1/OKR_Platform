import { getHabitsWithLogs, getAreas, streakOf, weekCountOf } from '@/lib/queries';
import { createHabit, toggleHabitLog } from '@/lib/actions';
import { kstToday } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Streaks식 잔디 히트맵: 최근 28일
function heatDates(): string[] {
  const out: string[] = [];
  for (let i = 27; i >= 0; i--) {
    out.push(new Date(Date.now() + 9 * 3600_000 - i * 86400_000).toISOString().slice(0, 10));
  }
  return out;
}

export default async function HabitsPage() {
  const [{ habits, logs }, areas] = await Promise.all([getHabitsWithLogs(28), getAreas()]);
  const today = kstToday();
  const dates = heatDates();

  return (
    <main className="space-y-4">
      <h1 className="t-large">습관</h1>

      {habits.length === 0 && <p className="text-sm opacity-60">아직 습관이 없어요. 아래에서 첫 습관을 만들어보세요.</p>}

      {habits.map((h) => {
        const area = areas.find((a) => a.id === h.area_id);
        const color = area?.color ?? '#6b7280';
        const doneToday = logs.some((l) => l.habit_id === h.id && l.date === today && l.done);
        const streak = streakOf(h.id, logs);
        const weekCount = weekCountOf(h.id, logs);
        const weekPct = Math.min(100, Math.round((weekCount / h.target_per_week) * 100));
        const doneSet = new Set(logs.filter((l) => l.habit_id === h.id && l.done).map((l) => l.date));
        return (
          <section key={h.id} className="tile">
            <div className="flex items-center gap-3">
              {/* 오늘 체크 토글 */}
              <form action={toggleHabitLog}>
                <input type="hidden" name="habit_id" value={h.id} />
                <input type="hidden" name="date" value={today} />
                <input type="hidden" name="done" value={String(!doneToday)} />
                <button
                  type="submit"
                  aria-label={doneToday ? '오늘 체크 해제' : '오늘 체크'}
                  className={`check check-lg ${doneToday ? "on" : ""}`}
                  style={doneToday ? { background: color, borderColor: color, color: '#fff' } : { borderColor: color }}
                >
                  {doneToday ? '✓' : ''}
                </button>
              </form>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-medium">
                  <span className="area-dot" style={{ background: color }} />
                  <span className="truncate">{h.title}</span>
                </p>
                <p className="text-xs opacity-60">
                  {streak > 0 ? `🔥 ${streak}일 연속 · ` : ''}이번 주 {weekCount}/{h.target_per_week}회
                </p>
              </div>
              {/* Habitify식 주간 진행률 링 */}
              <svg width="36" height="36" viewBox="0 0 36 36" aria-label={`주간 달성률 ${weekPct}%`}>
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--line)" strokeWidth="4" />
                <circle
                  cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={`${(weekPct / 100) * 94.2} 94.2`} transform="rotate(-90 18 18)"
                />
              </svg>
            </div>
            {/* 28일 잔디 */}
            <div className="mt-3.5 grid grid-cols-[repeat(14,1fr)] gap-1" role="img" aria-label="최근 28일 기록">
              {dates.map((d) => (
                <div
                  key={d}
                  title={d}
                  className="heat"
                  style={{ background: doneSet.has(d) ? color : 'var(--line)', opacity: doneSet.has(d) ? 1 : 0.5 }}
                />
              ))}
            </div>
          </section>
        );
      })}

      <details className="tile">
        <summary className="cursor-pointer text-sm font-medium opacity-70">＋ 새 습관</summary>
        <form action={createHabit} className="mt-2 space-y-2 text-sm">
          <input name="title" placeholder="예: 운동 30분" className="w-full" required />
          <div className="flex gap-2">
            <select name="area_id" className="flex-1" defaultValue="">
              <option value="">영역 없음</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </select>
            <select name="cadence" defaultValue="daily">
              <option value="daily">매일</option>
              <option value="weekly">주 N회</option>
            </select>
            <input name="target_per_week" type="number" min="1" max="7" defaultValue="3" className="w-16" aria-label="주 목표 횟수" />
          </div>
          <button type="submit" className="btn btn-primary w-full py-2.5">만들기</button>
        </form>
      </details>
    </main>
  );
}
