-- 015 지표에 "이번 주 몫"을 따로 적는다

-- 지금까지 지표는 주간형이거나 최종형이거나 둘 중 하나였다. 그래서 "코테 100문제"를
-- 최종으로 잡으면 이번 주에 몇 개를 풀어야 하는지가 어디에도 없고, 주간으로 잡으면
-- 100이라는 최종 목표가 화면에서 사라졌다. 실제로 사용자가 "SQL 100문제"를 최종으로
-- 만들어놓고 "주간 20문제로 했어야 했는데 까먹었다"고 말한 그 상황이다.
--
-- 둘은 서로 다른 질문이다.
--   최종 목표  = 이 목표가 끝났다고 말할 수 있는 선   (100문제)
--   이번 주 몫 = 오늘 뭘 해야 하는지를 정하는 선       (20문제)
-- 그래서 칸을 나눈다. 오늘 할일과 루틴 박스는 '이번 주 몫'을 보고 움직이고,
-- 목표 화면은 최종 목표로 진척을 말한다.
--
-- 주간형(cadence='weekly') 지표는 target_value 자체가 이미 이번 주 몫이라
-- 이 칸을 쓰지 않는다. null 로 둔다. 코드가 그렇게 읽는다:
--   이번 주 몫 = (cadence='weekly') ? target_value : weekly_target

alter table goalhub.key_results
  add column if not exists weekly_target numeric;

-- 0이나 음수는 "이번 주에 0개 하기"가 되어 뜻이 없다. 안 정했으면 null 이어야 한다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'kr_weekly_target_positive'
      and conrelid = 'goalhub.key_results'::regclass
  ) then
    alter table goalhub.key_results
      add constraint kr_weekly_target_positive
      check (weekly_target is null or weekly_target > 0);
  end if;
end $$;

comment on column goalhub.key_results.weekly_target is
  '이번 주에 해야 할 몫. 최종형(cadence=total) 지표에서만 쓴다 — 주간형은 target_value 가 곧 주간 몫이다. null 이면 오늘 할일에 안 뜬다.';

-- PostgREST 가 새 칸을 바로 보게 한다 (콘솔 실행이라 캐시가 남는다)
notify pgrst, 'reload schema';

-- 검증
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='goalhub' and table_name='key_results' and column_name='weekly_target';
--   -- 기대: weekly_target | numeric | YES
