-- =============================================================
-- Bilkul — YouTube channel analytics on profiles
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Beyond subscriber count, store the public channel analytics we can read from
-- the YouTube Data API (total views, video count, and recent-video averages)
-- so the creator's Insights screen shows real analytics, not just subscribers.
-- =============================================================

alter table public.profiles
  add column if not exists youtube_views            bigint,
  add column if not exists youtube_video_count      integer,
  add column if not exists youtube_avg_views        bigint,
  add column if not exists youtube_avg_likes        bigint,
  add column if not exists youtube_engagement_rate  numeric,
  add column if not exists yt_insights_synced_at    timestamptz;
