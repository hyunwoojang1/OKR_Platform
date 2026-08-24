import { getToday, getOkrTree, streakOf } from '@/lib/queries';
import { toggleTask, toggleHabitLog, createTask } from '@/lib/actions';
import Link from 'next/link';
import AddTaskSheet from './AddTaskSheet';

export const dynamic = 'force-dynamic';

const DAY_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

// Weekdone식 4색 신호등
function signal(pct: number): string {
  if (pct > 100) return 'var(--accent)';
  if (pct >= 66) return 'var(--up)';
  if (pct >= 33) return 'var(--warn)';
  return 'var(--down)';
}

export default async function TodayPage() {
  const [t, tree] = await Promise.all([getToday(), getOkrTree()]);
  const d = new Date(`${t.date}T00:00:00+09:00`);
  const openTasks = t.tasks.filter((x) => !x.done);
  const doneTasks = t.tasks.filter((x) => x.done);
  const areaOf = (id: string | null) => t.areas.find((a) => a.id === id);
  const habitDone = (id: string) => t.habitLogs.some((l) => l.habit_id === id && l.date === t.date && l.done);

  // ── KPI 재료 ──
  const taskPct = t.tasks.length ? Math.round((doneTasks.length / t.tasks.length) * 100) : 0;
  const habitsChecked = t.habits.filter((h) => habitDone(h.id)).length;
  const activeKRs = tree.keyResults.filter((kr) => {
    const obj = tree.objectives.find((o) => o.id === kr.objective_id);
    return obj?.status === 'active' && kr.target_value > 0;
  });
  const krAvg = activeKRs.length
    ? Math.round(activeKRs.reduce((s, kr) => s + Math.min(100, (kr.current_value / kr.target_value) * 100), 0) / activeKRs.length)
    : 0;
  const carried = openTasks.filter((x) => x.carried_over > 0).length;
  const maxStreak = Math.max(0, ...t.habits.map((h) => streakOf(h.id, t.habitLogs)));

  // OKR 진척: 영역별 활성 Objective
  const activeObjectives = tree.objectives.filter((o) => o.status === 'active');

  return (
    <main className="space-y-4">
      <header className="flex items-end justify-between pt-1">
        <div>
          <p className="t-sub">{Number(t.date.slice(5, 7))}월 {Number(t.date.slice(8, 10))}일 {DAY_KO[d.getDay()]}</p>
          <h1 className="t-large mt-0.5">오늘</h1>
        </div>
        <Link href="/settings" aria-label="설정" className="pressable rounded-full p-2 md:hidden" style={{ color: 'var(--ink-faint)' }}>
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.8v2.4M12 18.8v2.4M4.5 7.7l2 1.2M17.5 15.1l2 1.2M2.8 12h2.4M18.8 12h2.4M4.5 16.3l2-1.2M17.5 8.9l2-1.2" />
          </svg>
        </Link>
      </header>

      {/* KPI 밴드 (econ 「오늘의 시장」식) */}
      <div className="kpi-band rise">
        <div className="kpi">
          <p className="kpi-label">오늘 완료율</p>
          <p className="kpi-value">{taskPct}%</p>
          <p className="kpi-delta" style={{ color: signal(taskPct) }}>{doneTasks.length}/{t.tasks.length} 할일</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">습관</p>
          <p className="kpi-value">{habitsChecked}/{t.habits.length}</p>
          <p className="kpi-delta" style={{ color: maxStreak > 0 ? 'var(--gold)' : 'var(--ink-faint)' }}>
            {maxStreak > 0 ? `🔥 최장 ${maxStreak}일` : '오늘 체크 전'}
          </p>
        </div>
        <div className="kpi">
          <p className="kpi-label">분기 KR 평균</p>
          <p className="kpi-value">{krAvg}%</p>
          <p className="kpi-delta" style={{ color: signal(krAvg) }}>{activeKRs.length}개 지표</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">주간 이니셔티브</p>
          <p className="kpi-value">{t.weekInitiatives.length}</p>
          <p className="kpi-delta" style={{ color: 'var(--ink-faint)' }}>진행 중</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">이월 대기</p>
          <p className="kpi-value" style={carried > 0 ? { color: 'var(--warn)' } : undefined}>{carried}</p>
          <p className="kpi-delta" style={{ color: 'var(--ink-faint)' }}>{carried > 0 ? '오늘 정리 추천' : '깨끗함'}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">오늘 일정</p>
          <p className="kpi-value">{t.events.length}</p>
          <p className="kpi-delta" style={{ color: 'var(--ink-faint)' }}>
            {t.events[0] ? new Date(t.events[0].starts_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }) + ' 첫 일정' : '없음'}
          </p>
        </div>
      </div>

      {/* 대시보드 그리드: lg 12컬럼 (5/4/3) */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* 좌: 할일 */}
        <section className="tile rise lg:col-span-5">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="tile-title mb-0">오늘 할일</h2>
            <span className="t-cap">{doneTasks.length}/{t.tasks.length}</span>
          </div>
          {t.tasks.length === 0 && <p className="t-sub py-4 text-center">＋ 버튼으로 오늘을 설계해보세요</p>}
          <ul>
            {openTasks.map((task) => {
              const area = areaOf(task.area_id);
              return (
                <li key={task.id} className="row">
                  {area && <span className="row-bar" style={{ background: area.color }} />}
                  <form action={toggleTask} className="flex">
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="done" value="true" />
                    <button type="submit" aria-label="완료" className="check" style={area ? { borderColor: area.color } : undefined} />
                  </form>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{task.title}</p>
                    <p className="t-cap flex gap-1.5">
                      {area && <span style={{ color: area.color }}>{area.name}</span>}
                      {task.carried_over > 0 && <span style={{ color: 'var(--warn)' }}>이월 {task.carried_over}회</span>}
                      {task.due_date && <span>~{Number(task.due_date.slice(5, 7))}/{Number(task.due_date.slice(8, 10))}</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {doneTasks.length > 0 && (
            <details className="mt-1">
              <summary className="t-cap cursor-pointer px-2 py-1">완료 {doneTasks.length}</summary>
              <ul>
                {doneTasks.map((task) => (
                  <li key={task.id} className="row opacity-40">
                    <form action={toggleTask} className="flex">
                      <input type="hidden" name="id" value={task.id} />
                      <input type="hidden" name="done" value="false" />
                      <button type="submit" aria-label="되돌리기" className="check on" style={{ background: 'var(--ink-faint)', borderColor: 'var(--ink-faint)' }}>✓</button>
                    </form>
                    <span className="truncate text-[14px] line-through">{task.title}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {/* 이번 주 이니셔티브 → 원탭 내리기 */}
          {t.weekInitiatives.length > 0 && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <p className="sec-label mb-2">이번 주 이니셔티브</p>
              <ul className="flex flex-wrap gap-1.5">
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
            </div>
          )}
        </section>

        {/* 중: OKR 진척 */}
        <section className="tile rise lg:col-span-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="tile-title mb-0">분기 OKR 진척</h2>
            <Link href="/okr" className="t-cap underline">전체 →</Link>
          </div>
          {activeObjectives.length === 0 && (
            <p className="t-sub py-4 text-center">
              아직 분기 목표가 없어요. <Link href="/okr" className="underline" style={{ color: 'var(--accent)' }}>목표 세우러 가기 →</Link>
            </p>
          )}
          <ul className="space-y-3">
            {activeObjectives.map((obj) => {
              const area = areaOf(obj.area_id);
              const krs = tree.keyResults.filter((k) => k.objective_id === obj.id && k.target_value > 0);
              const pct = krs.length
                ? Math.round(krs.reduce((s, k) => s + Math.min(100, (k.current_value / k.target_value) * 100), 0) / krs.length)
                : 0;
              return (
                <li key={obj.id}>
                  <div className="mb-1 flex items-baseline gap-2">
                    {area && <span className="area-dot" style={{ background: area.color }} />}
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{obj.title}</span>
                    <span className="text-[12px] font-bold tabular-nums" style={{ color: signal(pct) }}>{pct}%</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: signal(pct) }} />
                  </div>
                  {krs.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 pl-4">
                      {krs.slice(0, 3).map((kr) => (
                        <li key={kr.id} className="flex items-baseline gap-1.5 text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>
                          <span className="min-w-0 flex-1 truncate">{kr.title}</span>
                          <span className="tabular-nums" style={{ color: 'var(--ink-faint)' }}>
                            {Number(kr.current_value)}/{Number(kr.target_value)}{kr.unit}
                            {kr.source !== 'manual' && ' ⚡'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* 우: 습관 + 일정 */}
        <div className="space-y-4 lg:col-span-3">
          <section className="tile rise">
            <h2 className="tile-title">습관</h2>
            <ul className="space-y-2">
              {t.habits.map((h) => {
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
                      <button type="submit" aria-label={h.title} className={`check ${done ? 'on' : ''}`}
                        style={done ? { background: color, borderColor: color } : { borderColor: color }}>
                        {done ? '✓' : ''}
                      </button>
                    </form>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{h.title}</span>
                    {streak > 0 && <span className="badge" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}>🔥{streak}</span>}
                  </li>
                );
              })}
              {t.habits.length === 0 && <li className="t-cap opacity-60">등록된 습관 없음</li>}
            </ul>
          </section>

          <section className="tile rise">
            <h2 className="tile-title">오늘 일정</h2>
            <ul className="space-y-1.5">
              {t.events.map((e) => (
                <li key={e.id} className="flex gap-2 text-[12.5px]">
                  <span className="w-9 font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
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
      </div>

      <AddTaskSheet areas={t.areas} />
    </main>
  );
}
