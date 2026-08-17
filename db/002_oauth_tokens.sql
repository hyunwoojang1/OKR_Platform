-- R3: Google refresh_token 보관 (캘린더 동기화용). goalhub 한정.
create table if not exists goalhub.oauth_tokens (
  provider text primary key,
  email text not null,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);
alter table goalhub.oauth_tokens enable row level security;
revoke all on goalhub.oauth_tokens from anon, authenticated;
