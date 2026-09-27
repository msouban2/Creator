-- =============================================================
-- Aaina — Managed brands per seller
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- A seller can run multiple brands. This table stores the explicit list
-- of brands an admin adds for each seller (independent of campaigns), so
-- brands appear in the seller budget breakdown and can be picked when
-- recording a payment. Employees can still type a new brand ad-hoc.
-- =============================================================

create table if not exists public.seller_brands (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid not null references public.profiles (id) on delete cascade,
  brand      text not null,
  created_at timestamptz not null default now(),
  unique (seller_id, brand)
);

create index if not exists idx_seller_brands_seller on public.seller_brands (seller_id);

alter table public.seller_brands enable row level security;

-- Staff (admin/employee) can read the brand list.
drop policy if exists "seller_brands_read" on public.seller_brands;
create policy "seller_brands_read" on public.seller_brands
  for select using (public.is_staff(auth.uid()));

-- Admins manage (add/remove) brands.
drop policy if exists "seller_brands_write" on public.seller_brands;
create policy "seller_brands_write" on public.seller_brands
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
