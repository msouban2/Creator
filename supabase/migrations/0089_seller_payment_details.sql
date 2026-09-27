-- 0089_seller_payment_details.sql
-- =============================================================
-- Richer brand (seller) payment records for the Payments page.
-- =============================================================
-- The admin Payments page shows a "Brand Payment Updates" table with the
-- payment mode, bank/UPI reference (UTR), the campaign the money is for, and a
-- received/in-progress/failed status. These columns extend seller_payments;
-- existing rows keep NULLs (rendered as "—") and default status 'received'.
--
-- Safe to run multiple times.
-- =============================================================

alter table public.seller_payments
  add column if not exists payment_mode text,
  add column if not exists reference text,
  add column if not exists campaign_code text,
  add column if not exists status text not null default 'received';

comment on column public.seller_payments.payment_mode is 'How the brand paid: Bank Transfer, UPI, Cash, Cheque, Other.';
comment on column public.seller_payments.reference is 'Bank/UPI transaction reference (UTR) for this brand payment.';
comment on column public.seller_payments.campaign_code is 'Campaign this payment is for (free-text code, e.g. CMP001).';
comment on column public.seller_payments.status is 'received | in_progress | failed.';
