-- =============================================================
-- Bilkul — Server-side Aadhaar OTP session (FinPayUltra)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- The Aadhaar flow is two calls: step 1 sends an OTP and returns a request id,
-- step 2 validates the OTP using that request id (and the same order id). We now
-- store the order id + request id server-side per creator so the phone never has
-- to round-trip them — this removes client-side staleness/mismatch on resend and
-- guarantees step 2 uses the exact order id from step 1.
-- =============================================================

alter table public.kyc
  add column if not exists aadhaar_otp_order_id text,
  add column if not exists aadhaar_otp_req_id   text,
  add column if not exists aadhaar_otp_at        timestamptz;
