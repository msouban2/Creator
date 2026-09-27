-- 0071_phone_verified.sql
-- =============================================================
-- Phone (SMS) OTP verification flag on profiles.
-- =============================================================
-- A creator must verify their mobile number via SMS OTP (sent through the
-- FinPayUltra SMS API by the `finpay-otp` edge function) right after email
-- verification at signup. The edge function sets this flag with the service
-- role once the OTP checks out; creators never set it themselves.
--
-- Existing accounts predate this feature, so they're backfilled to verified to
-- avoid locking anyone out of the app.
--
-- Safe to run multiple times.
-- =============================================================

alter table public.profiles
  add column if not exists phone_verified boolean not null default false;

comment on column public.profiles.phone_verified is
  'True once the creator confirmed their mobile number via SMS OTP. Set only by the msg91-otp edge function.';

-- One-time backfill: treat everyone who already exists as verified.
update public.profiles set phone_verified = true where phone_verified = false;
