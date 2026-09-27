-- 0069_review_deadline.sql
-- =============================================================
-- Per-application review-upload deadline set by the employee.
-- =============================================================
-- When an employee approves the creator's order screenshot they now choose
-- how long the creator gets to upload their review. That explicit deadline is
-- stored on the application and drives the creator's countdown, overriding the
-- campaign-level `review_upload_hours` fallback.
--
-- Only staff can move an application into `order_approved`, so only staff ever
-- set this column (the update guard bypasses staff entirely).
--
-- Safe to run multiple times.
-- =============================================================

alter table public.applications
  add column if not exists review_deadline timestamptz;

comment on column public.applications.review_deadline is
  'Absolute deadline for the creator to upload their review screenshot. Set by the employee at order approval; overrides campaigns.review_upload_hours.';
