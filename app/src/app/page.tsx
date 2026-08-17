import { getToday, streakOf } from '@/lib/queries';
import { createTask, toggleTask, toggleHabitLog } from '@/lib/actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export default async function TodayPage() {
  const t = await getToday();
  const dayIdx = new Date(`${t.date}T00:00:00+09:00`).getDay();
  const openTasks = t.tasks.filter((x) => !x.done);
  const doneTasks = t.tasks.filter((x) => x.done);
  const areaOf = (id: string | null) => t.areas.find((a) => a.id === id);

  return (
    <main className="space-y-4">
      <header>
        <p className="text-sm opacity-60">{t.date} ({DAY_KO[dayIdx]})</p>
        <h1 className="text-2xl font-bold tracking-tight">오늘</h1>
      </header>

      {/* 벤토 그리드: 한 타일 = 한 지표 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 오늘 할일 — 메인 타일 (전체폭) */}
        <section className="tile col-span-2">
          <h2 className="tile-title">오늘 할일 · 남은 {openTasks.length}</h2>
          <ul className="space-y-1.5">
            {openTasks.map((task) => {
              const area = areaOf(task.area_id);
              return (
                <li key={task.id} className="flex items-center gap-2.5">
                  <form action={toggleTask}>
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="done" value="true" />
                    <button
                      type="submit"
                      aria-label="완료"
                      className="h-6 w-6 rounded-full border-2 transition hover:scale-110"
                      style={{ borderColor: area?.color ?? 'var(--line)' }}
                    />
                  </form>
                  <span className="flex-1 text-sm">
                    {task.title}
                    {task.carried_over > 0 && (
                      <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-600">이월 {task.carried_over}</span>
                    )}
                    {task.due_date && <span className="ml-1.5 text-[10px] opacity-50">~{task.due_date.slice(5)}</span>}
                  </span>
                  {area && <span className="area-dot" style={{ background: area.color }} title={area.name} />}
                </li>
              );
            })}
            {openTasks.length === 0 && <li className="text-sm opacity-50">남은 할일이 없어요 🎉</li>}
          </ul>
          {doneTasks.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs opacity-50">완료 {doneTasks.length}개</summary>
              <ul className="mt-1 space-y-1">
                {doneTasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-2 text-sm line-through opacity-40">
                    <form action={toggleTask}>
                      <input type="hidden" name="id" value={task.id} />
                      <input type="hidden" name="done" value="false" />
                      <button type="submit" aria-label="되돌리기" className="h-5 w-5 rounded-full bg-[var(--line)]">✓</button>
                    </form>
                    {task.title}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <form action={createTask} className="mt-3 flex gap-1.5">
            <input name="title" placeholder="할일 추가…" className="flex-1 text-sm" required />
            <select name="area_id" className="w-24 text-xs" defaultValue="">
              <option value="">영역</option>
              {t.areas.map((a) => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </select>
            <button type="submit" className="border border-[var(--line)] px-3 text-sm">＋</button>
          </form>
        </section>

        {/* 오늘의 습관 — 원탭 체크 */}
        <section className="tile">
          <h2 className="tile-title">오늘의 습관</h2>
          <ul className="space-y-2">
            {t.habits.map((h) => {
              const area = areaOf(h.area_id);
              const color = area?.color ?? '#6b7280';
              const doneToday = t.habitLogs.some((l) => l.habit_id === h.id && l.date === t.date && l.done);
              const streak = streakOf(h.id, t.habitLogs);
              return (
                <li key={h.id} className="flex items-center gap-2">
                  <form action={toggleHabitLog}>
                    <input type="hidden" name="habit_id" value={h.id} />
                    <input type="hidden" name="date" value={t.date} />
                    <input type="hidden" name="done" value={String(!doneToday)} />
                    <button
                      type="submit"
                      aria-label={h.title}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs transition"
                      style={doneToday ? { background: color, borderColor: color, color: '#fff' } : { borderColor: color }}
                    >
                      {doneToday ? '✓' : ''}
                    </button>
                  </form>
                  <span className="min-w-0 flex-1 truncate text-xs">{h.title}</span>
                  {streak > 0 && <span className="text-[10px] opacity-60">🔥{streak}</span>}
                </li>
              );
            })}
            {t.habits.length === 0 && (
              <li className="text-xs opacity-50"><Link href="/habits" className="underline">습관 만들기 →</Link></li>
            )}
          </ul>
        </section>

        {/* 오늘 일정 */}
        <section className="tile">
          <h2 className="tile-title">오늘 일정</h2>
          <ul className="space-y-1.5">
            {t.events.map((e) => (
              <li key={e.id} className="text-xs">
                <span className="font-medium tabular-nums">
                  {e.all_day ? '종일' : new Date(e.starts_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })}
                </span>
                <span className="ml-1.5">{e.title}</span>
              </li>
            ))}
            {t.events.length === 0 && <li className="text-xs opacity-50">일정 없음</li>}
          </ul>
          <Link href="/calendar" className="mt-2 block text-[11px] opacity-50 underline">캘린더 →</Link>
        </section>

        {/* 이번 주 이니셔티브 */}
        <section className="tile col-span-2">
          <h2 className="tile-title">이번 주 이니셔티브</h2>
          {t.weekInitiatives.length === 0 ? (
            <p className="text-xs opacity-50"><Link href="/okr" className="underline">목표에서 이번 주 이니셔티브를 정해보세요 →</Link></p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {t.weekInitiatives.map((i) => {
                const area = areaOf(i.area_id);
                return (
                  <li key={i.id} className="flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs">
                    {area && <span className="area-dot" style={{ background: area.color }} />}
                    {i.priority === 1 && '⚡'}{i.title}
                    <form action={createTask}>
                      <input type="hidden" name="title" value={i.title} />
                      <input type="hidden" name="area_id" value={i.area_id ?? ''} />
                      <input type="hidden" name="initiative_id" value={i.id} />
                      <button type="submit" title="오늘 할일로" className="opacity-40 hover:opacity-100">↴</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
