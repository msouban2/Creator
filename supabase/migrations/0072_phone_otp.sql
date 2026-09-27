-- 0072_phone_otp.sql
-- =============================================================
-- Self-managed phone OTP codes (delivered via the FinPayUltra SMS API).
-- =============================================================
-- Our `finpay-otp` edge function generates a 6-digit code, stores only its
-- hash here, texts the plain code through FinPayUltra, then checks the hash on
-- verify. One in-flight code per user; short expiry + attempt/resend limits.
--
-- Only the service role (the edge function) touches this table — RLS is on with
-- no policies, so clients can't read or write codes.
--
-- Safe to run multiple times.
-- =============================================================

create table if not exists public.phone_otps (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  phone        text not null,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table public.phone_otps enable row level security;
-- (Intentionally no policies: reads/writes happen only via the service role.)
