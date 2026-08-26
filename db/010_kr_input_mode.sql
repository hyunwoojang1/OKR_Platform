-- 010: 지표에 "어떻게 기록하나"를 붙인다 — 러닝 제목 매칭 하드코딩을 걷어내기 위한 기반.
--
-- 지금까지는 앱이 지표 '이름'을 보고 성격을 추측했다.
--   RUN_WORDS(/러닝|달리기|조깅/), PACE_WORDS, BEST_DIST_WORDS, WEEKLY_MEASURE(/몸무게/)…
-- 이 방식은 수영·공부처럼 새 종목을 시작하는 순간 무너지고, 실제로 "주간 러닝 거리"가
-- 이름만 주간이고 cadence는 total로 앉아 매주 리셋이 안 되는 사고가 났다.
--
-- 대신 목표를 만들 때 사용자가 직접 고르게 한다:
--   기간   = cadence('weekly' | 'total')  ← 이미 있던 컬럼, 위저드가 안 물어봤을 뿐
--   기록   = input_mode('check' | 'number' | 'text')  ← 이번에 추가
--
--   check  : 체크하면 step만큼 오른다 (알고리즘 강의 주 3회 → 한 번에 1)
--   number : 체크할 때 숫자를 받는다 (오늘 몇 시간 공부, 몇 문제)
--   text   : 체크할 때 내용을 받는다 (지원한 회사명, 틀린 유형) — 개수는 1씩 오르고
--            적은 내용은 session_logs에 남아 목표 화면에서 팔로우업이 된다

alter table goalhub.key_results
  add column if not exists input_mode text not null default 'number'
    check (input_mode in ('check', 'number', 'text'));

-- check형이 한 번에 얼마나 오를지. 보통 1이지만 "한 번 = 30개 암기"도 가능하게 둔다.
alter table goalhub.key_results
  add column if not exists step numeric not null default 1;

-- 목표값을 비울 수 있게 한다. "책 100페이지(주간)"처럼 최종 목표 없이 주간만 두는 경우,
-- 그리고 text형에서 개수 상한이 의미 없는 경우가 있다.
alter table goalhub.key_results alter column target_value drop not null;

-- 루틴·할일이 어느 지표를 밀어 올리는지. 체크 한 번이 지표로 이어지는 연결선.
alter table goalhub.habits
  add column if not exists key_result_id uuid references goalhub.key_results(id) on delete set null;
alter table goalhub.daily_tasks
  add column if not exists key_result_id uuid references goalhub.key_results(id) on delete set null;

-- 루틴 체크에 값이 담기게 한다. 지금은 done(했다/안 했다)만 있어서
-- "오늘 3시간 공부했다"를 적을 자리가 없다.
alter table goalhub.habit_logs
  add column if not exists value numeric;
alter table goalhub.habit_logs
  add column if not exists note text;

create index if not exists idx_habits_kr on goalhub.habits(key_result_id) where key_result_id is not null;
create index if not exists idx_tasks_kr on goalhub.daily_tasks(key_result_id) where key_result_id is not null;

-- 기존 데이터 정리 --------------------------------------------------------
-- 이름에 '주간'이 들어간 지표는 매주 리셋이 의도였다. cadence를 맞추고 시작값을 0으로
-- 되돌린다(주간형은 start_value를 쓰지 않는다).
update goalhub.key_results
   set cadence = 'weekly', start_value = 0
 where title like '%주간%' and cadence <> 'weekly';

-- 횟수·개수 단위는 체크 한 번에 1씩 오르는 게 자연스럽다.
update goalhub.key_results
   set input_mode = 'check'
 where unit in ('회', '번', '개', '권', '곳');
