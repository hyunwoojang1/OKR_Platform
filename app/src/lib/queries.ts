import { db } from './db';
import type { Area, Objective, Milestone, KeyResult, Initiative, DailyTask, Habit, HabitLog, CalendarEvent, SessionLog } from './types';
import { kstToday, kstMonday } from './types';
import { isDeadlineEvent, ddayOf, DEADLINE_LEAD_DAYS, DEADLINE_OVERDUE_DAYS } from './deadline';

const DEFAULT_AREAS: Array<Pick<Area, 'name' | 'color' | 'icon'> & { sort_order: number }> = [
  { name: '운동', color: '#10b981', icon: '💪', sort_order: 1 },
  { name: '재테크', color: '#f59e0b', icon: '📈', sort_order: 2 },
  { name: '취업', color: '#3b82f6', icon: '🎯', sort_order: 3 },
  { name: '자기계발', color: '#8b5cf6', icon: '📚', sort_order: 4 },
  { name: '일', color: '#64748b', icon: '💼', sort_order: 5 },
  { name: '자격증', color: '#ec4899', icon: '📝', sort_order: 6 },
];

export async function getAreas(): Promise<Area[]> {
  const { data, error } = await db().from('areas').select('*').eq('archived', false).order('sort_order');
  if (error) throw new Error(`영역 조회 실패: ${error.message}`);
  if (data.length > 0) return data as Area[];
  // 최초 1회 기본 영역 시드 — unique(name) + ignoreDuplicates로 레이스에도 멱등, 재귀 없음
  const { error: seedErr } = await db()
    .from('areas').upsert(DEFAULT_AREAS, { onConflict: 'name', ignoreDuplicates: true });
  if (seedErr) throw new Error(`영역 시드 실패: ${seedErr.message}`);
  const { data: seeded, error: reErr } = await db()
    .from('areas').select('*').eq('archived', false).order('sort_order');
  if (reErr) throw new Error(`영역 재조회 실패: ${reErr.message}`);
  return (seeded ?? []) as Area[];
}

export type OkrTree = {
  areas: Area[];
  objectives: Objective[];
  milestones: Milestone[];
  keyResults: KeyResult[];
  initiatives: Initiative[];
};

export async function getOkrTree(): Promise<OkrTree> {
  const [areas, obj, ms, kr, ini] = await Promise.all([
    getAreas(),
    db().from('objectives').select('*').neq('status', 'dropped').order('created_at'),
    db().from('milestones').select('*').neq('status', 'dropped').order('month'),
    db().from('key_results').select('*').order('created_at'),
    db().from('initiatives').select('*').neq('status', 'dropped').gte('week_of', kstMonday(-4)).order('priority'),
  ]);
  for (const r of [obj, ms, kr, ini]) if (r.error) throw new Error(`OKR 조회 실패: ${r.error.message}`);
  return {
    areas,
    objectives: obj.data as Objective[],
    milestones: ms.data as Milestone[],
    keyResults: kr.data as KeyResult[],
    initiatives: ini.data as Initiative[],
  };
}

export async function getHabitsWithLogs(days = 28): Promise<{ habits: Habit[]; logs: HabitLog[] }> {
  const since = new Date(Date.now() + 9 * 3600_000 - days * 86400_000).toISOString().slice(0, 10);
  const [h, l] = await Promise.all([
    db().from('habits').select('*').eq('archived', false).order('created_at'),
    db().from('habit_logs').select('*').gte('date', since),
  ]);
  if (h.error) throw new Error(`루틴 조회 실패: ${h.error.message}`);
  if (l.error) throw new Error(`루틴 로그 조회 실패: ${l.error.message}`);
  return { habits: h.data as Habit[], logs: l.data as HabitLog[] };
}

export type TodayData = {
  date: string;
  tasks: DailyTask[];
  habits: Habit[];
  habitLogs: HabitLog[];
  events: CalendarEvent[];
  weekInitiatives: Initiative[];
  areas: Area[];
  /** 최근에 반복해서 끝낸 일의 제목 → 완료 횟수. 루틴으로 옮기자고 제안할 근거. */
  repeated: Record<string, number>;
  /** 오늘 할일에 띄울 지표 — 목표에서 적은 것이 곧 오늘 체크할 것이 된다. */
  dailyKrs: KeyResult[];
  /** 지표별 이번 주 실적(주간형) — 월요일 이후 기록 합계. 최종형은 current_value를 쓴다. */
  krWeekDone: Record<string, number>;
  /** 지표별 오늘 남긴 기록 — 되돌리기와 "오늘 얼마나 했나" 표시에 쓴다. */
  krTodayLogs: Record<string, SessionLog[]>;
  /** 곧 닥친 마감 — D-3부터 오늘 할일 '마감·제출'에 올라온다. 이미 끝낸 건 빠진다. */
  dueEvents: CalendarEvent[];
};

/** 이만큼 반복해 끝냈으면 "이건 한 번짜리가 아니라 루틴이다"라고 볼 만하다. */
const ROUTINE_HINT_COUNT = 3;
const ROUTINE_HINT_DAYS = 21;

export async function getToday(): Promise<TodayData> {
  const date = kstToday();
  const dayStartUtc = new Date(`${date}T00:00:00+09:00`).toISOString();
  const dayEndUtc = new Date(`${date}T23:59:59+09:00`).toISOString();
  const sinceUtc = new Date(Date.now() - ROUTINE_HINT_DAYS * 86400_000).toISOString();
  const [areas, tasks, habitsData, events, inis, checks, krQ, krLogQ, dueQ] = await Promise.all([
    getAreas(),
    db().from('daily_tasks').select('*').eq('date', date).order('done').order('created_at'),
    getHabitsWithLogs(28),
    db().from('calendar_events').select('*').gte('starts_at', dayStartUtc).lte('starts_at', dayEndUtc).order('starts_at'),
    db().from('initiatives').select('*').eq('status', 'active').eq('week_of', kstMonday()).order('priority'),
    db().from('session_logs').select('note,logged_at').eq('kind', 'check').gte('logged_at', sinceUtc),
    // 루틴 박스에 띄울 지표 — 활성 목표의 것이면서 '손으로 올리는' 것만.
    // 자동 집계(habit_agg·api·goal_agg)를 여기 띄우면 사용자가 체크해서 숫자를 올려도
    // 다음 동기화가 계산값으로 덮어쓴다. "분명 체크했는데 왜 원래대로 돌아갔지"가 된다.
    db().from('key_results').select('*, objectives!inner(status)')
      .eq('show_daily', true).eq('objectives.status', 'active').eq('source', 'manual'),
    // 이번 주 기록 — 주간형 실적과 오늘 기록을 여기서 가른다
    db().from('session_logs').select('*').not('key_result_id', 'is', null).gte('logged_at', `${kstMonday()}T00:00:00+09:00`),
    // 곧 닥친 마감과, 놓친 지 얼마 안 된 마감.
    // 예전엔 하한이 '오늘'이라 어제 체크를 못 한 마감이 다음 날 홈에서 조용히 사라졌다.
    // 놓쳤다는 사실 자체를 알려주지 않으니 가장 나쁜 쪽으로 틀린 것이었다.
    db().from('calendar_events').select('*')
      .gte('starts_at', new Date(new Date(dayStartUtc).getTime() - DEADLINE_OVERDUE_DAYS * 86400_000).toISOString())
      .lte('starts_at', new Date(new Date(dayStartUtc).getTime() + (DEADLINE_LEAD_DAYS + 1) * 86400_000).toISOString())
      .order('starts_at'),
  ]);
  if (tasks.error) throw new Error(`할일 조회 실패: ${tasks.error.message}`);
  if (events.error) throw new Error(`일정 조회 실패: ${events.error.message}`);
  if (inis.error) throw new Error(`이니셔티브 조회 실패: ${inis.error.message}`);

  // 같은 제목을 며칠에 걸쳐 끝냈는지 센다. 하루에 여러 번 눌러도 1로 친다.
  const daysByTitle = new Map<string, Set<string>>();
  for (const row of (checks.data ?? []) as { note: string | null; logged_at: string }[]) {
    const title = row.note?.trim();
    if (!title) continue;
    const day = new Date(new Date(row.logged_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    if (!daysByTitle.has(title)) daysByTitle.set(title, new Set());
    daysByTitle.get(title)!.add(day);
  }
  const repeated: Record<string, number> = {};
  for (const [title, days] of daysByTitle) {
    if (days.size >= ROUTINE_HINT_COUNT) repeated[title] = days.size;
  }

  if (krQ.error) throw new Error(`지표 조회 실패: ${krQ.error.message}`);
  if (krLogQ.error) throw new Error(`지표 기록 조회 실패: ${krLogQ.error.message}`);
  const dailyKrs = (krQ.data ?? []) as KeyResult[];
  const krLogs = (krLogQ.data ?? []) as SessionLog[];

  const krWeekDone: Record<string, number> = {};
  const krTodayLogs: Record<string, SessionLog[]> = {};
  for (const kr of dailyKrs) {
    const mine = krLogs.filter((l) => l.key_result_id === kr.id);
    /*
      이번 주 실적을 어디서 읽나 — 지표 종류에 따라 다르다.

      주간형: current_value 를 그대로 믿는다. 월요일 0시 크론이 0으로 되돌리므로
        그 값이 곧 이번 주 실적이다. 기록에서 다시 세면 크론이 리셋한 값과 어긋나
        화면과 진행률이 따로 논다.

      최종형 + 이번 주 몫(015): current_value 는 처음부터 쌓인 전체값(4/12)이라
        이번 주 실적이 아니다. 월요일 이후 기록만 더해서 센다.
        내용형은 metrics 를 안 남기므로(kr-ledger) step 으로 친다.
    */
    if (kr.cadence === 'weekly') {
      krWeekDone[kr.id] = Number(kr.current_value);
    } else {
      const step = Number(kr.step) > 0 ? Number(kr.step) : 1;
      const sum = mine.reduce((acc, l) => acc + (l.metrics?.[0]?.v ?? step), 0);
      krWeekDone[kr.id] = Math.round(sum * 100) / 100;
    }
    krTodayLogs[kr.id] = mine
      .filter((l) => new Date(new Date(l.logged_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10) === date)
      .sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  }

  if (dueQ.error) throw new Error(`마감 조회 실패: ${dueQ.error.message}`);
  // 마감으로 판정됐고, 아직 안 끝냈고, 창 안에 든 것.
  // 위아래 한계를 한 줄에 같이 적는다 — 예전엔 조회 하한과 이 조건이 서로 다른 말을 했다.
  const dueEvents = ((dueQ.data ?? []) as CalendarEvent[]).filter((e) => {
    if (e.done_at || !isDeadlineEvent(e)) return false;
    const d = ddayOf(e.starts_at, date);
    return d >= -DEADLINE_OVERDUE_DAYS && d <= DEADLINE_LEAD_DAYS;
  });

  return {
    date,
    dueEvents,
    dailyKrs,
    krWeekDone,
    krTodayLogs,
    tasks: tasks.data as DailyTask[],
    habits: habitsData.habits,
    habitLogs: habitsData.logs,
    events: events.data as CalendarEvent[],
    weekInitiatives: inis.data as Initiative[],
    areas,
    repeated,
  };
}

// 루틴 연속일: 오늘(또는 어제)부터 거꾸로 연속 체크일 수
export function streakOf(habitId: string, logs: HabitLog[]): number {
  const dates = new Set(logs.filter((l) => l.habit_id === habitId && l.done).map((l) => l.date));
  let streak = 0;
  const cursor = new Date(Date.now() + 9 * 3600_000);
  if (!dates.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1); // 오늘 미체크면 어제부터
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function weekCountOf(habitId: string, logs: HabitLog[]): number {
  const monday = kstMonday();
  return logs.filter((l) => l.habit_id === habitId && l.done && l.date >= monday).length;
}
