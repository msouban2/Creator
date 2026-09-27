-- 0022_seller_payments.sql
-- Tracks money the platform/brand has received from a seller as a prepaid budget.
-- Admins record received payments; each seller's "used" budget is derived from the
-- cost of completed campaigns they own, and "remaining" = received - used.

create table if not exists public.seller_payments (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references public.profiles (id) on delete cascade,
  amount      numeric(12,2) not null,
  note        text,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_seller_payments_seller on public.seller_payments (seller_id);

alter table public.seller_payments enable row level security;

-- Admins: full control (record/adjust received payments).
drop policy if exists "seller_payments_admin" on public.seller_payments;
create policy "seller_payments_admin" on public.seller_payments
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Sellers: read their own received payments.
drop policy if exists "seller_payments_own" on public.seller_payments;
create policy "seller_payments_own" on public.seller_payments
  for select using (seller_id = auth.uid());
