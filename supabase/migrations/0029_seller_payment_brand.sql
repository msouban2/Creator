-- =============================================================
-- Aaina — Per-brand seller budgets
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- A seller can manage multiple brands. Money received from a seller is
-- now optionally attributed to a specific brand so the Sellers page can
-- show Received / Used / Remaining per brand. "Used" per brand is derived
-- from payout transactions on that seller's campaigns grouped by the
-- campaign's brand_name. Existing rows keep brand = NULL (shown as
-- "Unassigned").
-- =============================================================

alter table public.seller_payments
  add column if not exists brand text;
