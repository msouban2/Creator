-- =============================================================
-- Bilkul — Claim queue for lifecycle action items (no double-work)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Content submissions already use a claim lease (0046) so two reviewers never
-- open the same one. The Review Queue now also lists lifecycle actions
-- (select, approve order, ship, deliver, draft, verify). Give those the same
-- treatment: each staff member can hold up to TWO action items at a time, and
-- an item they hold is hidden from everyone else until it's done or the lease
-- lapses.
-- =============================================================

alter table public.applications
  add column if not exists action_claimed_by uuid references public.profiles(id) on delete set null,
  add column if not exists action_claimed_at timestamptz;

create index if not exists idx_applications_action_claim
  on public.applications (action_claimed_by, action_claimed_at);

-- Does this application currently need an employee lifecycle action? Mirrors the
-- appAction() logic in the admin UI.
create or replace function public.app_needs_action(p_status text, p_type text, p_shipment text)
returns boolean
language sql
immutable
as $$
  select
    p_status = 'applied'
    or (p_type = 'reimbursement' and p_status = 'ordered')
    or (p_type in ('paid','barter') and p_status = 'selected')
    or (p_type in ('paid','barter') and p_status = 'product_shipped' and coalesce(p_shipment,'') <> 'delivered')
    or (p_type in ('paid','barter') and p_status = 'draft_submitted')
    or (p_type in ('paid','barter') and p_status = 'link_submitted');
$$;

-- Claim up to two action items for the caller (of their assigned types) and
-- return the ids the caller now holds. Releasing happens implicitly for items
-- the caller has already progressed past.
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

  -- Give back any of my claims that no longer need an action (I completed them).
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
        order by a.applied_at asc
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

-- Release a single claimed action item back to the pool (skip / hand off).
create or replace function public.release_action_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.applications
    set action_claimed_by = null, action_claimed_at = null
    where id = p_id and (action_claimed_by = auth.uid() or public.is_admin(auth.uid()));
end $$;

grant execute on function public.release_action_item(uuid) to authenticated;

-- How many action items are available to claim (unclaimed or stale), i.e. not
-- currently locked to another staff member.
create or replace function public.action_queue_depth(p_types text[])
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.applications a
  join public.campaigns c on c.id = a.campaign_id
  where c.campaign_type::text = any(p_types)
    and public.app_needs_action(a.status::text, c.campaign_type::text, a.seller_shipment_status::text)
    and (a.action_claimed_by is null or a.action_claimed_at < now() - interval '30 minutes');
$$;

grant execute on function public.action_queue_depth(text[]) to authenticated;
