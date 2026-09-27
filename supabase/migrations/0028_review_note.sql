-- =============================================================
-- Aaina — Send-back-to-employee note on submissions
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- When an admin cross-checks a submission and finds it wrong, they can
-- send it back to the reviewing employee. The chosen review_tag (added in
-- 0027) plus this optional note explain what needs fixing. Sending back
-- moves the application status back to 'submitted' (the employee's
-- first-stage review queue).
-- =============================================================

alter table public.campaign_submissions
  add column if not exists review_note text;
