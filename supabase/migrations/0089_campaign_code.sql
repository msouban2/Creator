-- =============================================================
-- Bilkul — Campaign code (human-friendly reference)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Barter/paid campaigns are referenced by a short code (e.g. BR2025-014). Store
-- an optional code staff can set; the admin UI falls back to an auto-generated
-- one when it's left blank.
-- =============================================================

alter table public.campaigns
  add column if not exists campaign_code text;
