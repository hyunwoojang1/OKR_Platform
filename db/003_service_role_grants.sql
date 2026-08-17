-- R4 수정: 신규 스키마는 service_role에 권한이 자동 부여되지 않는다.
-- service_role에만 부여, anon/authenticated는 계속 차단.
grant usage on schema goalhub to service_role;
grant all on all tables in schema goalhub to service_role;
grant all on all sequences in schema goalhub to service_role;
alter default privileges in schema goalhub grant all on tables to service_role;
alter default privileges in schema goalhub grant all on sequences to service_role;
