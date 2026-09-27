-- =============================================================
-- Bilkul — YouTube OAuth (verified channel ownership)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Lets a creator prove they OWN a YouTube channel by signing in with Google.
-- The `youtube-oauth` edge function exchanges the OAuth code on the server
-- (the client secret never touches the phone), reads THEIR OWN channel via
-- channels?mine=true (impossible to fake), and writes the verified channel id,
-- title and subscriber count back to the profile.
-- =============================================================

-- ---------- 1. connection fields on profiles ----------
-- youtube_channel + youtube_subscribers already exist (migration 0009-era).
alter table public.profiles
  add column if not exists youtube_channel_id text,
  add column if not exists youtube_channel_title text,
  add column if not exists youtube_verified boolean not null default false,
  add column if not exists youtube_connected_at timestamptz;

-- ---------- 2. short-lived OAuth state (CSRF + who-started-it) ----------
create table if not exists public.youtube_oauth_states (
  state        text primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  app_redirect text not null,
  created_at   timestamptz not null default now()
);

-- RLS on, with NO policies: only the service-role edge function touches it.
alter table public.youtube_oauth_states enable row level security;
