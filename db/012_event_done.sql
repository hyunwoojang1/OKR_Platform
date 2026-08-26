-- 012: 달력 마감을 완료 처리한다 — 1번 문제의 본체.
--
-- 지금까지 달력 일정은 "그 시간에 있다"는 표시일 뿐 완료 개념이 없었다. iM뱅크 자소서를
-- 냈어도 앱에 남길 방법이 없었고, 그게 사용자가 맨 처음 지적한 문제다.
--
-- 핵심 요구: 다음 주 마감이라도 오늘 다 냈으면 지금 눌러서 끝낼 수 있어야 한다.
-- 마감일까지 기다릴 이유가 없다.

-- 완료 시각. null이면 아직 안 함. 구글 동기화는 이 컬럼을 payload에 안 넣으므로
-- upsert가 덮어쓰지 않는다(제목·시간만 갱신됨).
alter table goalhub.calendar_events
  add column if not exists done_at timestamptz;

-- 이 일정이 '마감'인가. null = 제목 규칙으로 짐작, true/false = 사용자가 직접 정함.
-- 규칙이 틀렸을 때 손으로 고칠 수 있어야 한다는 요구를 담는다.
alter table goalhub.calendar_events
  add column if not exists is_deadline boolean;

-- 완료했을 때 어느 지표를 올릴지. 예: '🔴 마감 — iM뱅크' 체크 → '자기소개서 제출' +1
alter table goalhub.calendar_events
  add column if not exists key_result_id uuid references goalhub.key_results(id) on delete set null;

-- 시즌(마감 폴더) — "2026 하반기 공채", "자격증"처럼 사용자가 이름과 기간을 정한다.
-- 지난 마감이 여기로 모여 지원 이력이 된다.
create table if not exists goalhub.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date,
  ends_on date,
  -- 이 시즌에 속하는지 가르는 말들. 제목에 하나라도 있으면 이 시즌.
  -- 기간보다 먼저 본다 — 공채(8~10월)와 자격증(9월)이 겹칠 때 키워드가 정답을 안다.
  keywords text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table goalhub.calendar_events
  add column if not exists season_id uuid references goalhub.seasons(id) on delete set null;

create index if not exists idx_cal_done on goalhub.calendar_events(done_at) where done_at is not null;
create index if not exists idx_cal_deadline on goalhub.calendar_events(starts_at) where is_deadline is not false;

grant usage on schema goalhub to service_role;
grant all on goalhub.seasons to service_role;
