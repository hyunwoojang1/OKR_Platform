import { getToday, streakOf } from '@/lib/queries';
import { toggleTask, toggleHabitLog, createTask } from '@/lib/actions';
import Link from 'next/link';
import AddTaskSheet from './AddTaskSheet';

export const dynamic = 'force-dynamic';

const DAY_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export default async function TodayPage() {
  const t = await getToday();
  const d = new Date(`${t.date}T00:00:00+09:00`);
  const openTasks = t.tasks.filter((x) => !x.done);
  const doneTasks = t.tasks.filter((x) => x.done);
  const areaOf = (id: string | null) => t.areas.find((a) => a.id === id);
  const habitDone = (id: string) => t.habitLogs.some((l) => l.habit_id === id && l.date === t.date && l.done);

  return (
    <main className="space-y-4">
      <header className="flex items-end justify-between pt-2">
        <div>
          <p className="t-sub">{Number(t.date.slice(5, 7))}월 {Number(t.date.slice(8, 10))}일 {DAY_KO[d.getDay()]}</p>
          <h1 className="t-large mt-0.5">오늘</h1>
        </div>
        <Link href="/settings" aria-label="설정" className="pressable rounded-full p-2" style={{ color: 'var(--ink-faint)' }}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.8v2.4M12 18.8v2.4M4.5 7.7l2 1.2M17.5 15.1l2 1.2M2.8 12h2.4M18.8 12h2.4M4.5 16.3l2-1.2M17.5 8.9l2-1.2" />
          </svg>
        </Link>
      </header>

      {/* 오늘 할일 */}
      <section className="tile rise">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="tile-title mb-0">할일</h2>
          <span className="t-cap">{doneTasks.length}/{t.tasks.length} 완료</span>
        </div>
        {openTasks.length === 0 && t.tasks.length === 0 && (
          <p className="t-sub py-3 text-center">오른쪽 아래 ＋ 로 오늘을 설계해보세요</p>
        )}
        {openTasks.length === 0 && t.tasks.length > 0 && (
          <p className="t-sub py-3 text-center">전부 완료 — 완벽한 하루 🎉</p>
        )}
        <ul>
          {openTasks.map((task) => {
            const area = areaOf(task.area_id);
            return (
              <li key={task.id} className="row" style={{ background: 'transparent' }}>
                {area && <span className="row-bar" style={{ background: area.color }} />}
                <form action={toggleTask} className="flex">
                  <input type="hidden" name="id" value={task.id} />
                  <input type="hidden" name="done" value="true" />
                  <button type="submit" aria-label="완료" className="check" style={area ? { borderColor: area.color } : undefined} />
                </form>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{task.title}</p>
                  <p className="t-cap flex gap-1.5">
                    {area && <span style={{ color: area.color }}>{area.name}</span>}
                    {task.carried_over > 0 && <span style={{ color: '#d97706' }}>이월 {task.carried_over}회</span>}
                    {task.due_date && <span>~{Number(task.due_date.slice(5, 7))}/{Number(task.due_date.slice(8, 10))}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {doneTasks.length > 0 && (
          <details className="mt-1">
            <summary className="t-cap cursor-pointer px-3 py-1">완료 {doneTasks.length}</summary>
            <ul>
              {doneTasks.map((task) => (
                <li key={task.id} className="row opacity-45">
                  <form action={toggleTask} className="flex">
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="done" value="false" />
                    <button type="submit" aria-label="되돌리기" className="check on" style={{ background: 'var(--ink-faint)', borderColor: 'var(--ink-faint)' }}>✓</button>
                  </form>
                  <span className="truncate text-[15px] line-through">{task.title}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        {/* 습관 */}
        <section className="tile rise pressable">
          <h2 className="tile-title">습관</h2>
          <ul className="space-y-2.5">
            {t.habits.slice(0, 5).map((h) => {
              const area = areaOf(h.area_id);
              const color = area?.color ?? 'var(--ink-faint)';
              const done = habitDone(h.id);
              const streak = streakOf(h.id, t.habitLogs);
              return (
                <li key={h.id} className="flex items-center gap-2.5">
                  <form action={toggleHabitLog} className="flex">
                    <input type="hidden" name="habit_id" value={h.id} />
                    <input type="hidden" name="date" value={t.date} />
                    <input type="hidden" name="done" value={String(!done)} />
                    <button
                      type="submit"
                      aria-label={h.title}
                      className={`check ${done ? 'on' : ''}`}
                      style={done ? { background: color, borderColor: color } : { borderColor: color }}
                    >
                      {done ? '✓' : ''}
                    </button>
                  </form>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{h.title}</p>
                    {streak > 0 && <p className="t-cap">🔥 {streak}일째</p>}
                  </div>
                </li>
              );
            })}
            {t.habits.length === 0 && (
              <li className="t-cap"><Link href="/habits" className="underline">첫 습관 만들기 →</Link></li>
            )}
          </ul>
        </section>

        {/* 일정 */}
        <section className="tile rise pressable">
          <h2 className="tile-title">일정</h2>
          <ul className="space-y-2">
            {t.events.map((e) => (
              <li key={e.id} className="flex gap-2 text-[13px]">
                <span className="w-10 font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                  {e.all_day ? '종일' : new Date(e.starts_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
              </li>
            ))}
            {t.events.length === 0 && <li className="t-cap">일정 없음</li>}
          </ul>
          <Link href="/calendar" className="t-cap mt-2 block underline">캘린더 →</Link>
        </section>
      </div>

      {/* 이번 주 이니셔티브 */}
      {t.weekInitiatives.length > 0 && (
        <section className="tile rise">
          <h2 className="tile-title">이번 주 이니셔티브</h2>
          <ul className="flex flex-wrap gap-2">
            {t.weekInitiatives.map((i) => {
              const area = areaOf(i.area_id);
              return (
                <li key={i.id}>
                  <form action={createTask}>
                    <input type="hidden" name="title" value={i.title} />
                    <input type="hidden" name="area_id" value={i.area_id ?? ''} />
                    <input type="hidden" name="initiative_id" value={i.id} />
                    <button type="submit" className="chip pressable" title="오늘 할일로 내리기">
                      {area && <span className="area-dot" style={{ background: area.color }} />}
                      {i.priority === 1 && '⚡'}{i.title}
                      <span style={{ color: 'var(--ink-faint)' }}>↴</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <AddTaskSheet areas={t.areas} />
    </main>
  );
}
