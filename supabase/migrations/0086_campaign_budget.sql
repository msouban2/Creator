-- =============================================================
-- Bilkul — Per-campaign budget (set by staff at creation)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Campaigns can now carry an explicit budget the brand has allocated. The admin
-- Campaigns overview shows spend against it (order refunds / payouts + referral
-- bonuses) so budget, spend and "budget left" are all connected to real
-- payments. When left null, the UI falls back to the computed estimate
-- (slots x reward, plus cashback for reimbursement).
-- =============================================================

alter table public.campaigns
  add column if not exists budget numeric;
