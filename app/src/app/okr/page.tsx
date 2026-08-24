import Link from 'next/link';
import { db } from '@/lib/db';
import type { Area, Objective, KeyResult, Initiative } from '@/lib/types';
import { kstToday, kstMonday, krPct } from '@/lib/types';

export const dynamic = 'force-dynamic';

// v4 목표 목록: 목표당 카드 하나 — 영역 라벨 + 제목 + 사람 문장 + 진행 링 + 다음 마감 한 줄.
// OKR 용어는 UI에서 퇴출 (REDESIGN_PLAN).
export default async function OkrPage() {
  const [areasQ, objQ, krQ, iniQ, evQ] = await Promise.all([
    db().from('areas').select('*').eq('archived', false),
    db().from('objectives').select('*').eq('status', 'active').order('created_at'),
    db().from('key_results').select('*'),
    db().from('initiatives').select('*').eq('week_of', kstMonday()),
    db().from('calendar_events').select('id').gte('starts_at', new Date().toISOString()).limit(100),
  ]);
  for (const q of [areasQ, objQ, krQ, iniQ, evQ]) {
    if (q.error) throw new Error(`목표 조회 실패: ${q.error.message}`);
  }
  const areas = areasQ.data as Area[];
  const objectives = objQ.data as Objective[];
  const krs = krQ.data as KeyResult[];
  const weekInis = iniQ.data as Initiative[];
  const upcomingCount = (evQ.data ?? []).length;
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const today = kstToday();

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="t-large">목표</h1>
        <Link
          href="/okr/new"
          aria-label="새 목표"
          className="pressable flex h-9 w-9 items-center justify-center rounded-full text-xl font-light text-white"
          style={{ background: 'var(--ink)' }}
        >
          +
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
      {objectives.map((obj) => {
        const objKrs = krs.filter((k) => k.objective_id === obj.id);
        const pct = objKrs.length
          ? Math.round(objKrs.reduce((s, k) => s + krPct(k), 0) / objKrs.length)
          : 0;
        const myWeek = weekInis.filter((i) => i.objective_id === obj.id);
        const doneCount = myWeek.filter((i) => i.status === 'done').length;
        const sentence =
          myWeek.length > 0
            ? `이번 주 ${myWeek.length}개 중 ${doneCount}개 했어요.`
            : objKrs.length > 0
              ? '이번 주 계획이 아직 없어요.'
              : '지표를 정하면 진행이 보여요.';
        const dday = obj.due_date
          ? Math.ceil((new Date(`${obj.due_date}T00:00:00+09:00`).getTime() - new Date(`${today}T00:00:00+09:00`).getTime()) / 86400_000)
          : null;
        return (
          <Link key={obj.id} href={`/okr/${obj.id}`} className="pressable block">
            <section className="tile space-y-4 !p-[18px]">
              <div className="flex items-start gap-4">
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="mono text-[11px] tracking-wide" style={{ color: 'var(--accent)' }}>
                    {areaById.get(obj.area_id)?.name ?? '영역'}
                  </div>
                  <div className="text-lg font-medium leading-snug tracking-tight">{obj.title}</div>
                  <div className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{sentence}</div>
                </div>
                <div
                  className="ring h-[58px] w-[58px]"
                  style={{ background: `conic-gradient(var(--accent) 0 ${pct}%, #EDEAE2 ${pct}%)` }}
                >
                  <div className="ring-inner h-[44px] w-[44px] text-[13px]">{pct}%</div>
                </div>
              </div>
              <div className="divider" />
              <div className="flex items-center gap-2.5 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                {dday !== null ? (
                  <>
                    <span className="mono text-xs" style={{ color: dday <= 7 ? 'var(--urgent)' : 'var(--ink-3)' }}>
                      D{dday >= 0 ? `-${dday}` : `+${-dday}`}
                    </span>
                    <span>{obj.due_date} 까지</span>
                  </>
                ) : (
                  <>
                    <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>오늘</span>
                    <span>{myWeek.length - doneCount > 0 ? `남은 할 일 ${myWeek.length - doneCount}개` : '오늘 몫은 끝났어요'}</span>
                  </>
                )}
              </div>
            </section>
          </Link>
        );
      })}
      </div>

      <Link href="/okr/new" className="block">
        <section
          className="flex flex-col gap-1.5 rounded-2xl border border-dashed p-[18px]"
          style={{ borderColor: 'var(--line-strong)' }}
        >
          <div className="text-[15px] font-medium" style={{ color: 'var(--ink-2)' }}>
            {upcomingCount > 0 ? `마감 ${upcomingCount}건이 캘린더에 있어요` : '첫 목표를 세워보세요'}
          </div>
          <div className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
            {objectives.length > 0 ? '이걸로 목표를 하나 더 만들 수 있습니다.' : '몇 가지 질문에 답하면 계획까지 잡아드려요.'}
          </div>
        </section>
      </Link>
    </main>
  );
}
