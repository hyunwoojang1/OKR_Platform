'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createEvent, sendJobCommand, syncCalendarNow, togglePinEvent } from '@/lib/actions';
import { CleanupMode, DeleteEventButton } from './EventCleanup';
import type { CalendarEvent, JobPosting } from '@/lib/types';

export type GoalLite = {
  id: string;
  title: string;
  areaName: string;
  dueDate: string | null;
  pct: number;
  weeks: { weekOf: string; title: string; done: boolean }[];
};
export type LogLite = {
  id: string;
  kind: 'log' | 'check' | 'review';
  note: string | null;
  metrics: { v: number; u: string }[] | null;
  logged_at: string;
  objective_id: string | null;
};

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
type Layers = { events: boolean; logs: boolean; promoted: boolean; collected: boolean };
const DEFAULT_LAYERS: Layers = { events: true, logs: true, promoted: true, collected: false };

function kstDateStr(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
function kstDow(dateStr: string): number {
  return new Date(new Date(`${dateStr}T00:00:00+09:00`).getTime() + 9 * 3600_000).getUTCDay();
}
// 주 시작(월요일) 날짜
function mondayOf(dateStr: string): string {
  const d = new Date(new Date(`${dateStr}T00:00:00+09:00`).getTime() + 9 * 3600_000);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}
function addDaysKst(dateStr: string, n: number): string {
  const d = new Date(new Date(`${dateStr}T00:00:00+09:00`).getTime() + 9 * 3600_000);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
}

export default function CalendarView({
  month, today, initialSelected, events, jobs, logs, goals, syncLabel, syncConnected,
}: {
  month: string;
  today: string;
  initialSelected: string;
  events: CalendarEvent[];
  jobs: JobPosting[];
  logs: LogLite[];
  goals: GoalLite[];
  syncLabel: string;
  syncConnected: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(initialSelected);
  const [focusGoal, setFocusGoal] = useState<string | null>(null);
  // 디폴트 주간 — "이번 주에 뭘 해야 하나"가 점 대신 글자로 보이게 (QA 4번)
  const [view, setView] = useState<'week' | 'month'>(() => {
    try {
      const v = localStorage.getItem('cal-view');
      if (v === 'month' || v === 'week') return v;
    } catch {}
    return 'week';
  });
  function switchView(v: 'week' | 'month') {
    setView(v);
    try { localStorage.setItem('cal-view', v); } catch {}
  }
  const [layers, setLayers] = useState<Layers>(() => {
    try {
      const saved = localStorage.getItem('cal-layers');
      if (saved) return { ...DEFAULT_LAYERS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_LAYERS;
  });
  const [layersOpen, setLayersOpen] = useState(false);

  function toggleLayer(key: keyof Layers) {
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('cal-layers', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const [y, mo] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
  const daysInMonth = new Date(y, mo, 0).getDate();
  const firstDow = kstDow(`${month}-01`);
  const prevM = `${mo === 1 ? y - 1 : y}-${String(mo === 1 ? 12 : mo - 1).padStart(2, '0')}`;
  const nextM = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}`;

  const { evByDate, jobsByDate, logCountByDate, logsByDate } = useMemo(() => {
    const evByDate = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const d = kstDateStr(e.starts_at);
      evByDate.set(d, [...(evByDate.get(d) ?? []), e]);
    }
    const jobsByDate = new Map<string, JobPosting[]>();
    for (const j of jobs) {
      if (!j.deadline) continue;
      jobsByDate.set(j.deadline, [...(jobsByDate.get(j.deadline) ?? []), j]);
    }
    const logCountByDate = new Map<string, number>();
    const logsByDate = new Map<string, LogLite[]>();
    for (const l of logs) {
      const d = kstDateStr(l.logged_at);
      logCountByDate.set(d, (logCountByDate.get(d) ?? 0) + 1);
      logsByDate.set(d, [...(logsByDate.get(d) ?? []), l]);
    }
    return { evByDate, jobsByDate, logCountByDate, logsByDate };
  }, [events, jobs, logs]);

  // 포커스한 목표: 이니셔티브가 잡힌 주(월~일)와 마감일을 하이라이트
  const focus = goals.find((g) => g.id === focusGoal) ?? null;
  const focusWeeks = useMemo(() => new Set(focus?.weeks.map((w) => w.weekOf) ?? []), [focus]);

  // 주간 뷰 재료: 선택일이 속한 주(월~일) + 날짜별 목표 마감
  const goalDueByDate = useMemo(() => {
    const m = new Map<string, GoalLite[]>();
    for (const g of goals) if (g.dueDate) m.set(g.dueDate, [...(m.get(g.dueDate) ?? []), g]);
    return m;
  }, [goals]);
  const weekMonday = mondayOf(selected);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysKst(weekMonday, i));
  function goWeek(delta: number) {
    const m = addDaysKst(weekMonday, delta * 7);
    if (m.slice(0, 7) === month) setSelected(m);
    else router.push(`/calendar?m=${m.slice(0, 7)}&d=${m}`);
  }

  const visibleJobs = (d: string) =>
    (jobsByDate.get(d) ?? []).filter((j) =>
      j.stage === '지원예정' ? layers.promoted : layers.collected,
    );

  const logTint = (n: number): string | null => {
    if (!layers.logs || n === 0) return null;
    if (n === 1) return 'oklch(0.9 0.045 150)';
    if (n === 2) return 'oklch(0.8 0.08 150)';
    return 'oklch(0.68 0.11 150)';
  };

  const dayLogs = logsByDate.get(selected) ?? [];
  const dayEvents = evByDate.get(selected) ?? [];
  const dayJobs = visibleJobs(selected);
  const goalTitleById = new Map(goals.map((g) => [g.id, g.title]));

  return (
    <main className="w-full">
      {/*
        모바일 한 칸짜리 그리드도 minmax(0,1fr)로 못박는다. 기본 auto 트랙은 최소 폭이
        min-content라, 긴 일정 제목 하나가 칸을 464px로 벌려 화면 밖으로 밀어냈다
        (iPhone 14 Pro Max 34px, SE 90px 넘침). 안쪽 요소는 전부 정상이었고 트랙이 범인.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── 왼쪽: 달력 + 선택일 ── */}
        <div className="space-y-5">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="t-large">달력</h1>
              <div className="flex rounded-full border p-0.5 text-[12px]" style={{ borderColor: 'var(--line-strong)' }}>
                {(['week', 'month'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => switchView(v)}
                    className="rounded-full px-3 py-1"
                    style={view === v ? { background: 'var(--ink)', color: '#fff' } : { color: 'var(--ink-3)' }}
                  >
                    {v === 'week' ? '주' : '월'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--ink-3)' }}>
              <div className="relative">
                <button onClick={() => setLayersOpen(!layersOpen)} className="underline underline-offset-2">표시 ▾</button>
                {layersOpen && (
                  <div
                    className="absolute right-0 top-6 z-20 flex w-44 flex-col gap-1 rounded-xl border p-2.5 text-[13px]"
                    style={{ background: 'var(--surface)', borderColor: 'var(--line)', boxShadow: 'var(--shadow-card)', color: 'var(--ink)' }}
                  >
                    {(
                      [
                        ['events', '일정'],
                        ['logs', '기록'],
                        ['promoted', '지원예정 마감'],
                        ['collected', '후보 공고 마감'],
                      ] as [keyof Layers, string][]
                    ).map(([key, label]) => (
                      <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--line-soft)]">
                        <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} className="h-4 w-4" />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <Link href="/jobs" className="underline underline-offset-2">공고 →</Link>
              <span className="hidden sm:inline">{syncLabel}</span>
              {syncConnected && (
                <form action={syncCalendarNow}>
                  <button type="submit" className="underline underline-offset-2">동기화</button>
                </form>
              )}
              <CleanupMode events={events} />
            </div>
          </header>

          {/* ── 주간 뷰 (디폴트): 요일별 할 일이 점이 아니라 글자로 보인다 ── */}
          {view === 'week' && (
          <section className="tile !p-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <button onClick={() => goWeek(-1)} aria-label="이전 주" className="px-2 py-1 text-sm" style={{ color: 'var(--ink-3)' }}>←</button>
              <span className="text-[15px] font-medium">
                {Number(weekMonday.slice(5, 7))}/{Number(weekMonday.slice(8, 10))} – {Number(weekDays[6].slice(5, 7))}/{Number(weekDays[6].slice(8, 10))}
              </span>
              <button onClick={() => goWeek(1)} aria-label="다음 주" className="px-2 py-1 text-sm" style={{ color: 'var(--ink-3)' }}>→</button>
            </div>
            <div className="flex flex-col">
              {weekDays.map((day, di) => {
                const isToday = day === today;
                const isSel = day === selected;
                const dow = kstDow(day);
                const evs = layers.events ? (evByDate.get(day) ?? []) : [];
                const dJobs = visibleJobs(day);
                const dues = goalDueByDate.get(day) ?? [];
                const nLogs = layers.logs ? (logCountByDate.get(day) ?? 0) : 0;
                const inFocusWeek = focus !== null && focusWeeks.has(mondayOf(day));
                const empty = evs.length === 0 && dJobs.length === 0 && dues.length === 0 && nLogs === 0;
                return (
                  <div key={day}>
                    {di > 0 && <div className="divider" />}
                    <button
                      onClick={() => setSelected(day)}
                      className={`flex w-full items-start gap-3 rounded-xl px-1 py-2.5 text-left ${inFocusWeek ? 'goal-glow' : ''}`}
                      style={inFocusWeek ? { background: 'var(--accent-bg-soft)' } : undefined}
                    >
                      <div className="w-10 shrink-0 text-center">
                        <div className="mono text-[10px]" style={{ color: dow === 0 ? 'var(--urgent)' : 'var(--ink-3)' }}>{DAY_NAMES[dow]}</div>
                        <div
                          className="mono mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[13px]"
                          style={
                            isSel
                              ? { background: 'var(--ink)', color: '#fff' }
                              : isToday
                                ? { background: 'var(--accent-bg)', color: 'var(--accent-deep)', fontWeight: 500 }
                                : undefined
                          }
                        >
                          {Number(day.slice(8, 10))}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1 pt-1">
                        {evs.map((e) => (
                          <div key={e.id} className="flex items-baseline gap-2 text-[13px]">
                            <span className="mono shrink-0 text-[11px]" style={{ color: 'var(--ink-3)' }}>{e.all_day ? '종일' : fmtTime(e.starts_at)}</span>
                            <span className="truncate">{e.pinned ? '📌 ' : ''}{e.title}</span>
                          </div>
                        ))}
                        {dJobs.map((j) => (
                          <div key={j.id} className="flex items-baseline gap-2 text-[13px]">
                            <span className="mono shrink-0 text-[11px]" style={{ color: 'var(--urgent)' }}>마감</span>
                            <span className="truncate font-medium">{j.company}</span>
                          </div>
                        ))}
                        {dues.map((g) => (
                          <div key={g.id} className="flex items-baseline gap-2 text-[13px]">
                            <span className="mono shrink-0 text-[11px]" style={{ color: 'var(--urgent)' }}>목표</span>
                            <span className="truncate">{g.title}</span>
                          </div>
                        ))}
                        {nLogs > 0 && <div className="mono text-[11px]" style={{ color: 'oklch(0.55 0.11 150)' }}>기록 {nLogs}</div>}
                        {empty && <div className="text-[12px]" style={{ color: 'var(--ink-4)' }}>—</div>}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
          )}

          {view === 'month' && (
          <section className="tile !p-4">
            <div className="mb-3 flex items-center justify-between px-1">
              <Link href={`/calendar?m=${prevM}`} aria-label="이전 달" className="px-2 py-1 text-sm" style={{ color: 'var(--ink-3)' }}>←</Link>
              <span className="text-[15px] font-medium">{y}년 {mo}월</span>
              <Link href={`/calendar?m=${nextM}`} aria-label="다음 달" className="px-2 py-1 text-sm" style={{ color: 'var(--ink-3)' }}>→</Link>
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 text-center">
              {DAY_NAMES.map((d, i) => (
                <div key={d} className="mono pb-1 text-[11px]" style={{ color: i === 0 ? 'var(--urgent)' : 'var(--ink-3)' }}>{d}</div>
              ))}
              {Array.from({ length: firstDow }, (_, i) => <div key={`sp${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = `${month}-${String(i + 1).padStart(2, '0')}`;
                const isToday = day === today;
                const isSel = day === selected;
                const dow = (firstDow + i) % 7;
                const tint = logTint(logCountByDate.get(day) ?? 0);
                const hasEv = layers.events && (evByDate.get(day) ?? []).length > 0;
                const dJobs = visibleJobs(day);
                const inFocusWeek = focus !== null && focusWeeks.has(mondayOf(day));
                const isFocusDue = focus?.dueDate === day;
                return (
                  <button
                    key={day}
                    onClick={() => setSelected(day)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl py-1 ${inFocusWeek ? 'goal-glow' : ''}`}
                    style={inFocusWeek ? { background: 'var(--accent-bg-soft)' } : undefined}
                  >
                    <span
                      className="mono flex h-8 w-8 items-center justify-center rounded-full text-[13px]"
                      style={
                        isSel
                          ? { background: 'var(--ink)', color: '#fff' }
                          : isFocusDue
                            ? { border: '1.5px solid var(--urgent)', color: 'var(--urgent)', fontWeight: 500 }
                            : isToday
                              ? { background: 'var(--accent-bg)', color: 'var(--accent-deep)', fontWeight: 500 }
                              : tint
                                ? { background: tint, color: '#fff' }
                                : { color: dow === 0 ? 'var(--urgent)' : 'var(--ink)' }
                      }
                    >
                      {i + 1}
                    </span>
                    <span className="flex h-1.5 items-center gap-0.5">
                      {hasEv && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />}
                      {dJobs.length > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--urgent)' }} />}
                    </span>
                  </button>
                );
              })}
            </div>
            {focus && (
              <div className="mt-2 flex items-center justify-between rounded-xl px-3 py-2 text-[13px]" style={{ background: 'var(--accent-bg-soft)', color: 'var(--accent-deep)' }}>
                <span>「{focus.title}」{focus.dueDate ? ` · 마감 ${focus.dueDate.slice(5).replace('-', '/')}` : ''}</span>
                <button onClick={() => setFocusGoal(null)} className="underline underline-offset-2">해제</button>
              </div>
            )}
          </section>
          )}

          {/* 선택한 날 */}
          <section className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <div className="sec-label">
                {mo}월 {Number(selected.slice(8, 10))}일 {DAY_NAMES[kstDow(selected)]}요일{selected === today ? ' · 오늘' : ''}
              </div>
              <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>
                일정 {dayEvents.length} · 기록 {dayLogs.length}{dayJobs.length > 0 ? ` · 마감 ${dayJobs.length}` : ''}
              </span>
            </div>

            {layers.events && dayEvents.length > 0 && (
              <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                {dayEvents.map((e, i) => (
                  <div key={e.id}>
                    {i > 0 && <div className="divider mx-4" />}
                    <div className="flex items-center gap-3 px-4 py-[13px]">
                      <span className="mono w-11 text-xs" style={{ color: 'var(--ink-3)' }}>{e.all_day ? '종일' : fmtTime(e.starts_at)}</span>
                      <span className="flex-1 text-[15px] leading-normal">{e.title}</span>
                      {/* 📌 = 홈 D-day 보드 등재 */}
                      <form action={togglePinEvent}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="pinned" value={e.pinned ? 'false' : 'true'} />
                        <button
                          type="submit"
                          aria-label={e.pinned ? 'D-day 핀 해제' : 'D-day 보드에 핀'}
                          title={e.pinned ? 'D-day 핀 해제' : 'D-day 보드에 핀'}
                          className={`text-xs ${e.pinned ? '' : 'opacity-30 hover:opacity-100'}`}
                        >
                          📌
                        </button>
                      </form>
                      {e.source === 'google' && <span className="mono text-[10px]" style={{ color: 'var(--ink-4)' }}>G</span>}
                      <DeleteEventButton event={e} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {dayJobs.length > 0 && (
              <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--urgent-line)', background: 'var(--surface)' }}>
                {dayJobs.map((j, i) => (
                  <div key={j.id}>
                    {i > 0 && <div className="divider mx-4" />}
                    <div className="flex items-center gap-3 px-4 py-[13px]">
                      <span className="mono w-11 text-[10px]" style={{ color: 'var(--urgent)' }}>마감</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-medium">{j.company}</span>
                          {j.stage === '지원예정' && <span className="badge badge-accent shrink-0">지원예정</span>}
                        </div>
                        <a href={j.url} target="_blank" rel="noreferrer" className="block truncate text-[12px]" style={{ color: 'var(--ink-3)' }}>{j.title}</a>
                      </div>
                      <form action={sendJobCommand}>
                        <input type="hidden" name="action" value={j.stage === '지원예정' ? 'submitted' : 'promote'} />
                        <input type="hidden" name="posting_id" value={j.id} />
                        <input type="hidden" name="url" value={j.url} />
                        <input type="hidden" name="company" value={j.company} />
                        <button type="submit" className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'var(--accent-bg)', color: 'var(--accent-deep)' }}>
                          {j.stage === '지원예정' ? '제출완료' : '승격'}
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {layers.logs && dayLogs.length > 0 && (
              <div className="tile space-y-3 !p-4">
                <div className="text-[13px]" style={{ color: 'var(--ink-3)' }}>이날의 기록</div>
                <div className="flex flex-col gap-2.5">
                  {dayLogs.map((l) => (
                    <div key={l.id} className="flex gap-3">
                      <span className="mono w-11 shrink-0 pt-0.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>{fmtTime(l.logged_at)}</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-[14px]">{l.note ?? '(내용 없음)'}</span>
                        {l.kind !== 'log' && (
                          <span className="mono ml-1.5 text-[10px]" style={{ color: 'var(--ink-4)' }}>{l.kind === 'check' ? '완료' : '회고'}</span>
                        )}
                        {l.objective_id && goalTitleById.get(l.objective_id) && (
                          <div className="truncate text-[11px]" style={{ color: 'var(--ink-4)' }}>{goalTitleById.get(l.objective_id)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dayEvents.length === 0 && dayJobs.length === 0 && dayLogs.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>이날은 아무것도 없어요.</p>
            )}

            {/* 일정 추가 */}
            <details className="pt-1">
              <summary className="cursor-pointer list-none text-[13px] underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>＋ 일정 추가</summary>
              <form action={createEvent} className="tile mt-2.5 space-y-2 text-sm">
                <input name="title" placeholder="일정 제목" className="w-full" required />
                <div className="flex flex-wrap items-center gap-2">
                  <input name="starts_at" type="datetime-local" defaultValue={`${selected}T09:00`} required aria-label="시작" />
                  <input name="ends_at" type="datetime-local" aria-label="종료" />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="all_day" /> 종일</label>
                  <button type="submit" className="ml-auto rounded-xl px-4 py-2 text-white" style={{ background: 'var(--accent)' }}>추가</button>
                </div>
              </form>
            </details>
          </section>
        </div>

        {/* ── 오른쪽: 목표 패널 ── */}
        <aside className="space-y-2.5 md:pt-[52px]">
          <div className="sec-label">목표</div>
          {goals.length === 0 && (
            <Link href="/okr/new" className="block rounded-2xl border border-dashed p-4 text-sm" style={{ borderColor: 'var(--line-strong)', color: 'var(--ink-3)' }}>
              아직 목표가 없어요 — 첫 목표 만들기 →
            </Link>
          )}
          {goals.map((g) => {
            const on = focusGoal === g.id;
            const thisMonday = mondayOf(today);
            const weekIdx = [...new Set(g.weeks.map((w) => w.weekOf))].sort().indexOf(thisMonday);
            const thisWeek = g.weeks.filter((w) => w.weekOf === thisMonday);
            return (
              <button
                key={g.id}
                onClick={() => setFocusGoal(on ? null : g.id)}
                className="block w-full text-left"
              >
                <div
                  className="tile space-y-2.5 !p-4 transition-colors"
                  style={on ? { borderColor: 'var(--accent)', background: 'var(--accent-bg-soft)' } : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="mono text-[10px] tracking-wide" style={{ color: 'var(--accent)' }}>{g.areaName}</div>
                      <div className="text-[15px] font-medium leading-snug">{g.title}</div>
                    </div>
                    <span className="mono shrink-0 text-xs" style={{ color: 'var(--ink-3)' }}>{g.pct}%</span>
                  </div>
                  {thisWeek.length > 0 && (
                    <div className="space-y-1">
                      <div className="mono text-[10px]" style={{ color: 'var(--ink-4)' }}>이번 주{weekIdx >= 0 ? ` · ${weekIdx + 1}주차` : ''}</div>
                      {thisWeek.map((w, i) => (
                        <div key={i} className={`text-[13px] leading-snug ${w.done ? 'line-through' : ''}`} style={{ color: w.done ? 'var(--ink-4)' : 'var(--ink-2)' }}>
                          {w.title}
                        </div>
                      ))}
                    </div>
                  )}
                  {on && g.dueDate && (
                    <div className="mono text-[11px]" style={{ color: 'var(--urgent)' }}>마감 {g.dueDate.slice(5).replace('-', '/')}</div>
                  )}
                </div>
              </button>
            );
          })}
          <Link href="/okr" className="block pt-1 text-[13px] underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>
            목표 탭에서 자세히 →
          </Link>
        </aside>
      </div>
    </main>
  );
}
