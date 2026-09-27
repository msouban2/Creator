-- =============================================================
-- Aaina — Purchase flow: product link + proof of purchase
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- After a creator is SELECTED, they buy the product via the
-- campaign's product_url, then upload a purchase order (proof),
-- which moves the application to 'product_received'.
-- =============================================================

-- ---------- 1. product link on campaigns ----------
alter table public.campaigns
  add column if not exists product_url text;

-- ---------- 2. proof-of-purchase fields on applications ----------
alter table public.applications
  add column if not exists purchase_proof text,
  add column if not exists purchase_amount numeric,
  add column if not exists product_received_at timestamptz;

-- ---------- 3. storage: purchase-orders bucket ----------
insert into storage.buckets (id, name, public)
values ('purchase-orders', 'purchase-orders', false)
on conflict (id) do nothing;

drop policy if exists "purchase_orders_owner_write" on storage.objects;
create policy "purchase_orders_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'purchase-orders'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "purchase_orders_read" on storage.objects;
create policy "purchase_orders_read" on storage.objects
  for select using (
    bucket_id = 'purchase-orders'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_staff(auth.uid()))
  );

-- ---------- 4. let creators update their own application ----------
-- Needed so a selected creator can attach the purchase proof and
-- move themselves to 'product_received'. Staff update policy stays.
drop policy if exists "applications_update_own" on public.applications;
create policy "applications_update_own" on public.applications
  for update using (creator_id = auth.uid())
  with check (creator_id = auth.uid());
