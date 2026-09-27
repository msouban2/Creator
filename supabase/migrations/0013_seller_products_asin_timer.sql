-- 0013_seller_products_asin_timer.sql
-- 1) Campaigns get an expected ASIN + a configurable review-upload timer.
-- 2) Sellers submit product details from the seller dashboard; staff turn an
--    approved product into a campaign.

-- ---------- campaigns: ASIN + review upload window ----------
alter table public.campaigns
  add column if not exists asin text,
  add column if not exists review_upload_hours integer;

comment on column public.campaigns.asin is
  'Expected product ASIN. Staff compare the creator''s purchase screenshot against this.';
comment on column public.campaigns.review_upload_hours is
  'Hours the creator gets to upload the review screenshot after the product is received.';

-- ---------- seller_products: product catalogue submitted by sellers ----------
create table if not exists public.seller_products (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references public.profiles(id) on delete cascade,
  brand_name   text not null,
  product_name text not null,
  asin         text,
  product_url  text,
  price        numeric,
  image_url    text,
  description  text,
  notes        text,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected', 'used')),
  created_at   timestamptz not null default now()
);

create index if not exists idx_seller_products_seller on public.seller_products (seller_id);
create index if not exists idx_seller_products_status on public.seller_products (status);

alter table public.seller_products enable row level security;

-- Sellers manage their own products; staff can see/act on all.
drop policy if exists seller_products_select on public.seller_products;
create policy seller_products_select on public.seller_products
  for select using (seller_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists seller_products_insert on public.seller_products;
create policy seller_products_insert on public.seller_products
  for insert with check (seller_id = auth.uid());

drop policy if exists seller_products_update on public.seller_products;
create policy seller_products_update on public.seller_products
  for update using (seller_id = auth.uid() or public.is_staff(auth.uid()))
  with check (seller_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists seller_products_delete on public.seller_products;
create policy seller_products_delete on public.seller_products
  for delete using (seller_id = auth.uid() or public.is_admin(auth.uid()));

-- ---------- storage: images sellers upload for their products ----------
insert into storage.buckets (id, name, public)
values ('seller-products', 'seller-products', true)
on conflict (id) do nothing;

drop policy if exists "seller_products_public_read" on storage.objects;
create policy "seller_products_public_read" on storage.objects
  for select using (bucket_id = 'seller-products');

drop policy if exists "seller_products_owner_write" on storage.objects;
create policy "seller_products_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'seller-products' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "seller_products_owner_update" on storage.objects;
create policy "seller_products_owner_update" on storage.objects
  for update using (
    bucket_id = 'seller-products' and auth.uid()::text = (storage.foldername(name))[1]
  );
