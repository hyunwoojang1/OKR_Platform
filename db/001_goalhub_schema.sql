-- goalhub 스키마 v1 (2026-08-17 밤샘루프 R2)
-- 원칙: 이 파일의 DDL은 goalhub 스키마 안에서만 동작한다. 다른 스키마는 건드리지 않는다.
-- 접근 모델: 서버(service_role)만 읽기/쓰기. anon/authenticated에는 아무 권한도 주지 않는다(fail-closed).

create schema if not exists goalhub;

-- 영역 (운동·재테크·취업·자기계발·일·자격증 …)
create table if not exists goalhub.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6b7280',        -- 영역 컬러 = 정보 역할
  icon text,                                     -- 이모지 1글자
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- 분기 Objective
create table if not exists goalhub.objectives (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references goalhub.areas(id) on delete cascade,
  title text not null,
  period text not null,                          -- 예: 2026-Q3
  status text not null default 'active' check (status in ('active','done','dropped')),
  note text,
  created_at timestamptz not null default now()
);

-- 월 마일스톤
create table if not exists goalhub.milestones (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references goalhub.objectives(id) on delete cascade,
  month text not null,                           -- 예: 2026-08
  title text not null,
  status text not null default 'active' check (status in ('active','done','dropped')),
  created_at timestamptz not null default now()
);

-- Key Result (source: manual=수동, habit_agg=습관 자동집계, api=외부연동 자리)
create table if not exists goalhub.key_results (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references goalhub.objectives(id) on delete cascade,
  title text not null,
  target_value numeric not null,
  current_value numeric not null default 0,
  unit text not null default '',
  source text not null default 'manual' check (source in ('manual','habit_agg','api')),
  source_ref text,                               -- habit_agg: habit id / api: 커넥터 키(예: econ.portfolio_return)
  created_at timestamptz not null default now()
);

-- 주간 이니셔티브
create table if not exists goalhub.initiatives (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid references goalhub.milestones(id) on delete set null,
  area_id uuid references goalhub.areas(id) on delete set null,
  title text not null,
  week_of date not null,                         -- 그 주 월요일
  status text not null default 'active' check (status in ('active','done','dropped')),
  priority int not null default 2 check (priority between 1 and 3),  -- 1=높음
  created_at timestamptz not null default now()
);

-- 오늘 할일
create table if not exists goalhub.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid references goalhub.initiatives(id) on delete set null,
  area_id uuid references goalhub.areas(id) on delete set null,
  title text not null,
  date date not null,
  done boolean not null default false,
  done_at timestamptz,
  carried_over int not null default 0,           -- 이월 횟수 (브리핑 정렬 재료)
  due_date date,                                 -- 마감 (브리핑 정렬 재료)
  source text not null default 'manual' check (source in ('manual','initiative','job_posting')),
  source_ref text,
  created_at timestamptz not null default now()
);
create index if not exists idx_daily_tasks_date on goalhub.daily_tasks(date);

-- 습관 (OKR 트리와 별도 층)
create table if not exists goalhub.habits (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references goalhub.areas(id) on delete set null,
  title text not null,
  cadence text not null default 'daily' check (cadence in ('daily','weekly')),
  target_per_week int not null default 7,        -- weekly면 주 목표 횟수
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists goalhub.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references goalhub.habits(id) on delete cascade,
  date date not null,
  done boolean not null default true,
  unique (habit_id, date)
);

-- 캘린더 (v1: 앱 자체 일정, google_event_id는 내일 OAuth 연결 후 동기화에 사용)
create table if not exists goalhub.calendar_events (
  id uuid primary key default gen_random_uuid(),
  google_event_id text unique,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  source text not null default 'app' check (source in ('app','google')),
  sync_status text not null default 'local' check (sync_status in ('local','synced','pending_push')),
  created_at timestamptz not null default now()
);
create index if not exists idx_calendar_starts on goalhub.calendar_events(starts_at);

-- 저녁 마감: 한 줄 회고 (향후 일기 볼트로 내보내는 원천)
create table if not exists goalhub.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  note text,
  checked_count int not null default 0,
  created_at timestamptz not null default now()
);

-- 푸시 구독 (기기별)
create table if not exists goalhub.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  disabled boolean not null default false
);

-- 브리핑 발송 이력
create table if not exists goalhub.briefings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text not null default 'morning' check (kind in ('morning','evening')),
  content jsonb not null,
  sent_at timestamptz,
  opened_at timestamptz,
  unique (date, kind)
);

-- job 크롤러 적재 브리지 (로컬 크롤러가 업로드 → 허브가 읽음)
create table if not exists goalhub.job_postings (
  id uuid primary key default gen_random_uuid(),
  source text not null,                          -- 크롤 소스명
  company text not null,
  title text not null,
  url text not null unique,
  deadline date,
  crawled_at timestamptz not null default now(),
  starred boolean not null default false,        -- 쓰기: 관심 표시
  sent_to_task boolean not null default false    -- 쓰기: 할일로 보냄
);
create index if not exists idx_job_postings_crawled on goalhub.job_postings(crawled_at desc);

-- 보안: RLS 전부 켜고 정책은 만들지 않는다 → anon/authenticated 완전 차단, service_role만 통과
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'goalhub' loop
    execute format('alter table goalhub.%I enable row level security', t.tablename);
  end loop;
end $$;

-- anon/authenticated에 스키마 사용권 자체를 주지 않음 (기본값이지만 명시적으로 회수)
revoke all on schema goalhub from anon, authenticated;
revoke all on all tables in schema goalhub from anon, authenticated;
