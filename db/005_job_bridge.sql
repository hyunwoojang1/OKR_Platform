-- 005: job_applications 연동 (job_applications/5_AI툴/docs/OKR연동_스펙.md 계약)
-- 역방향 명령 큐: 앱 버튼(승격/제출완료/미지원) → INSERT → 로컬 apply_commands.py가 폴더 이동 후 status 갱신
create table if not exists goalhub.job_commands (
  id bigint generated always as identity primary key,
  action text not null check (action in ('promote', 'submitted', 'rejected')),
  url text,              -- 공고 URL (매칭 1순위)
  company text,          -- 회사명 (url 없을 때 보조 키)
  status text not null default 'pending',  -- pending | done | error
  note text,             -- 로컬 실행기가 결과 기록
  created_at timestamptz default now()
);
alter table goalhub.job_commands enable row level security;
revoke all on goalhub.job_commands from anon, authenticated;
grant all on goalhub.job_commands to service_role;

-- job_postings v2 확장 (스펙의 okr_jobs_full.json 필드 — 취준 exporter가 채움)
alter table goalhub.job_postings add column if not exists stage text not null default '수집함';
alter table goalhub.job_postings add column if not exists category text;
alter table goalhub.job_postings add column if not exists dday int;
alter table goalhub.job_postings add column if not exists analyzed boolean not null default false;
alter table goalhub.job_postings add column if not exists essay boolean not null default false;
alter table goalhub.job_postings add column if not exists priority text;
create index if not exists idx_jobs_deadline on goalhub.job_postings (deadline);
