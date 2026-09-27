-- =============================================================
-- Bilkul — Prioritise urgent items when claiming action work
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- claim_action_items() previously handed out work oldest-first. Order approvals
-- carry a 24h SLA, so claim those first (oldest submitted = closest to / past
-- the deadline), then fall back to oldest-applied for everything else.
-- =============================================================

create or replace function public.claim_action_items(p_types text[])
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease constant interval := interval '30 minutes';
  v_max   constant int := 2;
  v_held  int;
  v_needed int;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only staff can claim action items';
  end if;

  update public.applications a
    set action_claimed_by = null, action_claimed_at = null
    from public.campaigns c
    where a.campaign_id = c.id
      and a.action_claimed_by = auth.uid()
      and not public.app_needs_action(a.status::text, c.campaign_type::text, a.seller_shipment_status::text);

  select count(*) into v_held
  from public.applications a
  where a.action_claimed_by = auth.uid()
    and a.action_claimed_at >= now() - v_lease;

  v_needed := v_max - v_held;

  if v_needed > 0 then
    update public.applications
      set action_claimed_by = auth.uid(), action_claimed_at = now()
      where id in (
        select a.id
        from public.applications a
        join public.campaigns c on c.id = a.campaign_id
        where c.campaign_type::text = any(p_types)
          and public.app_needs_action(a.status::text, c.campaign_type::text, a.seller_shipment_status::text)
          and (a.action_claimed_by is null or a.action_claimed_at < now() - v_lease)
        order by
          -- Order approvals (24h SLA) first, oldest submitted first, then oldest applied.
          case when a.status = 'ordered' then 0 else 1 end,
          coalesce(a.order_submitted_at, a.applied_at) asc
        for update of a skip locked
        limit v_needed
      );
  end if;

  return query
    select a.id from public.applications a
    where a.action_claimed_by = auth.uid()
      and a.action_claimed_at >= now() - v_lease;
end $$;

grant execute on function public.claim_action_items(text[]) to authenticated;
