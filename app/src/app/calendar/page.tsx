import { db } from '@/lib/db';
import { syncCalendar } from '@/lib/google-calendar';
import type { Area, CalendarEvent, Initiative, JobPosting, KeyResult, Objective, SessionLog } from '@/lib/types';
import { kstToday } from '@/lib/types';
import CalendarView, { type GoalLite, type LogLite } from './CalendarView';

export const dynamic = 'force-dynamic';

// v4 달력 v2: 좌(월 그리드+선택일) · 우(목표 패널 — 누르면 그 목표의 주간·마감이 달력에서 빛남).
// 레이어 토글(일정/기록/지원예정/후보 공고), 기록은 농도로만 표시. 진입 시 Google 동기화(1분 스로틀).
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sync = await syncCalendar();
  const today = kstToday();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);

  const [y, mo] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
  const daysInMonth = new Date(y, mo, 0).getDate();
  const monthStart = new Date(`${month}-01T00:00:00+09:00`).toISOString();
  const monthEnd = new Date(new Date(`${month}-${String(daysInMonth).padStart(2, '0')}T00:00:00+09:00`).getTime() + 86400_000).toISOString();
  const monthEndDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const [evsQ, jobsQ, logsQ, objQ, krQ, iniQ, areasQ] = await Promise.all([
    db().from('calendar_events').select('*').gte('starts_at', monthStart).lt('starts_at', monthEnd).order('starts_at'),
    db().from('job_postings').select('*').in('stage', ['수집함', '지원예정'])
      .gte('deadline', `${month}-01`).lte('deadline', monthEndDate).order('deadline'),
    db().from('session_logs').select('id,kind,note,metrics,logged_at,objective_id')
      .gte('logged_at', monthStart).lt('logged_at', monthEnd).order('logged_at').limit(2000),
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
    const pct = myKrs.length
      ? Math.round(myKrs.reduce((s, k) => s + Math.min(100, (k.current_value / k.target_value) * 100), 0) / myKrs.length)
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

  const logs: LogLite[] = (logsQ.data as SessionLog[]).map((l) => ({
    id: l.id, kind: l.kind, note: l.note, metrics: l.metrics, logged_at: l.logged_at, objective_id: l.objective_id,
  }));

  return (
    <CalendarView
      month={month}
      today={today}
      events={evsQ.data as CalendarEvent[]}
      jobs={jobsQ.data as JobPosting[]}
      logs={logs}
      goals={goals}
      syncLabel={sync.connected && !sync.error ? 'Google 연동됨' : sync.error ?? 'Google 미연결'}
      syncConnected={sync.connected}
    />
  );
}
