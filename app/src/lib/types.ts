export type Area = {
  id: string; name: string; color: string; icon: string | null; sort_order: number; archived: boolean;
};
export type Objective = {
  id: string; area_id: string; title: string; period: string;
  status: 'active' | 'done' | 'dropped'; note: string | null; due_date: string | null;
};
export type Milestone = {
  id: string; objective_id: string; month: string; title: string; status: 'active' | 'done' | 'dropped';
};
export type KeyResult = {
  id: string; objective_id: string; title: string; target_value: number; current_value: number;
  unit: string; source: 'manual' | 'habit_agg' | 'api'; source_ref: string | null;
};
export type Initiative = {
  id: string; milestone_id: string | null; objective_id: string | null; area_id: string | null;
  title: string; week_of: string;
  status: 'active' | 'done' | 'dropped'; priority: number;
};
export type SessionLog = {
  id: string; area_id: string | null; objective_id: string | null; task_id: string | null;
  kind: 'log' | 'check' | 'review'; note: string | null;
  metrics: { v: number; u: string }[] | null; logged_at: string;
};
export type DailyTask = {
  id: string; initiative_id: string | null; area_id: string | null; title: string; date: string;
  done: boolean; done_at: string | null; carried_over: number; due_date: string | null;
  source: 'manual' | 'initiative' | 'job_posting'; source_ref: string | null;
};
export type Habit = {
  id: string; area_id: string | null; title: string; cadence: 'daily' | 'weekly';
  target_per_week: number; archived: boolean;
};
export type HabitLog = { id: string; habit_id: string; date: string; done: boolean };
export type CalendarEvent = {
  id: string; google_event_id: string | null; title: string; starts_at: string; ends_at: string | null;
  all_day: boolean; source: 'app' | 'google'; sync_status: string;
};
export type DailyReview = { id: string; date: string; note: string | null; checked_count: number };
export type JobPosting = {
  id: string; source: string; company: string; title: string; url: string; deadline: string | null;
  crawled_at: string; starred: boolean; sent_to_task: boolean;
  // v2 (job_applications 연동 스펙): 취준 크롤러가 채우는 파이프라인 상태
  stage: string; category: string | null; dday: number | null;
  analyzed: boolean; essay: boolean; priority: string | null;
};

// KST 기준 날짜 유틸 (서버가 UTC여도 한국 하루 기준으로 동작해야 함)
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}
export function kstMonday(offsetWeeks = 0): string {
  const now = new Date(Date.now() + 9 * 3600_000);
  const day = (now.getUTCDay() + 6) % 7; // 월=0
  now.setUTCDate(now.getUTCDate() - day + offsetWeeks * 7);
  return now.toISOString().slice(0, 10);
}
export function kstQuarter(): string {
  const now = new Date(Date.now() + 9 * 3600_000);
  return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
}
export function kstMonth(): string {
  return kstToday().slice(0, 7);
}
