export type Area = {
  id: string; name: string; color: string; icon: string | null; sort_order: number; archived: boolean;
};
export type Objective = {
  id: string; area_id: string; title: string; period: string;
  status: 'active' | 'done' | 'dropped'; note: string | null; due_date: string | null;
  parent_id: string | null; // 계열화: 소목표 → 대목표 (2단 트리)
  pinned: boolean; // 홈 D-day 보드 등재 여부 (기한 있는 활성 목표만 실제 표시)
};
export type Milestone = {
  id: string; objective_id: string; month: string; title: string; status: 'active' | 'done' | 'dropped';
};
export type KeyResult = {
  id: string; objective_id: string; title: string;
  /** 010 에서 nullable 이 됐다 — 내용형 지표는 개수 목표 없이도 성립한다. 타입만 몰랐다. */
  target_value: number | null;
  current_value: number;
  unit: string; source: 'manual' | 'habit_agg' | 'api' | 'log_agg' | 'goal_agg'; source_ref: string | null;
  /** 시작값 — target보다 크면 줄이기형(체중 75→70). 진행률=(현재-시작)/(목표-시작) */
  start_value: number;
  /** total=기간 누적/도달, weekly=매주 반복(current_value=이번 주 실적) */
  cadence: 'total' | 'weekly';
  /** 체크할 때 무엇을 받나 — check=톡 한 번, number=숫자, text=내용 적기 */
  input_mode: 'check' | 'number' | 'text';
  /** check형이 한 번에 오르는 양 (보통 1) */
  step: number;
};

/**
 * 페이스 지표인지. 저장은 소수 분(6.27)으로 하되 사람에겐 6:16으로 보여준다 —
 * 진행률 계산은 숫자라야 하고, 달리는 사람은 6.27분이라고 말하지 않기 때문.
 */
export function isPaceKr(kr: Pick<KeyResult, 'title'>): boolean {
  return /페이스|pace/i.test(kr.title);
}

/** 6.2667 → "6:16". 초는 반올림하고, 60초가 되면 분으로 올린다. */
export function fmtPace(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  let m = Math.floor(minutes);
  let s = Math.round((minutes - m) * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "6:16" → 6.2667. 그냥 숫자를 쳐도(6.5) 받아준다. 못 읽으면 null. */
export function parsePace(text: string): number | null {
  const s = text.trim();
  const mmss = /^(\d{1,2})\s*[:'분]\s*(\d{1,2})/.exec(s);
  if (mmss) {
    const m = Number(mmss[1]);
    const sec = Number(mmss[2]);
    if (sec >= 60) return null;
    return Math.round((m + sec / 60) * 10000) / 10000;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 화면에 찍을 단위. 페이스는 m:ss 자체가 분:초라 '분'을 또 붙이면 '6:00분'이 된다. */
export function krUnit(kr: Pick<KeyResult, 'title' | 'unit'>): string {
  return isPaceKr(kr) ? '' : kr.unit;
}

/** 화면에 찍을 지표 값 한 조각. 페이스면 m:ss, 아니면 숫자 그대로. */
export function fmtKrValue(kr: Pick<KeyResult, 'title'>, value: number): string {
  return isPaceKr(kr) ? fmtPace(value) : String(Number(value));
}

/** 지표 진행률(0~100). 시작값(줄이기 포함)·주기형을 모두 처리하는 단일 공식 — 모든 화면이 이걸 쓴다. */
export function krPct(kr: Pick<KeyResult, 'start_value' | 'target_value' | 'current_value' | 'cadence'>): number {
  // 목표값이 없는 지표(내용형)는 "몇 % 왔다"는 개념이 없다.
  // 이걸 안 막으면 null - 0 = 0 이 되어 span 0 → 100% 로 나온다. 아무것도 안 했는데 다 한 것처럼.
  if (kr.target_value == null) return 0;
  const start = kr.cadence === 'weekly' ? 0 : (kr.start_value ?? 0);
  const span = kr.target_value - start;
  if (span === 0) return 100;
  const raw = ((kr.current_value - start) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
export type Initiative = {
  id: string; milestone_id: string | null; objective_id: string | null; area_id: string | null;
  title: string; week_of: string;
  status: 'active' | 'done' | 'dropped'; priority: number;
};
export type SessionLog = {
  id: string; area_id: string | null; objective_id: string | null; task_id: string | null;
  /** 지표 체크가 남긴 기록이면 그 지표 — 내용형에서 "언제 어디" 목록을 뽑는 근거 */
  key_result_id?: string | null;
  kind: 'log' | 'check' | 'review'; note: string | null;
  metrics: { v: number; u: string }[] | null; logged_at: string;
};
export type DailyTask = {
  id: string; initiative_id: string | null; area_id: string | null; title: string; date: string;
  done: boolean; done_at: string | null; carried_over: number; due_date: string | null;
  source: 'manual' | 'initiative' | 'job_posting'; source_ref: string | null;
  /** 이 할일을 끝내면 오른 지표. 010 마이그레이션에 있고 actions.ts 가 채우는데 타입에만 없었다. */
  key_result_id: string | null;
};
export type Habit = {
  id: string; area_id: string | null; title: string; cadence: 'daily' | 'weekly';
  target_per_week: number; archived: boolean;
};
export type HabitLog = { id: string; habit_id: string; date: string; done: boolean };
export type CalendarEvent = {
  id: string; google_event_id: string | null; title: string; starts_at: string; ends_at: string | null;
  all_day: boolean; source: 'app' | 'google'; sync_status: string; pinned: boolean;
  /** 해냈다고 찍은 시각. 마감일 전이라도 미리 찍을 수 있다. */
  done_at?: string | null;
  /** 내가 뭔가 해야 하는 일정인가. null이면 제목 규칙으로 짐작, true/false는 손으로 정한 것 */
  is_deadline?: boolean | null;
  /** 끝냈을 때 올릴 지표 */
  key_result_id?: string | null;
  /** 지난 뒤 모일 시즌 폴더 */
  season_id?: string | null;
};

export type Season = {
  id: string; name: string; starts_on: string | null; ends_on: string | null;
  keywords: string[]; sort_order: number;
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
