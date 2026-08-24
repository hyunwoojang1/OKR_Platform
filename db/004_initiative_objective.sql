-- 004 (v4 개편): 주간 이니셔티브를 목표에 직접 연결.
-- 월 마일스톤 층 폐기(REDESIGN_PLAN Q12-1)로 milestone 경유 연결이 사라짐 — objective_id 직결.
alter table goalhub.initiatives add column if not exists objective_id uuid references goalhub.objectives(id) on delete cascade;
create index if not exists idx_ini_obj on goalhub.initiatives (objective_id);
