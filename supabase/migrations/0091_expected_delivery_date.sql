-- =============================================================
-- Bilkul — Expected delivery date on applications
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- The Campaign Detail → Shipper tab lets an admin record an *expected* delivery
-- date alongside the actual delivered date. Only the expected date needs a new
-- column; delivered_at / shipped_at already exist.
-- =============================================================

alter table public.applications
  add column if not exists expected_delivery_at timestamptz;
