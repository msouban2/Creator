-- 0019_seller_tracking.sql
-- Sellers send a shipping tracking ID/link or a discount code per selected creator
-- (application) in their OWN campaigns, so admins can track it in the panel.
-- Stored on the application; a SECURITY DEFINER RPC scopes writes to the seller
-- who owns the campaign (sellers have no direct write policy on applications).

alter table public.applications
  add column if not exists seller_tracking_id text,
  add column if not exists seller_tracking_code text,
  add column if not exists seller_shipment_status text not null default 'pending';

comment on column public.applications.seller_tracking_id is 'Shipping tracking ID / link the seller submitted for this order.';
comment on column public.applications.seller_tracking_code is 'Discount / coupon code the seller submitted for this order.';
comment on column public.applications.seller_shipment_status is 'pending | shipped | delivered (seller-set).';

create or replace function public.seller_set_tracking(
  p_application uuid,
  p_tracking text,
  p_code text,
  p_status text
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
    seller_shipment_status = coalesce(p_status, 'pending'),
    shipped_at = case
      when p_status in ('shipped', 'delivered') then coalesce(shipped_at, now())
      else shipped_at
    end,
    updated_at = now()
  where id = p_application;
end $$;

grant execute on function public.seller_set_tracking(uuid, text, text, text) to authenticated;
