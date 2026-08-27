-- 014: 지표에 "쌓이는 것"과 "재서 갱신하는 것"을 가른다.
--
-- 지금까지 지표는 기록할 때마다 무조건 더해졌다. 그런데 성격이 다른 둘이 섞여 있다:
--
--   쌓이는 것   주간 러닝 거리 8.85km → 5km 더 뛰면 13.85km   (더하는 게 맞다)
--   재는 것     NCS 모의고사 평균 68점 → 다음에 72점          (72로 바뀌어야 한다)
--
-- 지금은 후자도 더해져서, 68 적고 72 적으면 140이 된다 — 목표 75점을 이미 넘긴 것처럼 보인다.
-- '최장 거리'도 같다. 최장 5km 뛰고 7km 뛰면 최장은 7km 이지 12km 가 아니다.
--
-- input_mode(무엇을 입력받나: 체크·숫자·내용)와는 다른 축이다.
-- 숫자를 받는 건 같은데 그 숫자를 더하느냐 갈아끼우느냐가 다르다.

alter table goalhub.key_results
  add column if not exists accrual text not null default 'sum';

alter table goalhub.key_results drop constraint if exists kr_accrual_valid;
alter table goalhub.key_results
  add constraint kr_accrual_valid check (accrual in ('sum', 'set'));

comment on column goalhub.key_results.accrual is
  'sum=기록할 때마다 더한다(누적) / set=적은 값으로 갈아끼운다(측정값). 기본은 sum.';

-- ── 지금 있는 지표 정리 (2026-08-27, 사용자 확인) ──
-- 재서 갱신하는 값들
update goalhub.key_results set accrual = 'set'
 where title in ('NCS 모의고사 평균', '최장 거리', '5km 페이스', '몸무게');

-- '자기소개서 제출'은 체크형이 아니라 내용을 적는 지표다.
-- 어디에 냈는지가 남아야 나중에 "올 하반기에 몇 군데 넣었지"에 답할 수 있다.
-- 체크형이라 눌러도 입력칸이 안 열려서, 톡 누르면 그냥 1이 오르기만 했다.
update goalhub.key_results set input_mode = 'text'
 where title = '자기소개서 제출';

notify pgrst, 'reload schema';

-- ── 적용 확인 ──
-- select title, input_mode, accrual, cadence from goalhub.key_results order by title;
--   자기소개서 제출   text   sum   total
--   NCS 모의고사 평균 number set   total
--   최장 거리        number set   total
--   5km 페이스       number set   total
--   몸무게          number set   total
--   주간 러닝 거리    number sum   weekly
--   러닝            check  sum   weekly
