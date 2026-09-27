-- =============================================================
-- Aaina — Amazon profile link on creator profiles
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- Creators can add their Amazon profile / storefront link so staff and
-- sellers can view their Amazon presence.
-- =============================================================

alter table public.profiles
  add column if not exists amazon_profile_url text;
