-- =============================================================
-- Bilkul — Campaign finance breakdown
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- The Create/Edit Campaign form's Finance section now captures a budget
-- breakdown: the overall brand budget (existing `budget` column) split
-- into a cashback budget, a commission budget, and a referral amount.
-- Used/Left are derived in the UI and not stored.
-- =============================================================

alter table public.campaigns
  add column if not exists cashback_budget   numeric,
  add column if not exists commission_budget numeric,
  add column if not exists referral_amount   numeric;
