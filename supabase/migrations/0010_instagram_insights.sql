-- 0010 Instagram Graph API insights
-- Extra metric columns shown on the creator "My Insights" screen. These are
-- filled by the "instagram-sync" Edge Function, which reads the token already
-- stored on the profile (by instagram-oauth) and calls the Instagram Graph API.
-- Followers + token live on profiles already (from the instagram-oauth flow);
-- here we only add the analytics metrics.

alter table public.profiles
  add column if not exists ig_reach integer,
  add column if not exists ig_impressions integer,
  add column if not exists ig_profile_views integer,
  add column if not exists ig_avg_likes integer,
  add column if not exists ig_avg_comments integer,
  add column if not exists ig_avg_views integer,
  add column if not exists ig_engagement_rate numeric(5,2),
  add column if not exists ig_insights_synced_at timestamptz;
