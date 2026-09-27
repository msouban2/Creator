-- 0077_order_submitted_at.sql
-- =============================================================
-- Track when the creator submits their order screenshot so we can run a
-- 24-hour "approve the order" countdown for staff.
-- =============================================================
-- Flow:
--   1. Creator uploads the order screenshot  -> status 'ordered',
--      order_submitted_at = now(). A 24h approval clock starts.
--   2. Staff approve the order                -> status 'order_approved',
--      review_deadline is set and the creator's review clock starts.
--
-- Safe to run multiple times.
-- =============================================================

alter table public.applications
  add column if not exists order_submitted_at timestamptz;

comment on column public.applications.order_submitted_at is
  'When the creator submitted their order screenshot (status -> ordered). Drives the 24h staff order-approval countdown.';
