import Link from 'next/link';
import { db } from '@/lib/db';
import type { CalendarEvent, Season } from '@/lib/types';
import { kstToday } from '@/lib/types';
import { isDeadlineEvent, ddayOf, pickSeason, looksLikeCert, type SeasonLite } from '@/lib/deadline';
import SeasonBoard, { type EventLite, type Group } from './SeasonBoard';

export const dynamic = 'force-dynamic';

/** 이력으로 볼 만한 범위. 이보다 오래된 건 지금 되묻는 질문이 아니다. */
const LOOKBACK_DAYS = 500;
const LOOKAHEAD_DAYS = 400;

/**
 * 지난 마감 — 지원 이력.
 *
 * 달력은 "앞으로 뭐가 있나"만 답한다. 끝난 마감은 뒤로 넘어가면서 사라지고,
 * "올 하반기에 몇 군데 넣었더라"는 계속 되묻게 되는 질문으로 남는다.
 * 여기서 지난 마감을 시즌 폴더로 모아 그 질문에 답한다.
 */
export default async function DeadlinesPage() {
  const today = kstToday();
  const from = new Date(new Date(`${today}T00:00:00+09:00`).getTime() - LOOKBACK_DAYS * 86400_000).toISOString();
  const to = new Date(new Date(`${today}T00:00:00+09:00`).getTime() + LOOKAHEAD_DAYS * 86400_000).toISOString();

  const [seasonsQ, evsQ] = await Promise.all([
    db().from('seasons').select('*').order('sort_order').order('created_at'),
    db().from('calendar_events').select('*').gte('starts_at', from).lte('starts_at', to).order('starts_at').limit(2000),
  ]);
  if (seasonsQ.error) throw new Error(`시즌 조회 실패: ${seasonsQ.error.message}`);
  if (evsQ.error) throw new Error(`마감 조회 실패: ${evsQ.error.message}`);

  const seasons = (seasonsQ.data ?? []) as Season[];
  const seasonLites: SeasonLite[] = seasons.map((s) => ({
    id: s.id, name: s.name, starts_on: s.starts_on, ends_on: s.ends_on, keywords: s.keywords ?? [],
  }));

  const deadlines = ((evsQ.data ?? []) as CalendarEvent[]).filter(isDeadlineEvent);

  // 시즌별로 나눈다. 아직 안 지났고 완료도 안 한 것은 '예정'으로 세기만 한다 —
  // 이 화면은 이력이지 할 일 목록이 아니다.
  const bySeason = new Map<string, { past: EventLite[]; upcoming: number }>();
  const bucket = (key: string) => {
    const found = bySeason.get(key);
    if (found) return found;
    const fresh = { past: [] as EventLite[], upcoming: 0 };
    bySeason.set(key, fresh);
    return fresh;
  };

  for (const e of deadlines) {
    const dday = ddayOf(e.starts_at, today);
    const done = Boolean(e.done_at);
    const b = bucket(pickSeason(e, seasonLites) ?? '');
    if (!done && dday >= 0) {
      b.upcoming += 1;
      continue;
    }
    b.past.push({
      id: e.id,
      title: e.title,
      date: new Date(new Date(e.starts_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10),
      dday,
      done,
      manual: Boolean(e.season_id),
      cert: looksLikeCert(e.title),
    });
  }

  // 최근 것이 위로. 폴더를 열었을 때 방금 끝낸 게 먼저 보여야 한다.
  for (const b of bySeason.values()) b.past.sort((a, z) => z.date.localeCompare(a.date));

  const groups: Group[] = [
    ...seasonLites.map((s) => ({
      season: s,
      past: bySeason.get(s.id)?.past ?? [],
      upcoming: bySeason.get(s.id)?.upcoming ?? 0,
    })),
    { season: null, past: bySeason.get('')?.past ?? [], upcoming: bySeason.get('')?.upcoming ?? 0 },
  ];

  const allPast = groups.flatMap((g) => g.past);
  const doneCount = allPast.filter((e) => e.done).length;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight">지난 마감</h1>
          <p className="t-sub mt-0.5">
            {allPast.length === 0
              ? '아직 지나간 마감이 없어요'
              : `${allPast.length}건 중 ${doneCount}건 제출 표시`}
          </p>
        </div>
        <Link href="/calendar" className="t-cap underline underline-offset-2">← 달력</Link>
      </header>

      {allPast.length > 0 && (
        <div className="tile !p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="t-cap">제출률</span>
            <span className="mono text-[13px]">{Math.round((doneCount / allPast.length) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
            <div className="h-full rounded-full" style={{ width: `${(doneCount / allPast.length) * 100}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      )}

      <SeasonBoard groups={groups} seasons={seasonLites} today={today} />
    </main>
  );
}
