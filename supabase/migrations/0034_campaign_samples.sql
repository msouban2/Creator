-- =============================================================
-- Aaina — Sample content on campaigns (screenshots + video)
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- Admins attach reference/sample content when creating a campaign so
-- creators know what to make. sample_video_url already exists; this adds
-- sample_screenshots (public campaign-images URLs). Sample content is now
-- shown for every campaign type in the app, not just paid.
-- =============================================================

alter table public.campaigns
  add column if not exists sample_screenshots text[] default '{}';
