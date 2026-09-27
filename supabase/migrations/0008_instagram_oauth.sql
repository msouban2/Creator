-- =============================================================
-- Aaina — Instagram OAuth (official follower fetch)
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
--
-- Lets a creator connect their Instagram Business/Creator account
-- with "Instagram API with Instagram Login". The `instagram-oauth`
-- edge function exchanges the OAuth code for a long-lived token on
-- the server (the app secret never touches the phone), reads the
-- real `followers_count`, and writes it back to the profile.
-- =============================================================

-- ---------- 1. connection fields on profiles ----------
alter table public.profiles
  add column if not exists instagram_user_id text,
  add column if not exists instagram_token text,
  add column if not exists instagram_token_expires_at timestamptz,
  add column if not exists instagram_connected_at timestamptz;

-- ---------- 2. short-lived OAuth state (CSRF + who-started-it) ----------
-- Rows here are created by the edge function (service role) when a
-- creator taps "Connect Instagram", and deleted right after the
-- callback completes. Only the service role touches this table.
create table if not exists public.instagram_oauth_states (
  state        text primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  app_redirect text not null,
  created_at   timestamptz not null default now()
);

-- RLS on, with NO policies: the anon/authenticated clients can never
-- read or write it. The edge function uses the service-role key, which
-- bypasses RLS.
alter table public.instagram_oauth_states enable row level security;
