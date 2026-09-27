-- =============================================================
-- Bilkul — Timestamp when a submission is reviewed
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Adds reviewed_at so the employee "My Work" view can show how many items a
-- person reviewed today / this week (reviewed_by already records who).
-- =============================================================

alter table public.campaign_submissions
  add column if not exists reviewed_at timestamptz;
