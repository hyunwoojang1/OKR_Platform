import { db } from './db';
import type { Area, Objective, Milestone, KeyResult, Initiative, DailyTask, Habit, HabitLog, CalendarEvent } from './types';
import { kstToday, kstMonday } from './types';

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
  if (data.length === 0) {
    // 최초 1회 기본 영역 시드
    const { error: seedErr } = await db().from('areas').insert(DEFAULT_AREAS);
    if (seedErr) throw new Error(`영역 시드 실패: ${seedErr.message}`);
    return getAreas();
  }
  return data as Area[];
}

export type OkrTree = {
  areas: Area[];
  objectives: Objective[];
  milestones: Milestone[];
  keyResults: KeyResult[];
  initiatives: Initiative[];
};

export async function getOkrTree(): Promise<OkrTree> {
  const areas = await getAreas();
  const [obj, ms, kr, ini] = await Promise.all([
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
  if (h.error) throw new Error(`습관 조회 실패: ${h.error.message}`);
  if (l.error) throw new Error(`습관 로그 조회 실패: ${l.error.message}`);
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
};

export async function getToday(): Promise<TodayData> {
  const date = kstToday();
  const dayStartUtc = new Date(`${date}T00:00:00+09:00`).toISOString();
  const dayEndUtc = new Date(`${date}T23:59:59+09:00`).toISOString();
  const [areas, tasks, habitsData, events, inis] = await Promise.all([
    getAreas(),
    db().from('daily_tasks').select('*').eq('date', date).order('done').order('created_at'),
    getHabitsWithLogs(28),
    db().from('calendar_events').select('*').gte('starts_at', dayStartUtc).lte('starts_at', dayEndUtc).order('starts_at'),
    db().from('initiatives').select('*').eq('status', 'active').eq('week_of', kstMonday()).order('priority'),
  ]);
  if (tasks.error) throw new Error(`할일 조회 실패: ${tasks.error.message}`);
  if (events.error) throw new Error(`일정 조회 실패: ${events.error.message}`);
  if (inis.error) throw new Error(`이니셔티브 조회 실패: ${inis.error.message}`);
  return {
    date,
    tasks: tasks.data as DailyTask[],
    habits: habitsData.habits,
    habitLogs: habitsData.logs,
    events: events.data as CalendarEvent[],
    weekInitiatives: inis.data as Initiative[],
    areas,
  };
}

// 습관 스트릭: 오늘(또는 어제)부터 거꾸로 연속 체크일 수
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
