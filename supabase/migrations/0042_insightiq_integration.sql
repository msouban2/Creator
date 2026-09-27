-- =============================================================
-- Aaina/Bilkul — InsightIQ (Phyllo) integration storage
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Stores the mapping between a Bilkul creator and their InsightIQ
-- user/account IDs so the sync + webhook functions can resolve which
-- profile to update. These IDs are not secrets, but there is no reason
-- for clients to read them, so the table is service-role-only (RLS on,
-- no policies, no anon/authenticated grants) — same pattern as
-- instagram_credentials.
--
-- Real insight values are written into the existing profiles.ig_*
-- columns (already present). We add one JSONB column for audience
-- demographics, which had no home before.
-- =============================================================

create table if not exists public.insightiq_accounts (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  iq_user_id     text,               -- InsightIQ user id (POST /v1/users)
  iq_account_id  text,               -- InsightIQ connected account id
  work_platform  text,               -- e.g. Instagram platform id
  status         text,               -- CONNECTED / SESSION_EXPIRED / etc.
  updated_at     timestamptz not null default now()
);

alter table public.insightiq_accounts enable row level security;
revoke all on public.insightiq_accounts from anon, authenticated;

-- Audience demographics (top countries, age bands, gender split, quality).
alter table public.profiles
  add column if not exists ig_audience jsonb;
