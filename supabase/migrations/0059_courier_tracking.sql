-- =============================================================
-- Bilkul — Live courier tracking for seller shipments
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Adds the courier provider + a cached tracking timeline to each order, and
-- extends seller_set_tracking to accept the courier. Live status is fetched by
-- the `track-shipment` edge function (which proxies a self-hosted
-- indian-courier-api instance) and cached back onto the application.
-- =============================================================

alter table public.applications
  add column if not exists seller_courier text,
  add column if not exists seller_tracking_events jsonb,
  add column if not exists seller_tracking_synced_at timestamptz;

comment on column public.applications.seller_courier is
  'Courier provider slug for live tracking: ekart | ecom | delhivery | bluedart | dtdc | dhl | maruti.';

-- Extended tracking setter that also records the courier provider. Kept as a
-- separate 5-arg overload so the older 4-arg callers keep working.
create or replace function public.seller_set_tracking(
  p_application uuid,
  p_tracking text,
  p_code text,
  p_status text,
  p_courier text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1
    from public.applications a
    join public.campaigns c on c.id = a.campaign_id
    where a.id = p_application and c.seller_id = auth.uid()
  ) then
    raise exception 'Not allowed to update this order';
  end if;
  if coalesce(p_status, 'pending') not in ('pending', 'shipped', 'delivered') then
    raise exception 'Invalid shipment status: %', p_status;
  end if;
  update public.applications set
    seller_tracking_id     = nullif(btrim(coalesce(p_tracking, '')), ''),
    seller_tracking_code   = nullif(btrim(coalesce(p_code, '')), ''),
    seller_courier         = nullif(btrim(coalesce(p_courier, '')), ''),
    seller_shipment_status = coalesce(p_status, 'pending'),
    shipped_at = case
      when p_status in ('shipped', 'delivered') then coalesce(shipped_at, now())
      else shipped_at
    end,
    updated_at = now()
  where id = p_application;
end $$;

grant execute on function public.seller_set_tracking(uuid, text, text, text, text) to authenticated;
