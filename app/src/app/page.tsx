import Link from 'next/link';
import { db } from '@/lib/db';
import { toggleTask, togglePinEvent, sendJobCommand } from '@/lib/actions';
import type { Area, CalendarEvent, DailyTask, JobPosting, Objective, SessionLog } from '@/lib/types';
import { kstToday } from '@/lib/types';
import AddTaskSheet from './AddTaskSheet';

export const dynamic = 'force-dynamic';

const DAY_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
}
function kstNowHM(): string {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
}

// v4 홈 1차 (그릴 확정 위젯 1·3·8): 오늘 타임라인(좌) + D-day 보드·어제의 나(우).
// 조종석 상단(아침 문장 등)은 미확정 — 날짜 헤더만.
export default async function TodayPage() {
  const today = kstToday();
  const todayDow = new Date(new Date(`${today}T00:00:00+09:00`).getTime() + 9 * 3600_000).getUTCDay();
  const dayStart = new Date(`${today}T00:00:00+09:00`).toISOString();
  const dayEnd = new Date(`${today}T23:59:59+09:00`).toISOString();
  const yStart = new Date(new Date(dayStart).getTime() - 86400_000).toISOString();

  const [evQ, taskQ, jobsQ, objQ, pinQ, ylogQ, areasQ] = await Promise.all([
    db().from('calendar_events').select('*').gte('starts_at', dayStart).lte('starts_at', dayEnd).order('starts_at'),
    db().from('daily_tasks').select('*').eq('date', today).order('created_at'),
    db().from('job_postings').select('*').eq('deadline', today).eq('stage', '지원예정'),
    db().from('objectives').select('*').eq('status', 'active').not('due_date', 'is', null),
    db().from('calendar_events').select('*').eq('pinned', true).gte('starts_at', dayStart).order('starts_at').limit(10),
    db().from('session_logs').select('*').gte('logged_at', yStart).lt('logged_at', dayStart).order('logged_at'),
    db().from('areas').select('*'),
  ]);
  for (const q of [evQ, taskQ, jobsQ, objQ, pinQ, ylogQ, areasQ]) {
    if (q.error) throw new Error(`홈 조회 실패: ${q.error.message}`);
  }
  const events = evQ.data as CalendarEvent[];
  const tasks = taskQ.data as DailyTask[];
  const dueJobs = jobsQ.data as JobPosting[];
  const goals = objQ.data as Objective[];
  const pinnedEvents = pinQ.data as CalendarEvent[];
  const yLogs = ylogQ.data as SessionLog[];
  const areas = areasQ.data as Area[];

  // ── D-day 보드: 활성 목표 마감(자동) + 핀 일정 ──
  const todayT = new Date(`${today}T00:00:00+09:00`).getTime();
  const ddayOf = (dateStr: string) => Math.round((new Date(`${dateStr}T00:00:00+09:00`).getTime() - todayT) / 86400_000);
  const board = [
    ...goals.map((g) => ({
      key: `g-${g.id}`, kind: 'goal' as const, title: g.title, date: g.due_date!, dday: ddayOf(g.due_date!),
      href: `/okr/${g.id}`, eventId: null as string | null,
    })),
    ...pinnedEvents.map((e) => {
      const dateStr = new Date(new Date(e.starts_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
      return { key: `e-${e.id}`, kind: 'pin' as const, title: e.title, date: dateStr, dday: ddayOf(dateStr), href: null, eventId: e.id };
    }),
  ]
    .filter((b) => b.dday >= 0)
    .sort((a, b) => a.dday - b.dday)
    .slice(0, 6);

  // ── 오늘 타임라인: 마감 → 종일 → 시간순(지금 표시선) → 할일 ──
  const allDay = events.filter((e) => e.all_day);
  const timed = events.filter((e) => !e.all_day);
  const nowHM = kstNowHM();
  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);
  const areaOf = (id: string | null) => areas.find((a) => a.id === id);

  // ── 어제의 나 ──
  const yParts: string[] = [];
  if (yLogs.length > 0) {
    const checks = yLogs.filter((l) => l.kind === 'check').length;
    const notes = yLogs.filter((l) => l.kind === 'log').length;
    if (checks) yParts.push(`완료 ${checks}건`);
    if (notes) yParts.push(`기록 ${notes}건`);
  }

  return (
    <main className="mx-auto max-w-6xl">
      <header className="flex items-end justify-between pb-5 pt-1">
        <div>
          <p className="mono text-xs" style={{ color: 'var(--ink-3)' }}>
            {Number(today.slice(5, 7))}월 {Number(today.slice(8, 10))}일 {DAY_KO[todayDow]}
          </p>
          <h1 className="t-large mt-0.5">오늘</h1>
        </div>
        <Link href="/settings" aria-label="설정" className="pressable rounded-full p-2 md:hidden" style={{ color: 'var(--ink-3)' }}>
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.8v2.4M12 18.8v2.4M4.5 7.7l2 1.2M17.5 15.1l2 1.2M2.8 12h2.4M18.8 12h2.4M4.5 16.3l2-1.2M17.5 8.9l2-1.2" />
          </svg>
        </Link>
      </header>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
        {/* ══ 좌: 오늘 타임라인 (위젯 8) ══ */}
        <section className="space-y-2.5">
          <div className="sec-label">오늘 타임라인</div>
          <div className="tile space-y-4 !p-[18px]">
            {/* 오늘 마감 (지원예정) */}
            {dueJobs.map((j) => (
              <div key={j.id} className="flex items-center gap-3 rounded-xl border px-3.5 py-3" style={{ borderColor: 'var(--urgent-line)' }}>
                <span className="mono text-[11px]" style={{ color: 'var(--urgent)' }}>오늘 마감</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{j.company}</span>
                <form action={sendJobCommand}>
                  <input type="hidden" name="action" value="submitted" />
                  <input type="hidden" name="posting_id" value={j.id} />
                  <input type="hidden" name="url" value={j.url} />
                  <input type="hidden" name="company" value={j.company} />
                  <button type="submit" className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'var(--accent-bg)', color: 'var(--accent-deep)' }}>제출완료</button>
                </form>
              </div>
            ))}

            {/* 종일 */}
            {allDay.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allDay.map((e) => (
                  <span key={e.id} className="chip text-[12.5px]">{e.title}</span>
                ))}
              </div>
            )}

            {/* 시간축 */}
            {timed.length > 0 ? (
              <div className="flex flex-col">
                {timed.map((e, i) => {
                  const t = fmtTime(e.starts_at);
                  const prev = i > 0 ? fmtTime(timed[i - 1].starts_at) : '00:00';
                  const showNow = prev <= nowHM && nowHM < t;
                  const past = t < nowHM;
                  return (
                    <div key={e.id}>
                      {showNow && (
                        <div className="flex items-center gap-2 py-1">
                          <span className="mono text-[10px]" style={{ color: 'var(--accent)' }}>{nowHM}</span>
                          <span className="h-px flex-1" style={{ background: 'var(--accent)' }} />
                        </div>
                      )}
                      <div className="flex gap-3.5">
                        <div className="flex w-[10px] flex-col items-center pt-[6px]">
                          <span className="tl-dot" style={{ background: past ? '#C9C4B8' : 'var(--accent)' }} />
                          {i < timed.length - 1 && <span className="tl-line" />}
                        </div>
                        <div className="flex flex-1 items-baseline gap-2.5 pb-4">
                          <span className="mono text-xs" style={{ color: past ? 'var(--ink-4)' : 'var(--ink-3)' }}>{t}</span>
                          <span className="text-[15px]" style={past ? { color: 'var(--ink-4)' } : undefined}>{e.title}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {nowHM >= fmtTime(timed[timed.length - 1].starts_at) && (
                  <div className="flex items-center gap-2 py-1">
                    <span className="mono text-[10px]" style={{ color: 'var(--accent)' }}>{nowHM}</span>
                    <span className="h-px flex-1" style={{ background: 'var(--accent)' }} />
                  </div>
                )}
              </div>
            ) : (
              allDay.length === 0 && dueJobs.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--ink-3)' }}>오늘 잡힌 일정이 없어요.</p>
              )
            )}

            {/* 오늘 할 일 (시간 미정) */}
            <div className="space-y-1.5 border-t pt-3.5" style={{ borderColor: 'var(--line-soft)' }}>
              <div className="flex items-baseline justify-between">
                <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>오늘 할 일</span>
                <span className="mono text-xs" style={{ color: 'var(--ink-4)' }}>{doneTasks.length}/{tasks.length}</span>
              </div>
              {tasks.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-4)' }}>＋ 버튼으로 추가해보세요.</p>}
              {[...openTasks, ...doneTasks].map((t) => (
                <form key={t.id} action={toggleTask} className="row !px-1">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="done" value={t.done ? 'false' : 'true'} />
                  <button type="submit" aria-label={t.done ? '체크 해제' : '완료'} className={`check ${t.done ? 'on' : ''}`}>✓</button>
                  <span className={`flex-1 text-[15px] ${t.done ? 'line-through' : ''}`} style={t.done ? { color: 'var(--ink-4)' } : undefined}>
                    {t.title}
                  </span>
                  {areaOf(t.area_id) && (
                    <span className="mono text-[10px]" style={{ color: 'var(--ink-4)' }}>{areaOf(t.area_id)!.name}</span>
                  )}
                  {t.carried_over > 0 && <span className="mono text-[10px]" style={{ color: 'var(--urgent)' }}>이월{t.carried_over}</span>}
                </form>
              ))}
            </div>
          </div>
        </section>

        {/* ══ 우: D-day 보드 (위젯 1) + 어제의 나 (위젯 3) ══ */}
        <aside className="space-y-5">
          <section className="space-y-2.5">
            <div className="sec-label">D-day</div>
            {board.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                달력에서 일정에 📌을 찍거나, 기한 있는 목표를 만들면 여기 올라와요.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                {board.map((b, i) => (
                  <div key={b.key}>
                    {i > 0 && <div className="divider mx-4" />}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="mono w-12 text-[13px] font-medium" style={{ color: b.dday <= 7 ? 'var(--urgent)' : 'var(--ink)' }}>
                        {b.dday === 0 ? 'D-DAY' : `D-${b.dday}`}
                      </span>
                      <div className="min-w-0 flex-1">
                        {b.href ? (
                          <Link href={b.href} className="block truncate text-[14px] leading-snug hover:underline">{b.title}</Link>
                        ) : (
                          <span className="block truncate text-[14px] leading-snug">{b.title}</span>
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2.5">
            <div className="sec-label">어제의 나</div>
            <div className="tile space-y-3 !p-4">
              {yLogs.length === 0 ? (
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                  어제는 기록이 없었어요.<br />오늘 한 줄이면 충분해요.
                </p>
              ) : (
                <>
                  <div className="text-[15px]">어제 <span className="font-medium">{yParts.join(' · ')}</span></div>
                  <div className="flex flex-col gap-2">
                    {yLogs.slice(0, 5).map((l) => (
                      <div key={l.id} className="flex gap-2.5">
                        <span className="mono shrink-0 pt-0.5 text-[10px]" style={{ color: 'var(--ink-4)' }}>{fmtTime(l.logged_at)}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: 'var(--ink-2)' }}>
                          {l.note ?? '(기록)'}{l.kind === 'check' ? ' ✓' : ''}
                        </span>
                      </div>
                    ))}
                    {yLogs.length > 5 && (
                      <span className="mono text-[10px]" style={{ color: 'var(--ink-4)' }}>+{yLogs.length - 5}건 더 — 달력에서 보기</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        </aside>
      </div>

      <AddTaskSheet areas={areas} />
    </main>
  );
}
