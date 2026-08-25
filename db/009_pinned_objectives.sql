-- 009: 목표 D-day 핀 — 목표 상세의 📌로 홈 D-day 보드 등재를 켜고 끈다 (QA 6번).
-- default true: 기존 동작(기한 있는 활성 목표는 자동 등재)을 그대로 보존하고, 원치 않는 것만 내린다.
alter table goalhub.objectives add column if not exists pinned boolean not null default true;
