import { getToday, streakOf } from '@/lib/queries';
import { toggleTask, toggleHabitLog, saveReview } from '@/lib/actions';
import { db } from '@/lib/db';
import type { DailyReview } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ClosePage() {
  const t = await getToday();
  const { data: reviewData } = await db().from('daily_reviews').select('*').eq('date', t.date).maybeSingle();
  const review = reviewData as DailyReview | null;
  const openTasks = t.tasks.filter((x) => !x.done);
  const doneCount = t.tasks.length - openTasks.length;
  const uncheckedHabits = t.habits.filter((h) => !t.habitLogs.some((l) => l.habit_id === h.id && l.date === t.date && l.done));
  const checkedHabits = t.habits.length - uncheckedHabits.length;
  const allClear = openTasks.length === 0 && uncheckedHabits.length === 0;

  return (
    <main className="space-y-4">
      <header>
        <p className="text-sm opacity-60">{t.date}</p>
        <h1 className="t-large">하루 마감</h1>
      </header>

      {/* 요약 한 줄 */}
      <section className="tile">
        <p className="text-sm">
          할일 <b>{doneCount}/{t.tasks.length}</b> · 습관 <b>{checkedHabits}/{t.habits.length}</b>
          {allClear && ' — 완벽한 하루! 🎉'}
        </p>
      </section>

      {/* 10초 마감: 남은 항목 큰 탭 */}
      {openTasks.length > 0 && (
        <section className="tile">
          <h2 className="tile-title">남은 할일 — 한 게 있으면 탭</h2>
          <ul className="space-y-2">
            {openTasks.map((task) => {
              const area = t.areas.find((a) => a.id === task.area_id);
              return (
                <li key={task.id}>
                  <form action={toggleTask}>
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="done" value="true" />
                    <button type="submit" className="pressable flex w-full items-center gap-3 rounded-xl p-3 text-left text-[15px] font-medium" style={{ background: "var(--card-2)" }}>
                      <span className="check" style={{ borderColor: area?.color ?? "var(--line)" }} />
                      {task.title}
                      <span className="ml-auto text-xs opacity-40">안 했으면 내일로 자동 이월</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {uncheckedHabits.length > 0 && (
        <section className="tile">
          <h2 className="tile-title">오늘 안 한 습관 — 했으면 탭</h2>
          <ul className="space-y-2">
            {uncheckedHabits.map((h) => {
              const area = t.areas.find((a) => a.id === h.area_id);
              const color = area?.color ?? '#6b7280';
              const streak = streakOf(h.id, t.habitLogs);
              return (
                <li key={h.id}>
                  <form action={toggleHabitLog}>
                    <input type="hidden" name="habit_id" value={h.id} />
                    <input type="hidden" name="date" value={t.date} />
                    <input type="hidden" name="done" value="true" />
                    <button type="submit" className="pressable flex w-full items-center gap-3 rounded-xl p-3 text-left text-[15px] font-medium" style={{ background: "var(--card-2)" }}>
                      <span className="check" style={{ borderColor: color }} />
                      {h.title}
                      {streak > 0 && <span className="ml-auto text-xs opacity-60">🔥{streak} 유지 중</span>}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 한 줄 회고 (선택) — 향후 일기 볼트로 흘러가는 원천 */}
      <section className="tile">
        <h2 className="tile-title">오늘 한 줄 {review?.note ? '· 저장됨 ✓' : '(선택)'}</h2>
        <form action={saveReview} className="flex gap-2">
          <input type="hidden" name="date" value={t.date} />
          <input type="hidden" name="checked_count" value={doneCount + checkedHabits} />
          <input name="note" defaultValue={review?.note ?? ''} placeholder="오늘을 한 줄로…" className="flex-1 text-sm" maxLength={300} />
          <button type="submit" className="btn btn-primary px-5">저장</button>
        </form>
      </section>
    </main>
  );
}
