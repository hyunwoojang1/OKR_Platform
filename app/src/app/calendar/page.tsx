import Link from 'next/link';
import { db } from '@/lib/db';
import { createEvent, deleteEvent, syncCalendarNow } from '@/lib/actions';
import { syncCalendar } from '@/lib/google-calendar';
import type { CalendarEvent, JobPosting } from '@/lib/types';
import { kstToday } from '@/lib/types';
import JobActions from '../jobs/JobActions';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function kstDateStr(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

// v4 달력: 월 그리드(날짜판) + 선택한 날의 일정. 진입 시 Google 양방향 동기화(1분 스로틀).
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const sync = await syncCalendar();
  const today = kstToday();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? '') && (sp.d!.slice(0, 7) === month) ? sp.d! : (month === today.slice(0, 7) ? today : `${month}-01`);

  const [y, mo] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
  const daysInMonth = new Date(y, mo, 0).getDate();
  // KST 요일: +09:00 시각을 9시간 밀어 UTC 게터로 읽는다 (그냥 getUTCDay면 하루 밀림)
  const kstDow = (dateStr: string) => new Date(new Date(`${dateStr}T00:00:00+09:00`).getTime() + 9 * 3600_000).getUTCDay();
  const firstDow = kstDow(`${month}-01`);
  const prevM = `${mo === 1 ? y - 1 : y}-${String(mo === 1 ? 12 : mo - 1).padStart(2, '0')}`;
  const nextM = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}`;

  const monthStart = new Date(`${month}-01T00:00:00+09:00`).toISOString();
  const monthEnd = new Date(new Date(`${month}-${String(daysInMonth).padStart(2, '0')}T00:00:00+09:00`).getTime() + 86400_000).toISOString();
  const monthEndDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;
  const [evsQ, jobsQ] = await Promise.all([
    db().from('calendar_events').select('*').gte('starts_at', monthStart).lt('starts_at', monthEnd).order('starts_at'),
    db().from('job_postings').select('*').in('stage', ['수집함', '지원예정'])
      .gte('deadline', `${month}-01`).lte('deadline', monthEndDate).order('deadline'),
  ]);
  if (evsQ.error) throw new Error(`일정 조회 실패: ${evsQ.error.message}`);
  if (jobsQ.error) throw new Error(`공고 조회 실패: ${jobsQ.error.message}`);
  const events = evsQ.data as CalendarEvent[];
  const monthJobs = jobsQ.data as JobPosting[];

  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const d = kstDateStr(e.starts_at);
    byDate.set(d, [...(byDate.get(d) ?? []), e]);
  }
  const jobsByDate = new Map<string, JobPosting[]>();
  for (const j of monthJobs) {
    if (!j.deadline) continue;
    jobsByDate.set(j.deadline, [...(jobsByDate.get(j.deadline) ?? []), j]);
  }
  const dayEvents = byDate.get(selected) ?? [];
  const dayJobs = jobsByDate.get(selected) ?? [];
  const selDay = Number(selected.slice(8, 10));
  const selDow = kstDow(selected);

  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="t-large">달력</h1>
        <span className="flex items-center gap-3 text-xs" style={{ color: 'var(--ink-3)' }}>
          <Link href="/jobs" className="underline underline-offset-2">공고 →</Link>
          {sync.connected && !sync.error ? 'Google 연동됨' : sync.error ?? 'Google 미연결'}
          {sync.connected && (
            <form action={syncCalendarNow}>
              <button type="submit" aria-label="지금 동기화" className="underline underline-offset-2">동기화</button>
            </form>
          )}
        </span>
      </header>

      {/* 월 그리드 */}
      <section className="tile !p-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <Link href={`/calendar?m=${prevM}`} aria-label="이전 달" className="px-2 py-1 text-sm" style={{ color: 'var(--ink-3)' }}>←</Link>
          <span className="text-[15px] font-medium">{y}년 {mo}월</span>
          <Link href={`/calendar?m=${nextM}`} aria-label="다음 달" className="px-2 py-1 text-sm" style={{ color: 'var(--ink-3)' }}>→</Link>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {DAY_NAMES.map((d, i) => (
            <div key={d} className="mono pb-1 text-[11px]" style={{ color: i === 0 ? 'var(--urgent)' : 'var(--ink-3)' }}>{d}</div>
          ))}
          {Array.from({ length: firstDow }, (_, i) => <div key={`sp${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = `${month}-${String(i + 1).padStart(2, '0')}`;
            const isToday = day === today;
            const isSel = day === selected;
            const has = (byDate.get(day) ?? []).length > 0;
            const hasJobs = (jobsByDate.get(day) ?? []).length > 0;
            const dow = (firstDow + i) % 7;
            return (
              <Link key={day} href={`/calendar?m=${month}&d=${day}`} className="flex flex-col items-center gap-0.5 py-1">
                <span
                  className="mono flex h-8 w-8 items-center justify-center rounded-full text-[13px]"
                  style={
                    isSel
                      ? { background: 'var(--ink)', color: '#fff' }
                      : isToday
                        ? { background: 'var(--accent-bg)', color: 'var(--accent-deep)', fontWeight: 500 }
                        : { color: dow === 0 ? 'var(--urgent)' : 'var(--ink)' }
                  }
                >
                  {i + 1}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {has && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />}
                  {hasJobs && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--urgent)' }} />}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 선택한 날 */}
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <div className="sec-label">
            {mo}월 {selDay}일 {DAY_NAMES[selDow]}요일{selected === today ? ' · 오늘' : ''}
          </div>
          <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>{dayEvents.length}건</span>
        </div>
        {dayEvents.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
            {dayEvents.map((e, i) => (
              <div key={e.id}>
                {i > 0 && <div className="divider mx-4" />}
                <div className="flex items-center gap-3 px-4 py-[13px]">
                  <span className="mono w-11 text-xs" style={{ color: 'var(--ink-3)' }}>
                    {e.all_day ? '종일' : new Date(e.starts_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })}
                  </span>
                  <span className="flex-1 text-[15px] leading-normal">{e.title}</span>
                  {e.source === 'google' && <span className="mono text-[10px]" style={{ color: 'var(--ink-4)' }}>G</span>}
                  {e.source === 'app' && (
                    <form action={deleteEvent}>
                      <input type="hidden" name="id" value={e.id} />
                      <button type="submit" aria-label="삭제" className="text-xs" style={{ color: 'var(--ink-4)' }}>✕</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--ink-3)' }}>이날은 일정이 없어요.</p>
        )}
      </section>

      {/* 이날 마감인 채용공고 (job_applications 크롤 연동) */}
      {dayJobs.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <div className="sec-label" style={{ color: 'var(--urgent)' }}>이날 마감 공고</div>
            <Link href="/jobs" className="mono text-xs underline underline-offset-2" style={{ color: 'var(--ink-3)' }}>{dayJobs.length}건 · 전체 →</Link>
          </div>
          <div className="space-y-2.5">
            {dayJobs.map((j) => (
              <div key={j.id} className="tile space-y-3 !p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-medium">{j.company}</span>
                      {j.stage === '지원예정' && <span className="badge badge-accent shrink-0">지원예정</span>}
                    </div>
                    <a href={j.url} target="_blank" rel="noreferrer" className="block truncate text-[13px] underline-offset-2 hover:underline" style={{ color: 'var(--ink-2)' }}>
                      {j.title}
                    </a>
                  </div>
                </div>
                <JobActions job={j} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 일정 추가 — 선택한 날짜 기본값 */}
      <section className="tile">
        <h2 className="tile-title">일정 추가</h2>
        <form action={createEvent} className="space-y-2 text-sm">
          <input name="title" placeholder="일정 제목" className="w-full" required />
          <div className="flex flex-wrap items-center gap-2">
            <input name="starts_at" type="datetime-local" defaultValue={`${selected}T09:00`} required aria-label="시작" />
            <input name="ends_at" type="datetime-local" aria-label="종료" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="all_day" /> 종일</label>
            <button type="submit" className="btn btn-primary ml-auto px-4 py-2 text-white" style={{ background: 'var(--accent)' }}>추가</button>
          </div>
        </form>
      </section>
    </main>
  );
}
