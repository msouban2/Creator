-- 0067_youtube_credentials.sql
-- Server-only storage for a creator's YouTube OAuth tokens, so the youtube-oauth
-- edge function can refresh channel stats later without asking them to sign in
-- again. Mirrors instagram_credentials. RLS on with NO policies: only the
-- service-role edge function reads/writes this table.

create table if not exists public.youtube_credentials (
  user_id                   uuid primary key references public.profiles(id) on delete cascade,
  youtube_access_token      text,
  youtube_refresh_token     text,
  youtube_token_expires_at  timestamptz,
  updated_at                timestamptz not null default now()
);

alter table public.youtube_credentials enable row level security;
