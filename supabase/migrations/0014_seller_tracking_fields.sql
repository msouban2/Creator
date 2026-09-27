-- 0014_seller_tracking_fields.sql
-- Extra per-application tracking fields that staff fill in and sellers can see,
-- plus read access so sellers can view applications & shipping addresses for
-- creators in their own campaigns.

-- ---------- new application fields ----------
alter table public.applications
  add column if not exists order_id text,
  add column if not exists order_date date,
  add column if not exists seller_feedback text,
  add column if not exists seller_commission numeric,
  add column if not exists reel_engagement integer;

comment on column public.applications.order_id is 'Marketplace order id for a reimbursement purchase.';
comment on column public.applications.order_date is 'Date the creator placed the reimbursement order.';
comment on column public.applications.seller_feedback is 'Feedback staff record about this order (shown to seller).';
comment on column public.applications.seller_commission is 'Commission recorded for this order (shown to seller).';
comment on column public.applications.reel_engagement is 'Engagement count on the posted reel (barter/paid).';

-- ---------- sellers & staff can read applications for their campaigns ----------
drop policy if exists "applications_select_seller" on public.applications;
create policy "applications_select_seller" on public.applications
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.seller_id = auth.uid()
    )
  );

drop policy if exists "applications_select_staff" on public.applications;
create policy "applications_select_staff" on public.applications
  for select using (public.is_staff(auth.uid()));

-- Staff (admin + employee) can update applications (fill order id, feedback, etc.)
drop policy if exists "applications_update_staff" on public.applications;
create policy "applications_update_staff" on public.applications
  for update using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- ---------- sellers & staff can read shipping addresses of their creators ----------
drop policy if exists "addresses_staff_read" on public.creator_addresses;
create policy "addresses_staff_read" on public.creator_addresses
  for select using (public.is_staff(auth.uid()));

drop policy if exists "addresses_seller_read" on public.creator_addresses;
create policy "addresses_seller_read" on public.creator_addresses
  for select using (
    exists (
      select 1
      from public.applications a
      join public.campaigns c on c.id = a.campaign_id
      where a.creator_id = creator_addresses.user_id
        and c.seller_id = auth.uid()
    )
  );
