-- =============================================================
-- Bilkul — Sellers may see the ship-to name (not the username)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Correction to 0052: a seller needs the recipient's NAME + address to actually
-- ship the parcel, so restore their read access to the ship-to address for
-- creators in their own campaigns. Sellers still never see the creator's social
-- username/handle (the seller console only exposes follower/engagement stats,
-- never the identity), so identity linkage stays limited to the delivery label.
-- =============================================================

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

-- Keep the address name in the scoped RPC too, so sellers can address the parcel.
drop function if exists public.seller_order_address(uuid);
create or replace function public.seller_order_address(p_application uuid)
returns table (
  name        text,
  address     text,
  city        text,
  state       text,
  country     text,
  postal_code text,
  phone       text
)
language sql
security definer
set search_path = public
as $$
  select ca.name, ca.address, ca.city, ca.state, ca.country, ca.postal_code, ca.phone
  from public.applications app
  join public.campaigns c on c.id = app.campaign_id
  join public.creator_addresses ca on ca.user_id = app.creator_id
  where app.id = p_application
    and c.seller_id = auth.uid()
  order by ca.created_at desc
  limit 1;
$$;

grant execute on function public.seller_order_address(uuid) to authenticated;
