-- R10 긴급수정: getAreas() seed-on-read 재귀가 기본영역 6종을 1,973회 중복 삽입(11,838행).
-- ① FK 참조를 대표행(이름별 최초 생성)으로 재지정 ② 중복 삭제 ③ unique(name)으로 재발 봉쇄.
with keepers as (
  select distinct on (name) id, name from goalhub.areas order by name, created_at asc
)
update goalhub.objectives o set area_id = k.id
from goalhub.areas a join keepers k on k.name = a.name
where o.area_id = a.id and a.id <> k.id;

with keepers as (
  select distinct on (name) id, name from goalhub.areas order by name, created_at asc
)
update goalhub.initiatives t set area_id = k.id
from goalhub.areas a join keepers k on k.name = a.name
where t.area_id = a.id and a.id <> k.id;

with keepers as (
  select distinct on (name) id, name from goalhub.areas order by name, created_at asc
)
update goalhub.daily_tasks t set area_id = k.id
from goalhub.areas a join keepers k on k.name = a.name
where t.area_id = a.id and a.id <> k.id;

with keepers as (
  select distinct on (name) id, name from goalhub.areas order by name, created_at asc
)
update goalhub.habits t set area_id = k.id
from goalhub.areas a join keepers k on k.name = a.name
where t.area_id = a.id and a.id <> k.id;

with keepers as (
  select distinct on (name) id from goalhub.areas order by name, created_at asc
)
delete from goalhub.areas where id not in (select id from keepers);

alter table goalhub.areas add constraint areas_name_unique unique (name);
