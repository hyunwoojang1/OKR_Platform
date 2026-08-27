-- 013: 기록이 어디서 왔는지를 새기고, 지표를 지워도 기록은 남게 한다.
--
-- 2026-08-27 감사에서 실제 브라우저로 5회씩 재현해 확인한 것들의 DB 쪽 해결이다.
--
-- ① 지표를 하나 지우면 거기 손으로 적은 기록이 통째로 사라졌다. 5/5 재현.
--    목표 편집에서 중복 지표를 정리하는 아주 평범한 동작인데, 확인창도 휴지통도 없이
--    "지원한 회사명" 같은 몇 주치 메모가 없어진다.
--    actions.ts 의 주석은 "session_logs(러닝 기록 등)는 활동 기록이라 그대로 남긴다"고
--    말하고 있었다 — 코드의 의도와 스키마가 정반대였다.
--    010 은 habits·daily_tasks 를, 012 는 calendar_events 를 전부 set null 로 걸었는데
--    011 만 cascade 였다. 의도가 아니라 사고다.
--
-- ② 마감 완료를 되돌려도 지표가 안 내려갔다. 5/5 재현 (완료↔해제 3회 → 지표 4).
--    되돌리기가 기록을 task_id 로 찾는데, 지표를 올릴 때 남기는 기록에는 task_id 가
--    안 붙어서 애초에 안 걸렸다. 일정 → 기록의 직접 선이 필요하다.
--
-- ③ 완료 버튼을 연달아 두 번 누르면 할일도 기록도 두 개가 됐다. 5/5 재현.
--    지표는 +1 만 올라서(읽고-더하고-쓰기 경쟁) "기록은 2건인데 숫자는 1" 이 된다.
--    코드의 if (!exists) 로는 동시에 들어온 두 요청을 못 막는다. toggleHabitLog 만
--    멱등이었던 이유가 unique(habit_id,date) 였다 — 경쟁을 이기는 자리는 DB뿐이다.
--
-- 적용 전 확인 완료(2026-08-27): 아래 CHECK 를 위반하는 행 0건, 중복 (source_ref,date) 0건.

-- ── ① 지표를 지워도 기록은 남는다 ──
-- 다른 모든 key_results 참조와 같게 맞춘다.
alter table goalhub.session_logs drop constraint if exists session_logs_key_result_id_fkey;
alter table goalhub.session_logs
  add constraint session_logs_key_result_id_fkey
  foreign key (key_result_id) references goalhub.key_results(id) on delete set null;

-- ── ② 기록에 출처를 새긴다 ──
-- 왜 task_id 재사용이 아닌가: deleteTask 가 task_id 로 기록을 먼저 지워버려 되돌릴 근거가
-- 사라지고, 완료가 중복 방지 분기를 타면 그날 만든 할일이 아예 없을 수도 있다.
alter table goalhub.session_logs
  add column if not exists event_id uuid references goalhub.calendar_events(id) on delete set null;
create index if not exists idx_logs_event on goalhub.session_logs(event_id) where event_id is not null;

-- 주간 계획 체크도 같은 문제가 있었다 — 체크가 기록을 남기는데 해제가 안 지운다.
-- 지울 열쇠가 없어서였다.
alter table goalhub.session_logs
  add column if not exists initiative_id uuid references goalhub.initiatives(id) on delete set null;
create index if not exists idx_logs_initiative on goalhub.session_logs(initiative_id) where initiative_id is not null;

-- ── ③ 지표 증감을 한 번의 연산으로 ──
-- 읽고-더하고-쓰기를 하면 동시에 들어온 두 요청이 같은 값을 읽고 같은 값을 쓴다.
-- 0 하한과 소수 2자리 반올림은 기존 TS 코드(logKrProgress, undoKrProgress)와 같게 맞췄다.
create or replace function goalhub.kr_add(p_id uuid, p_delta numeric)
returns numeric language sql volatile as $$
  update goalhub.key_results
     set current_value = round(greatest(0, current_value + p_delta), 2)
   where id = p_id
  returning current_value;
$$;
grant execute on function goalhub.kr_add(uuid, numeric) to service_role;

-- 같은 일정으로 같은 날 할일이 두 개 생기지 않게. 코드가 아니라 여기서 막는다.
create unique index if not exists uq_task_from_event
  on goalhub.daily_tasks(source_ref, date)
  where source = 'job_posting' and source_ref is not null;

-- ── 012 에서 빠뜨린 것 ──
-- 001 이후 추가된 테이블은 전부 자기 마이그레이션에서 RLS 를 켠다. seasons 만 빠졌다.
-- 지금은 service_role 로만 접근하므로 노출되진 않지만, 나중에 다른 클라이언트에
-- 권한을 열어주는 날 이 테이블만 무방비가 된다. 그날까지 조용하다는 점이 위험하다.
alter table goalhub.seasons enable row level security;
revoke all on goalhub.seasons from anon, authenticated;

-- ── 말이 안 되는 값을 애초에 못 넣게 ──
-- 지금까지는 앱 코드만 막고 있었다. 크론·수동 SQL·나중에 생길 스크립트는 그 밖에 있다.
alter table goalhub.key_results drop constraint if exists kr_current_value_nonneg;
alter table goalhub.key_results add constraint kr_current_value_nonneg check (current_value >= 0);
alter table goalhub.key_results drop constraint if exists kr_target_value_positive;
alter table goalhub.key_results add constraint kr_target_value_positive check (target_value is null or target_value > 0);
alter table goalhub.key_results drop constraint if exists kr_step_positive;
alter table goalhub.key_results add constraint kr_step_positive check (step > 0);

-- done 과 done_at 이 서로 다른 말을 하지 않게.
alter table goalhub.daily_tasks drop constraint if exists daily_tasks_done_consistency;
alter table goalhub.daily_tasks add constraint daily_tasks_done_consistency
  check ((done = false and done_at is null) or (done = true and done_at is not null));

-- ── 인덱스 정리 ──
-- 012 의 idx_cal_deadline 은 where is_deadline is not false 조건부인데, 정작 조회는
-- 그 조건 없이 하고 걸러내기는 코드에서 한다. 플래너가 못 쓰고 쓰기 비용만 늘었다.
-- 같은 범위는 001 의 idx_calendar_starts 가 이미 커버한다.
drop index if exists goalhub.idx_cal_deadline;

-- key_results.objective_id 는 스키마에서 유일하게 인덱스 없는 부모 조회 컬럼인데
-- 목표를 편집할 때마다 쓰인다.
create index if not exists idx_kr_objective on goalhub.key_results(objective_id);

-- 콘솔에서 손으로 돌리면 PostgREST 가 새 컬럼·함수를 바로 못 볼 수 있다.
notify pgrst, 'reload schema';

-- ── 적용 확인용 (실행해서 세 줄 다 참이어야 한다) ──
-- select confdeltype from pg_constraint where conname='session_logs_key_result_id_fkey';  -- 'n' (set null)
-- select count(*) from information_schema.columns
--   where table_schema='goalhub' and table_name='session_logs' and column_name in ('event_id','initiative_id');  -- 2
-- select goalhub.kr_add(null::uuid, 0);  -- 에러 없이 null
