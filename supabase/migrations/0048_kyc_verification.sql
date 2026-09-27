-- =============================================================
-- Bilkul — KYC verification results (FinPayUltra)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Stores the outcome of the real-time verification calls made by the
-- `verify-kyc` edge function against FinPayUltra:
--   • PAN     — single-step lookup (registered name + PAN type)
--   • Aadhaar — 2-step OTP flow (name on Aadhaar)
--   • Bank    — penny-less account validation (name at bank)
-- The API key stays server-side; only the sanitized name/flags land here.
-- =============================================================

-- ---------- kyc: PAN + Aadhaar verification ----------
alter table public.kyc
  add column if not exists pan_verified       boolean not null default false,
  add column if not exists pan_name           text,
  add column if not exists pan_type           text,
  add column if not exists pan_verified_at    timestamptz,
  add column if not exists aadhaar_verified    boolean not null default false,
  add column if not exists aadhaar_name        text,
  add column if not exists aadhaar_verified_at timestamptz;

-- ---------- bank_accounts: penny-less verification ----------
alter table public.bank_accounts
  add column if not exists verified      boolean not null default false,
  add column if not exists verified_name text,
  add column if not exists branch        text,
  add column if not exists verified_at   timestamptz;
