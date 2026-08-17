import { db } from '@/lib/db';
import { createEvent, deleteEvent } from '@/lib/actions';
import type { CalendarEvent } from '@/lib/types';
import { kstToday } from '@/lib/types';

export const dynamic = 'force-dynamic';

// 앞으로 14일 아젠다 뷰 (Google 동기화 연결 전까지 앱 일정만)
export default async function CalendarPage() {
  const today = kstToday();
  const from = new Date(`${today}T00:00:00+09:00`).toISOString();
  const to = new Date(Date.now() + 14 * 86400_000).toISOString();
  const { data, error } = await db()
    .from('calendar_events').select('*').gte('starts_at', from).lte('starts_at', to).order('starts_at');
  if (error) throw new Error(`일정 조회 실패: ${error.message}`);
  const events = data as CalendarEvent[];

  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const d = new Date(new Date(e.starts_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    byDate.set(d, [...(byDate.get(d) ?? []), e]);
  }

  return (
    <main className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">일정</h1>
        <span className="text-xs opacity-50">앞으로 14일 · Google 동기화 대기</span>
      </header>

      <section className="tile">
        <h2 className="tile-title">일정 추가</h2>
        <form action={createEvent} className="space-y-2 text-sm">
          <input name="title" placeholder="일정 제목" className="w-full" required />
          <div className="flex flex-wrap items-center gap-2">
            <input name="starts_at" type="datetime-local" required aria-label="시작" />
            <input name="ends_at" type="datetime-local" aria-label="종료" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="all_day" /> 종일</label>
            <button type="submit" className="ml-auto border border-[var(--line)] px-3 py-1.5">추가</button>
          </div>
        </form>
      </section>

      {[...byDate.entries()].map(([date, list]) => (
        <section key={date} className="tile">
          <h2 className="tile-title">{date}{date === today ? ' · 오늘' : ''}</h2>
          <ul className="space-y-1.5">
            {list.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="w-12 tabular-nums text-xs opacity-70">
                  {e.all_day ? '종일' : new Date(e.starts_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })}
                </span>
                <span className="flex-1">{e.title}</span>
                {e.source === 'google' && <span className="text-[10px] opacity-40">G</span>}
                {e.source === 'app' && (
                  <form action={deleteEvent}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" aria-label="삭제" className="text-xs opacity-40 hover:opacity-100">✕</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {events.length === 0 && <p className="text-sm opacity-50">예정된 일정이 없어요.</p>}
    </main>
  );
}
