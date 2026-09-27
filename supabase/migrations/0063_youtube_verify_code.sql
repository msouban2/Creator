-- =============================================================
-- Bilkul — YouTube ownership via description code (no OAuth)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- The creator proves they own a channel by pasting a one-time code into the
-- channel's About/description; the `youtube-verify` edge function reads the
-- channel description with our YouTube Data API key and confirms the code is
-- present. Stores the pending code + the target channel so the check verifies
-- the same channel the code was issued for.
-- youtube_channel_id / youtube_channel_title / youtube_verified / youtube_subscribers
-- already exist (migrations 0009 / 0051 / 0062).
-- =============================================================

alter table public.profiles
  add column if not exists youtube_verify_code       text,
  add column if not exists youtube_verify_channel_id text;
