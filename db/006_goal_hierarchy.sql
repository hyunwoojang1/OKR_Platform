-- 006: 목표 계열화 — 소목표가 대목표에 매달리고, 달성이 위로 흐른다 (홈 그릴 2026-08-24 확정)
-- parent_id: 소목표 → 대목표 연결. 대목표 삭제 시 소목표는 독립 목표로 남는다(set null).
alter table goalhub.objectives add column if not exists parent_id uuid references goalhub.objectives(id) on delete set null;
create index if not exists idx_obj_parent on goalhub.objectives (parent_id);

-- KR 측정 방식에 '소목표 집계형' 추가: 대목표의 "소목표 달성 n/m" 지표가 자동으로 채워진다
alter table goalhub.key_results drop constraint if exists key_results_source_check;
alter table goalhub.key_results add constraint key_results_source_check
  check (source in ('manual', 'habit_agg', 'api', 'log_agg', 'goal_agg'));
