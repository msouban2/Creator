-- =============================================================
-- Bilkul — Review upload timer supports hours + minutes
-- =============================================================
-- Safe to run multiple times. Apply live via the Supabase SQL editor /
-- Management API.
--
-- The review-upload timer used to be whole hours only. To let staff set a mix of
-- hours and minutes (e.g. 2h30m), store it as a fractional number of hours
-- instead of an integer. Existing whole-hour values are preserved unchanged.
-- =============================================================

alter table public.campaigns
  alter column review_upload_hours type numeric using review_upload_hours::numeric;

comment on column public.campaigns.review_upload_hours is
  'How long the creator gets to upload their review screenshot after order approval, in hours (may be fractional, e.g. 2.5 = 2h30m). Overridden per-application by campaign_submissions/applications deadlines where set.';
