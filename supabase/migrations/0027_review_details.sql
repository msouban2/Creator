-- =============================================================
-- Aaina — Review details: seller-feedback recording, order amount,
-- and reviewer status tag on submissions.
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
--   seller_feedback_video : creator's recording giving feedback about
--                           the product/seller (in submission-videos bucket).
--   order_amount          : order value the creator reports at submission.
--   review_tag            : reviewer label — 'correct' | 'blocked' |
--                           'wrong_seller_feedback' (informational only,
--                           does not change payout / resubmission).
-- =============================================================

alter table public.campaign_submissions
  add column if not exists seller_feedback_video text,
  add column if not exists order_amount numeric,
  add column if not exists review_tag text;

comment on column public.campaign_submissions.review_tag is
  'Reviewer label: correct | blocked | wrong_seller_feedback (informational).';
