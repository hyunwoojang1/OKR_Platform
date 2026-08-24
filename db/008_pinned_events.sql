-- 007: D-day 보드 핀 — 달력 일정에 📌를 찍으면 홈 D-day 보드에 카운트다운으로 올라간다 (홈 그릴 Q2 확정)
alter table goalhub.calendar_events add column if not exists pinned boolean not null default false;
create index if not exists idx_cal_pinned on goalhub.calendar_events (pinned) where pinned;
