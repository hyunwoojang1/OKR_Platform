-- 007: 지표 의미 체계 — "단순히 쌓이는 것"에서 탈피
--   start_value: 시작값. target보다 크면 줄이기형(체중 75→70, 페이스 7→6분).
--                진행률 = (현재-시작)/(목표-시작) — 방향을 따로 고를 필요 없이 자동.
--   cadence:     total = 기간 전체 누적/도달(기존 동작), weekly = 매주 반복(현재값 = 이번 주 실적).
-- 기존 행은 start 0 + total 이라 동작 변화 없음.
alter table goalhub.key_results
  add column if not exists start_value numeric not null default 0,
  add column if not exists cadence text not null default 'total';

do $$ begin
  alter table goalhub.key_results
    add constraint key_results_cadence_check check (cadence in ('total','weekly'));
exception when duplicate_object then null; end $$;

comment on column goalhub.key_results.start_value is '시작값 — target보다 크면 줄이기형. 진행률=(현재-시작)/(목표-시작)';
comment on column goalhub.key_results.cadence is 'total=기간 누적/도달, weekly=매주 반복(current_value=이번 주 실적)';
