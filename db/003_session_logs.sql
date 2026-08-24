-- 003 (v4 개편): 세션 로그 — 만능 원자.
-- 할일 체크(kind='check')·자유 한 줄 기록(kind='log')·저녁 회고(kind='review')가 한 타임라인에 쌓인다.
-- KR 자동 측정(log_agg)·아침 AI의 기억·회사별 검색·슬럼프 방어의 원천 데이터. (docs/REDESIGN_PLAN.md)
create table if not exists goalhub.session_logs (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references goalhub.areas(id) on delete set null,
  objective_id uuid references goalhub.objectives(id) on delete set null,
  task_id uuid references goalhub.daily_tasks(id) on delete set null,
  kind text not null default 'log' check (kind in ('log', 'check', 'review')),
  note text,
  metrics jsonb,                              -- AI 파싱 수치: [{"v":72,"u":"점"},{"v":2,"u":"회"}]
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_slog_logged on goalhub.session_logs (logged_at desc);
create index if not exists idx_slog_obj on goalhub.session_logs (objective_id);
create index if not exists idx_slog_area on goalhub.session_logs (area_id);

alter table goalhub.session_logs enable row level security;
revoke all on goalhub.session_logs from anon, authenticated;
grant all on goalhub.session_logs to service_role;

-- KR 측정 방식에 '로그 집계형' 추가 (세션 로그가 지표를 자동으로 채움)
alter table goalhub.key_results drop constraint if exists key_results_source_check;
alter table goalhub.key_results add constraint key_results_source_check
  check (source in ('manual', 'habit_agg', 'api', 'log_agg'));

-- v4: 목표에 기한("9/30까지") — 분기(period)보다 구체적인 마감
alter table goalhub.objectives add column if not exists due_date date;
