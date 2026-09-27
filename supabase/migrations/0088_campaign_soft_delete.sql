-- =============================================================
-- Bilkul — Soft-delete for campaigns
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Deleting a campaign shouldn't destroy its applications, payouts or referral
-- history, so we soft-delete: set deleted_at. Deleted campaigns are hidden from
-- creators and from the default admin lists, but stay recoverable (Restore) and
-- keep all their financial records intact.
-- =============================================================

alter table public.campaigns
  add column if not exists deleted_at timestamptz;

create index if not exists idx_campaigns_deleted_at
  on public.campaigns (deleted_at);
