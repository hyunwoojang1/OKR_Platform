import Link from 'next/link';
import { db } from '@/lib/db';
import { getToday, getOkrTree, streakOf } from '@/lib/queries';
import { toggleTask, toggleHabitLog, createTask, togglePinEvent, togglePinObjective, sendJobCommand } from '@/lib/actions';
import type { CalendarEvent, JobPosting, SessionLog } from '@/lib/types';
import { kstToday, krPct } from '@/lib/types';
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
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
}
function kstNowHM(): string {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
}

// v4 홈 = 기존 조종석(KPI·할일·OKR 진척·습관) + 그릴 확정 위젯 3종(D-day 보드·어제의 나·오늘 타임라인)의 합본.
// 맥시멀 원칙: 빼지 말고 더하되, 전부 실데이터로 살아 있을 것.
export default async function TodayPage() {
  const today = kstToday();
  const dayStart = new Date(`${today}T00:00:00+09:00`).toISOString();
  const yStart = new Date(new Date(dayStart).getTime() - 86400_000).toISOString();

  const [t, tree, jobsQ, pinQ, ylogQ] = await Promise.all([
    getToday(),
    getOkrTree(),
    db().from('job_postings').select('*').eq('deadline', today).eq('stage', '지원예정'),
    db().from('calendar_events').select('*').eq('pinned', true).gte('starts_at', dayStart).order('starts_at').limit(10),
    db().from('session_logs').select('*').gte('logged_at', yStart).lt('logged_at', dayStart).order('logged_at'),
  ]);
  for (const q of [jobsQ, pinQ, ylogQ]) {
    if (q.error) throw new Error(`홈 조회 실패: ${q.error.message}`);
  }
  const dueJobs = jobsQ.data as JobPosting[];
  const pinnedEvents = pinQ.data as CalendarEvent[];
  const yLogs = ylogQ.data as SessionLog[];

  const todayDow = new Date(new Date(`${today}T00:00:00+09:00`).getTime() + 9 * 3600_000).getUTCDay();
  const openTasks = t.tasks.filter((x) => !x.done);
  const doneTasks = t.tasks.filter((x) => x.done);
  const areaOf = (id: string | null) => t.areas.find((a) => a.id === id);
  const habitDone = (id: string) => t.habitLogs.some((l) => l.habit_id === id && l.date === t.date && l.done);

  // ── KPI 재료 (기존) ──
  const taskPct = t.tasks.length ? Math.round((doneTasks.length / t.tasks.length) * 100) : 0;
  const habitsChecked = t.habits.filter((h) => habitDone(h.id)).length;
  const activeKRs = tree.keyResults.filter((kr) => {
    const obj = tree.objectives.find((o) => o.id === kr.objective_id);
    return obj?.status === 'active' && kr.target_value > 0;
  });
  const krAvg = activeKRs.length
    ? Math.round(activeKRs.reduce((s, kr) => s + krPct(kr), 0) / activeKRs.length)
    : 0;
  const carried = openTasks.filter((x) => x.carried_over > 0).length;
  const maxStreak = Math.max(0, ...t.habits.map((h) => streakOf(h.id, t.habitLogs)));
  const activeObjectives = tree.objectives.filter((o) => o.status === 'active');

  // ── D-day 보드: 활성 목표 마감(자동) + 핀 일정 ──
  const todayT = new Date(`${today}T00:00:00+09:00`).getTime();
  const ddayOf = (dateStr: string) => Math.round((new Date(`${dateStr}T00:00:00+09:00`).getTime() - todayT) / 86400_000);
  const board = [
    ...activeObjectives.filter((g) => g.due_date && g.pinned).map((g) => ({
      key: `g-${g.id}`, kind: 'goal' as const, title: g.title, date: g.due_date!, dday: ddayOf(g.due_date!),
      href: `/okr/${g.id}`, eventId: null as string | null, objectiveId: g.id as string | null,
    })),
    ...pinnedEvents.map((e) => {
      const dateStr = new Date(new Date(e.starts_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
      return { key: `e-${e.id}`, kind: 'pin' as const, title: e.title, date: dateStr, dday: ddayOf(dateStr), href: null, eventId: e.id, objectiveId: null as string | null };
    }),
  ]
    .filter((b) => b.dday >= 0)
    .sort((a, b) => a.dday - b.dday)
    .slice(0, 6);

  // ── 타임라인 재료 ──
  const allDay = t.events.filter((e) => e.all_day);
  const timed = t.events.filter((e) => !e.all_day);
  const nowHM = kstNowHM();

  // ── 어제의 나 ──
  const yChecks = yLogs.filter((l) => l.kind === 'check').length;
  const yNotes = yLogs.filter((l) => l.kind === 'log').length;
  const yParts = [yChecks ? `완료 ${yChecks}건` : '', yNotes ? `기록 ${yNotes}건` : ''].filter(Boolean);

  return (
    <main className="space-y-4">
      <header className="flex items-end justify-between pt-1">
        <div>
          <p className="t-sub">{Number(today.slice(5, 7))}월 {Number(today.slice(8, 10))}일 {DAY_KO[todayDow]}</p>
          <h1 className="t-large mt-0.5">오늘</h1>
        </div>
        <Link href="/settings" aria-label="설정" className="pressable rounded-full p-2 md:hidden" style={{ color: 'var(--ink-3)' }}>
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.8v2.4M12 18.8v2.4M4.5 7.7l2 1.2M17.5 15.1l2 1.2M2.8 12h2.4M18.8 12h2.4M4.5 16.3l2-1.2M17.5 8.9l2-1.2" />
          </svg>
        </Link>
      </header>

      {/* KPI 밴드 (기존 유지) */}
      <div className="kpi-band rise">
        <div className="kpi">
          <p className="kpi-label">오늘 완료율</p>
          <p className="kpi-value">{taskPct}%</p>
          <p className="kpi-delta" style={{ color: signal(taskPct) }}>{doneTasks.length}/{t.tasks.length} 할일</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">습관</p>
          <p className="kpi-value">{habitsChecked}/{t.habits.length}</p>
          <p className="kpi-delta" style={{ color: maxStreak > 0 ? 'var(--gold)' : 'var(--ink-3)' }}>
            {maxStreak > 0 ? `🔥 최장 ${maxStreak}일` : '오늘 체크 전'}
          </p>
        </div>
        <div className="kpi">
          <p className="kpi-label">지표 평균</p>
          <p className="kpi-value">{krAvg}%</p>
          <p className="kpi-delta" style={{ color: signal(krAvg) }}>{activeKRs.length}개 지표</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">주간 할 일</p>
          <p className="kpi-value">{t.weekInitiatives.length}</p>
          <p className="kpi-delta" style={{ color: 'var(--ink-3)' }}>진행 중</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">이월 대기</p>
          <p className="kpi-value" style={carried > 0 ? { color: 'var(--warn)' } : undefined}>{carried}</p>
          <p className="kpi-delta" style={{ color: 'var(--ink-3)' }}>{carried > 0 ? '오늘 정리 추천' : '깨끗함'}</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">오늘 일정</p>
          <p className="kpi-value">{t.events.length}</p>
          <p className="kpi-delta" style={{ color: 'var(--ink-3)' }}>
            {t.events[0] ? fmtTime(t.events[0].starts_at) + ' 첫 일정' : '없음'}
          </p>
        </div>
      </div>

      {/* 1행: 할일 · 오늘 타임라인 · D-day+어제 — 균등 3열 (QA: 카드 폭 통일) */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* 좌: 할일 (기존) */}
        <section className="tile rise lg:col-span-4">
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
                      <button type="submit" aria-label="되돌리기" className="check on" style={{ background: 'var(--ink-4)', borderColor: 'var(--ink-4)' }}>✓</button>
                    </form>
                    <span className="truncate text-[14px] line-through">{task.title}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {/* 이번 주 이니셔티브 → 원탭 내리기 (기존) */}
          {t.weekInitiatives.length > 0 && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <p className="sec-label mb-2">이번 주 할 일에서 가져오기</p>
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
                          <span style={{ color: 'var(--ink-4)' }}>↴</span>
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* 중: 오늘 타임라인 (위젯 8) */}
        <section className="tile rise lg:col-span-4">
          <h2 className="tile-title">오늘 타임라인</h2>
          <div className="space-y-3.5">
            {dueJobs.map((j) => (
              <div key={j.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--urgent-line)' }}>
                <span className="mono text-[10px]" style={{ color: 'var(--urgent)' }}>오늘 마감</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{j.company}</span>
                <form action={sendJobCommand}>
                  <input type="hidden" name="action" value="submitted" />
                  <input type="hidden" name="posting_id" value={j.id} />
                  <input type="hidden" name="url" value={j.url} />
                  <input type="hidden" name="company" value={j.company} />
                  <button type="submit" className="rounded-lg px-2 py-1 text-[11px]" style={{ background: 'var(--accent-bg)', color: 'var(--accent-deep)' }}>제출완료</button>
                </form>
              </div>
            ))}
            {allDay.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allDay.map((e) => <span key={e.id} className="chip text-[12px]">{e.title}</span>)}
              </div>
            )}
            {timed.length > 0 ? (
              <div className="flex flex-col">
                {timed.map((e, i) => {
                  const tm = fmtTime(e.starts_at);
                  const prev = i > 0 ? fmtTime(timed[i - 1].starts_at) : '00:00';
                  const showNow = prev <= nowHM && nowHM < tm;
                  const past = tm < nowHM;
                  return (
                    <div key={e.id}>
                      {showNow && (
                        <div className="flex items-center gap-2 py-0.5">
                          <span className="mono text-[10px]" style={{ color: 'var(--accent)' }}>{nowHM}</span>
                          <span className="h-px flex-1" style={{ background: 'var(--accent)' }} />
                        </div>
                      )}
                      <div className="flex gap-3">
                        <div className="flex w-[10px] flex-col items-center pt-[6px]">
                          <span className="tl-dot" style={{ background: past ? '#C9C4B8' : 'var(--accent)' }} />
                          {i < timed.length - 1 && <span className="tl-line" />}
                        </div>
                        <div className="flex flex-1 items-baseline gap-2 pb-3.5">
                          <span className="mono text-xs" style={{ color: past ? 'var(--ink-4)' : 'var(--ink-3)' }}>{tm}</span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px]" style={past ? { color: 'var(--ink-4)' } : undefined}>{e.title}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {nowHM >= fmtTime(timed[timed.length - 1].starts_at) && (
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="mono text-[10px]" style={{ color: 'var(--accent)' }}>{nowHM}</span>
                    <span className="h-px flex-1" style={{ background: 'var(--accent)' }} />
                  </div>
                )}
              </div>
            ) : (
              allDay.length === 0 && dueJobs.length === 0 && <p className="t-sub py-3 text-center">오늘 잡힌 일정이 없어요</p>
            )}
            <Link href="/calendar" className="t-cap block underline">달력 →</Link>
          </div>
        </section>

        {/* 우: D-day 보드 (위젯 1) + 어제의 나 (위젯 3) */}
        <div className="space-y-4 lg:col-span-4">
          <section className="tile rise">
            <h2 className="tile-title">D-day</h2>
            {board.length === 0 ? (
              <p className="t-cap leading-relaxed">달력에서 일정에 📌을 찍거나 기한 있는 목표를 만들면 올라와요.</p>
            ) : (
              <ul className="space-y-2.5">
                {board.map((b) => (
                  <li key={b.key} className="flex items-center gap-2.5">
                    <span className="mono w-11 shrink-0 text-[12.5px] font-medium" style={{ color: b.dday <= 7 ? 'var(--urgent)' : 'var(--ink)' }}>
                      {b.dday === 0 ? 'D-DAY' : `D-${b.dday}`}
                    </span>
                    <div className="min-w-0 flex-1">
                      {b.href ? (
                        <Link href={b.href} className="block truncate text-[13px] leading-snug hover:underline">{b.title}</Link>
                      ) : (
                        <span className="block truncate text-[13px] leading-snug">{b.title}</span>
                      )}
                      <span className="mono text-[10px]" style={{ color: 'var(--ink-4)' }}>
                        {b.date.slice(5).replace('-', '/')}{b.kind === 'goal' ? ' · 목표' : ''}
                      </span>
                    </div>
                    {b.eventId && (
                      <form action={togglePinEvent}>
                        <input type="hidden" name="id" value={b.eventId} />
                        <input type="hidden" name="pinned" value="false" />
                        <button type="submit" aria-label="핀 해제" className="text-xs opacity-60 hover:opacity-100">📌</button>
                      </form>
                    )}
                    {b.objectiveId && (
                      <form action={togglePinObjective}>
                        <input type="hidden" name="id" value={b.objectiveId} />
                        <input type="hidden" name="pinned" value="false" />
                        <button type="submit" aria-label="핀 해제" className="text-xs opacity-60 hover:opacity-100">📌</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tile rise">
            <h2 className="tile-title">어제의 나</h2>
            {yLogs.length === 0 ? (
              <p className="t-cap leading-relaxed">어제는 기록이 없었어요.<br />오늘 한 줄이면 충분해요.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[13.5px]">어제 <span className="font-medium">{yParts.join(' · ')}</span></p>
                <ul className="space-y-1.5">
                  {yLogs.slice(0, 5).map((l) => (
                    <li key={l.id} className="flex gap-2">
                      <span className="mono shrink-0 pt-0.5 text-[10px]" style={{ color: 'var(--ink-4)' }}>{fmtTime(l.logged_at)}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
                        {l.note ?? '(기록)'}{l.kind === 'check' ? ' ✓' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                {yLogs.length > 5 && <p className="mono t-cap">+{yLogs.length - 5}건 더 — 달력에서</p>}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* 2행: OKR 진척(기존) · 습관(기존) */}
      <div className="grid gap-4 lg:grid-cols-12">
        <section className="tile rise lg:col-span-8">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="tile-title mb-0">목표 진척</h2>
            <Link href="/okr" className="t-cap underline">전체 →</Link>
          </div>
          {activeObjectives.length === 0 && (
            <p className="t-sub py-4 text-center">
              아직 목표가 없어요. <Link href="/okr/new" className="underline" style={{ color: 'var(--accent)' }}>목표 세우러 가기 →</Link>
            </p>
          )}
          <ul className="space-y-3">
            {activeObjectives.map((obj) => {
              const area = areaOf(obj.area_id);
              const krs = tree.keyResults.filter((k) => k.objective_id === obj.id && k.target_value > 0);
              const pct = krs.length ? Math.round(krs.reduce((s, k) => s + krPct(k), 0) / krs.length) : 0;
              return (
                <li key={obj.id}>
                  <div className="mb-1 flex items-baseline gap-2">
                    {area && <span className="area-dot" style={{ background: area.color }} />}
                    <Link href={`/okr/${obj.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:underline">{obj.title}</Link>
                    <span className="mono text-[12px]" style={{ color: signal(pct) }}>{pct}%</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: signal(pct) }} />
                  </div>
                  {krs.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 pl-4">
                      {krs.slice(0, 3).map((kr) => (
                        <li key={kr.id} className="flex items-baseline gap-1.5 text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                          <span className="min-w-0 flex-1 truncate">{kr.title}</span>
                          <span className="mono" style={{ color: 'var(--ink-4)' }}>
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

        <section className="tile rise lg:col-span-4">
          <h2 className="tile-title">습관</h2>
          <ul className="space-y-2">
            {t.habits.map((h) => {
              const area = areaOf(h.area_id);
              const color = area?.color ?? 'var(--ink-4)';
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
      </div>

      <AddTaskSheet areas={t.areas} />
    </main>
  );
}
