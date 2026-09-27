-- =============================================================
-- Aaina — Date a seller payment was received
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- created_at records when the row was entered; received_on records the
-- actual date the money was received from the seller (admin-editable).
-- Existing rows backfill received_on from created_at.
-- =============================================================

alter table public.seller_payments
  add column if not exists received_on date;

update public.seller_payments
  set received_on = created_at::date
  where received_on is null;
