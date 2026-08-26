-- 011: 지표를 오늘 할일에 올린다 — "체크 = 기록 = 지표"를 잇는 마지막 조각.
--
-- 지금까지 지표는 목표 화면 안에만 있었다. 그래서 숫자를 올리려면 목표 탭 → 목표 →
-- 지표 옆 작은 칸까지 들어가야 했고, 아무도 안 들어가서 진척률이 0%에 멈춰 있었다.
-- 이제 지표가 오늘 할일에 직접 뜨고, 거기서 체크하면 input_mode대로 입력을 받아
-- 그 자리에서 지표가 오른다.
--
-- show_daily: 매일 오늘 할일에 띄울지. 전부 띄우면 몸무게처럼 주 1회 재는 것까지
--   매일 걸리적거리므로 켜고 끌 수 있게 둔다.
alter table goalhub.key_results
  add column if not exists show_daily boolean not null default true;

-- 줄이기형(시작값이 목표보다 큰 것 — 몸무게 89→85, 페이스 7→6)은 매일 체크하는 일이
-- 아니라 가끔 재서 적는 값이다. 기본값에서 내려둔다.
update goalhub.key_results
   set show_daily = false
 where start_value > target_value and target_value is not null;

create index if not exists idx_kr_daily on goalhub.key_results(show_daily) where show_daily;

-- 지표 체크가 남긴 기록을 지표별로 되짚을 수 있게 한다.
-- (내용형에서 "언제 어디 지원했는지" 목록을 뽑는 근거)
alter table goalhub.session_logs
  add column if not exists key_result_id uuid references goalhub.key_results(id) on delete cascade;
create index if not exists idx_logs_kr on goalhub.session_logs(key_result_id) where key_result_id is not null;
