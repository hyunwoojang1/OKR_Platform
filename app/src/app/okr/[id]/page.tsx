import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { createLog, toggleInitiativeDone, togglePinObjective, updateKRProgress } from '@/lib/actions';
import DeleteLogButton from '@/app/DeleteLogButton';
import type { Area, Objective, KeyResult, Initiative, SessionLog } from '@/lib/types';
import { kstToday, kstMonday, kstMonth, krPct, fmtKrValue, isPaceKr, krUnit } from '@/lib/types';

export const dynamic = 'force-dynamic';

// v4 목표 상세: 위 = 판단 지표 + 이번 주 할 일 (얕게), 아래 = 이번 달 요약 + 기록 타임라인 (깊게).
export default async function GoalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { id } = await params;
  const { week } = await searchParams;

  const monthStart = new Date(`${kstMonth()}-01T00:00:00+09:00`).toISOString();
  const [objQ, krQ, iniQ, logQ, monthQ] = await Promise.all([
    db().from('objectives').select('*').eq('id', id).maybeSingle(),
    db().from('key_results').select('*').eq('objective_id', id),
    db().from('initiatives').select('*').eq('objective_id', id).order('week_of').order('priority'),
    db().from('session_logs').select('*').eq('objective_id', id).order('logged_at', { ascending: false }).limit(30),
    db().from('session_logs').select('logged_at').eq('objective_id', id).gte('logged_at', monthStart).limit(1000),
  ]);
  if (objQ.error) throw new Error(`목표 조회 실패: ${objQ.error.message}`);
  const obj = objQ.data as Objective | null;
  if (!obj) notFound();
  for (const q of [krQ, iniQ, logQ, monthQ]) {
    if (q.error) throw new Error(`상세 조회 실패: ${q.error.message}`);
  }
  const krs = krQ.data as KeyResult[];
  const inis = iniQ.data as Initiative[];
  const logs = logQ.data as SessionLog[];
  const monthLogRows = (monthQ.data ?? []) as Pick<SessionLog, 'logged_at'>[];

  const { data: areaRow } = await db().from('areas').select('*').eq('id', obj.area_id).maybeSingle();
  const area = areaRow as Area | null;

  const pct = krs.length
    ? Math.round(krs.reduce((s, k) => s + krPct(k), 0) / krs.length)
    : 0;

  // 주차: 이니셔티브의 week_of들로 목표의 주 목록을 만든다
  const weekList = [...new Set(inis.map((i) => i.week_of))].sort();
  const thisMonday = kstMonday();
  const selectedWeek = week && weekList.includes(week) ? week : weekList.includes(thisMonday) ? thisMonday : weekList[weekList.length - 1];
  const weekInis = inis.filter((i) => i.week_of === selectedWeek);

  // 이번 달 요약 + 히트맵 (월 전체 로그 별도 조회분 기준)
  const month = kstMonth();
  const today = kstToday();
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const countByDay = new Map<string, number>();
  for (const l of monthLogRows) {
    const d = new Date(new Date(l.logged_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    countByDay.set(d, (countByDay.get(d) ?? 0) + 1);
  }
  const daysLogged = new Set(countByDay.keys());
  // 달의 1일이 무슨 요일인가 — 달력 격자의 앞을 이만큼 비워야 요일이 줄을 맞춘다
  const firstDow = new Date(`${month}-01T00:00:00+09:00`).getUTCDay();
  /*
    하루 칸의 색. 달력 탭과 같은 언어를 쓴다 — 한 날은 채운 초록 원, 오늘은 검은 원,
    앞으로 올 날은 흐리게. 예전엔 11칸짜리 격자에 네모를 죽 늘어놓아서
    "달력처럼 안 나오고 그냥 네모난 게 연속으로 나온다"는 말을 들었다.
    많이 한 날일수록 진해지는 것은 그대로 둔다 — 한눈에 밀도가 보이는 게 이 칸의 쓸모다.
  */
  const dayStyle = (n: number, day: string): React.CSSProperties => {
    if (day === today) return { background: 'var(--ink)', color: '#fff', fontWeight: 500 };
    if (n >= 3) return { background: 'oklch(0.62 0.13 150)', color: '#fff', fontWeight: 500 };
    if (n === 2) return { background: 'oklch(0.74 0.10 150)', color: '#fff' };
    if (n === 1) return { background: 'oklch(0.88 0.055 150)', color: 'var(--accent-deep)' };
    if (day > today) return { color: 'var(--ink-4)' };
    return { color: 'var(--ink-3)' };
  };

  const fmtTs = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${days[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-120px)] max-w-2xl flex-col">
      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--ink-2)' }}>
          <Link href="/okr">← 목표</Link>
          <Link href={`/okr/${id}/edit`} style={{ color: 'var(--ink-3)' }}>편집</Link>
        </div>

        <header className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="mono text-[11px] tracking-wide" style={{ color: 'var(--accent)' }}>
              {area?.name ?? '영역'}{obj.due_date ? ` · ${obj.due_date.slice(5).replace('-', '/')}까지` : ''}
            </div>
            {/* 📌 = 홈 D-day 보드 등재 (기한 있는 목표만 실제 표시됨) */}
            <form action={togglePinObjective}>
              <input type="hidden" name="id" value={obj.id} />
              <input type="hidden" name="pinned" value={obj.pinned ? 'false' : 'true'} />
              <button
                type="submit"
                title={obj.pinned ? 'D-day 보드에서 내리기' : 'D-day 보드에 올리기'}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${obj.pinned ? '' : 'opacity-50'}`}
                style={{ borderColor: obj.pinned ? 'var(--accent)' : 'var(--line-strong)', color: obj.pinned ? 'var(--accent-deep)' : 'var(--ink-3)' }}
              >
                📌 D-day{obj.pinned ? '' : ' 꺼짐'}
              </button>
            </form>
          </div>
          <h1 className="text-2xl font-medium leading-snug tracking-tight" style={{ textWrap: 'pretty' }}>{obj.title}</h1>
          <div className="flex items-center gap-2.5">
            <div className="bar-track flex-1" style={{ height: 5 }}>
              <div className="bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>{pct}%</span>
          </div>
        </header>

        {/* 이걸로 판단해요 */}
        {krs.length > 0 && (
          <section className="space-y-2.5">
            <div className="sec-label">이걸로 판단해요</div>
            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
              {krs.map((kr, i) => {
                const kpct = krPct(kr);
                const isWeekly = kr.cadence === 'weekly';
                const isDecrease = !isWeekly && kr.target_value != null && kr.start_value > kr.target_value;
                return (
                  <div key={kr.id}>
                    {i > 0 && <div className="divider mx-4" />}
                    <div className="flex flex-col gap-2 px-4 py-[15px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[15px]">
                          {kr.title}
                          {isWeekly && <span className="badge badge-accent ml-1.5 align-middle">매주</span>}
                        </span>
                        {kr.source === 'manual' ? (
                          <form action={updateKRProgress} className="flex items-baseline gap-0.5">
                            <input type="hidden" name="id" value={kr.id} />
                            <input
                              name="current_value"
                              defaultValue={fmtKrValue(kr, Number(kr.current_value))}
                              inputMode={isPaceKr(kr) ? 'text' : 'decimal'}
                              aria-label={isPaceKr(kr) ? '현재 페이스 (6:16 형식)' : '현재값'}
                              title={isPaceKr(kr) ? '6:16 처럼 분:초로 적어주세요' : undefined}
                              className="mono w-12 !border-0 !bg-transparent !p-0 text-right !text-[13px]"
                              style={{ color: 'var(--ink)', borderBottom: '1px dashed var(--line-strong)' }}
                            />
                            <span className="mono text-[13px]" style={{ color: 'var(--ink-4)' }}>{isDecrease ? ' → ' : '/'}{fmtKrValue(kr, Number(kr.target_value))}{krUnit(kr)}</span>
                            <button type="submit" className="sr-only">저장</button>
                          </form>
                        ) : (
                          <span className="mono text-[13px]">
                            {fmtKrValue(kr, Number(kr.current_value))}
                            <span style={{ color: 'var(--ink-4)' }}>{isDecrease ? ' → ' : '/'}{fmtKrValue(kr, Number(kr.target_value))}{krUnit(kr)}</span>
                          </span>
                        )}
                      </div>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${kpct}%` }} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 이번 주 할 일 */}
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <div className="sec-label">이번 주 할 일</div>
            {weekList.length > 0 && selectedWeek && (
              <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>
                {weekList.indexOf(selectedWeek) + 1}주차 / {weekList.length}
              </span>
            )}
          </div>
          {weekList.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {weekList.map((w, i) => {
                const active = w === selectedWeek;
                const past = w < thisMonday;
                return (
                  <Link
                    key={w}
                    href={`/okr/${id}?week=${w}`}
                    className="mono rounded-full px-[11px] py-1.5 text-xs"
                    style={
                      active
                        ? { background: 'var(--ink)', color: '#fff' }
                        : past
                          ? { background: '#EDEAE2', color: 'var(--ink-3)' }
                          : { border: '1px solid var(--line-strong)', color: 'var(--ink-4)' }
                    }
                  >
                    {i + 1}
                  </Link>
                );
              })}
            </div>
          )}
          {weekInis.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
              {weekInis.map((ini, i) => {
                const done = ini.status === 'done';
                return (
                  <div key={ini.id}>
                    {i > 0 && <div className="divider mx-4" />}
                    <form action={toggleInitiativeDone} className="flex items-center gap-3 px-4 py-[14px]">
                      <input type="hidden" name="id" value={ini.id} />
                      <input type="hidden" name="objective_id" value={id} />
                      <input type="hidden" name="done" value={done ? 'false' : 'true'} />
                      <button type="submit" aria-label={`${ini.title} ${done ? '체크 해제' : '완료'}`} className={`check ${done ? 'on' : ''}`}>✓</button>
                      <span className={`flex-1 text-[15px] ${done ? 'line-through' : ''}`} style={done ? { color: 'var(--ink-3)' } : undefined}>
                        {ini.title}
                      </span>
                    </form>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>이 주의 계획이 없어요.</p>
          )}
        </section>

        {/* 이번 달 */}
        <section className="space-y-2.5">
          <div className="sec-label">이번 달</div>
          <div className="tile space-y-3.5">
            <div className="text-[16px] leading-relaxed" style={{ textWrap: 'pretty' }}>
              {Number(month.slice(5))}월에 <span className="font-medium">{daysLogged.size}일</span> 기록했어요.
            </div>
            <div className="grid gap-y-1 text-center" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
              {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                <div key={d} className="mono pb-1 text-[11px]" style={{ color: i === 0 ? 'var(--urgent)' : 'var(--ink-3)' }}>{d}</div>
              ))}
              {Array.from({ length: firstDow }, (_, i) => <div key={`sp${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = `${month}-${String(i + 1).padStart(2, '0')}`;
                const n = countByDay.get(day) ?? 0;
                return (
                  <div key={day} className="flex justify-center py-0.5">
                    <span
                      className="mono flex h-7 w-7 items-center justify-center rounded-full text-[12.5px]"
                      style={dayStyle(n, day)}
                      title={n > 0 ? `${Number(day.slice(8))}일 · 기록 ${n}건` : undefined}
                    >
                      {i + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 기록 타임라인 */}
        <section className="space-y-3.5 pb-24">
          <div className="sec-label">기록</div>
          {logs.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
              아직 기록이 없어요. 아래에 한 줄을 남기면 여기부터 쌓입니다.
            </p>
          )}
          <div className="flex flex-col">
            {logs.map((log, i) => (
              <div key={log.id} className="group flex gap-3.5">
                <div className="flex w-[10px] flex-col items-center pt-[5px]">
                  <div className="tl-dot" style={{ background: i === 0 ? 'var(--accent)' : '#C9C4B8' }} />
                  {i < logs.length - 1 && <div className="tl-line" />}
                </div>
                <div className="flex flex-1 flex-col gap-1 pb-5">
                  <div className="mono flex items-center gap-2 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                    <span>{fmtTs(log.logged_at)}{log.kind === 'check' ? ' · 완료' : log.kind === 'review' ? ' · 회고' : ''}</span>
                    <DeleteLogButton id={log.id} redirect={`/okr/${id}`} />
                  </div>
                  <div className="text-[15px]">{log.note ?? '(내용 없음)'}</div>
                  {log.metrics && log.metrics.length > 0 && (
                    <div className="flex gap-1.5 pt-0.5">
                      {log.metrics.map((m, j) => (
                        <span key={j} className="badge badge-accent">{m.v}{m.u}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 한 줄 남기기 — 하단 고정 */}
      <div
        className="sticky bottom-[76px] pb-2 pt-3 md:bottom-4"
        style={{ background: 'linear-gradient(rgba(250,249,245,0), var(--paper) 40%)' }}
      >
        <form
          action={createLog}
          className="flex items-center gap-2.5 rounded-3xl border px-4 py-2.5"
          style={{ borderColor: 'var(--line-strong)', background: 'var(--surface)', boxShadow: 'var(--shadow-float)' }}
        >
          <input type="hidden" name="objective_id" value={id} />
          <input type="hidden" name="area_id" value={obj.area_id} />
          <input
            name="note"
            placeholder="한 줄 남기기"
            required
            autoComplete="off"
            className="flex-1 !border-0 !bg-transparent !p-0 text-[15px]"
          />
          <button
            type="submit"
            aria-label="기록 저장"
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[13px] text-white"
            style={{ background: 'var(--accent)' }}
          >
            ↑
          </button>
        </form>
      </div>
    </main>
  );
}
