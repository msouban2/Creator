-- =============================================================
-- Aaina — Delivered photo (proof of receipt uploaded by creator)
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- After the seller ships (paid/barter) or the creator buys the
-- product (reimbursement), the creator uploads a photo of the
-- delivered product. Staff review this photo before confirming
-- delivery (paid/barter). Photos live in the existing private
-- 'purchase-orders' bucket (creator-owner write, staff read).
-- =============================================================

alter table public.applications
  add column if not exists delivery_photo_url text,
  add column if not exists delivery_photo_at timestamptz;
