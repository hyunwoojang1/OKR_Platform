import { db } from '@/lib/db';
import { syncCalendar } from '@/lib/google-calendar';
import type { Area, CalendarEvent, Initiative, JobPosting, KeyResult, Objective, SessionLog } from '@/lib/types';
import { kstToday, krPct } from '@/lib/types';
import CalendarView, { type GoalLite, type LogLite } from './CalendarView';
import type { KrLite } from './DeadlineCheck';

export const dynamic = 'force-dynamic';

// v4 달력 v2: 좌(월 그리드+선택일) · 우(목표 패널 — 누르면 그 목표의 주간·마감이 달력에서 빛남).
// 레이어 토글(일정/기록/지원예정/후보 공고), 기록은 농도로만 표시. 진입 시 Google 동기화(1분 스로틀).
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const sync = await syncCalendar();
  const today = kstToday();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  // 주간 뷰에서 주가 월 경계를 넘어올 때 선택일을 유지한다 (?d=)
  const initialSelected = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? '')
    ? sp.d!
    : month === today.slice(0, 7) ? today : `${month}-01`;

  const [y, mo] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
  const daysInMonth = new Date(y, mo, 0).getDate();
  const monthStart = new Date(`${month}-01T00:00:00+09:00`).toISOString();
  const monthEnd = new Date(new Date(`${month}-${String(daysInMonth).padStart(2, '0')}T00:00:00+09:00`).getTime() + 86400_000).toISOString();
  // 주간 뷰는 월 경계에 걸친 주도 그려야 하므로 앞뒤 7일씩 여유를 두고 가져온다
  const padStart = new Date(new Date(monthStart).getTime() - 7 * 86400_000).toISOString();
  const padEnd = new Date(new Date(monthEnd).getTime() + 7 * 86400_000).toISOString();
  const padStartDate = padStart.slice(0, 10);
  const padEndDate = padEnd.slice(0, 10);

  const [evsQ, jobsQ, logsQ, objQ, krQ, iniQ, areasQ] = await Promise.all([
    db().from('calendar_events').select('*').gte('starts_at', padStart).lt('starts_at', padEnd).order('starts_at'),
    db().from('job_postings').select('*').in('stage', ['수집함', '지원예정'])
      .gte('deadline', padStartDate).lte('deadline', padEndDate).order('deadline'),
    db().from('session_logs').select('id,kind,note,metrics,logged_at,objective_id')
      .gte('logged_at', padStart).lt('logged_at', padEnd).order('logged_at').limit(2000),
    db().from('objectives').select('*').eq('status', 'active').order('created_at'),
    db().from('key_results').select('*'),
    db().from('initiatives').select('*').not('objective_id', 'is', null),
    db().from('areas').select('*'),
  ]);
  for (const q of [evsQ, jobsQ, logsQ, objQ, krQ, iniQ, areasQ]) {
    if (q.error) throw new Error(`달력 조회 실패: ${q.error.message}`);
  }
  const objectives = objQ.data as Objective[];
  const krs = krQ.data as KeyResult[];
  const inis = iniQ.data as Initiative[];
  const areas = areasQ.data as Area[];

  const goals: GoalLite[] = objectives.map((o) => {
    const myKrs = krs.filter((k) => k.objective_id === o.id);
    // 진행률은 krPct 하나로만 낸다 — 여기서 직접 나누면 목표값이 없을 때 Infinity 가 되고,
    // 시작값·주기형 처리도 빠진다(줄이기형 지표가 반대로 나온다).
    const counted = myKrs.filter((k) => k.target_value != null);
    const pct = counted.length
      ? Math.round(counted.reduce((s, k) => s + krPct(k), 0) / counted.length)
      : 0;
    return {
      id: o.id,
      title: o.title,
      areaName: areas.find((a) => a.id === o.area_id)?.name ?? '영역',
      dueDate: o.due_date,
      pct,
      weeks: inis
        .filter((i) => i.objective_id === o.id)
        .map((i) => ({ weekOf: i.week_of, title: i.title, done: i.status === 'done' })),
    };
  });

  // 일정에 걸 수 있는 지표는 살아있는 목표의 것 중 '손으로 올리는' 것만.
  // 끝난 목표를 고르게 두면 헷갈리고, 자동 집계 지표를 고르게 두면 다음 동기화가 덮어쓴다.
  const krLites: KrLite[] = krs
    .filter((k) => k.source === 'manual' && objectives.some((o) => o.id === k.objective_id))
    .map((k) => ({
      id: k.id,
      title: k.title,
      unit: k.unit ?? '',
      goal: objectives.find((o) => o.id === k.objective_id)?.title ?? '목표',
      objectiveId: k.objective_id ?? null,
    }));

  const logs: LogLite[] = (logsQ.data as SessionLog[]).map((l) => ({
    id: l.id, kind: l.kind, note: l.note, metrics: l.metrics, logged_at: l.logged_at, objective_id: l.objective_id,
  }));

  return (
    <CalendarView
      month={month}
      today={today}
      initialSelected={initialSelected}
      events={evsQ.data as CalendarEvent[]}
      jobs={jobsQ.data as JobPosting[]}
      logs={logs}
      goals={goals}
      krs={krLites}
      syncLabel={sync.connected && !sync.error ? 'Google 연동됨' : sync.error ?? 'Google 미연결'}
      syncConnected={sync.connected}
    />
  );
}
