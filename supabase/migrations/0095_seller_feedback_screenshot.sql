-- Creators now upload a screenshot of the feedback they left for the seller
-- instead of a screen recording. Stored in the submission-screenshots bucket.
-- seller_feedback_video is kept so existing recordings stay viewable.

alter table if exists public.campaign_submissions
  add column if not exists seller_feedback_screenshot text;

comment on column public.campaign_submissions.seller_feedback_screenshot is
  'Path in submission-screenshots of the creator''s seller feedback screenshot.';
