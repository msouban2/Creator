-- 0021_delivery_tracking.sql
-- Records when a barter/paid product was delivered to the creator. Staff mark
-- delivery (the seller only marks shipped); the creator's content-upload window
-- starts from delivered_at.

alter table public.applications
  add column if not exists delivered_at timestamptz;

comment on column public.applications.delivered_at is
  'When the shipped product was confirmed delivered (staff-set). Content-upload timer starts here.';
