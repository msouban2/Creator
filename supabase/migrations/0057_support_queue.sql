-- =============================================================
-- Bilkul — Support claim queue (max 4 active tickets per agent)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Turns the support inbox into a claim-based queue like the review queue: a
-- staff member picks up the next waiting ticket (or a specific one), and may
-- hold at most 4 OPEN tickets at a time. Resolving a ticket frees a slot.
-- =============================================================

alter table public.support_tickets
  add column if not exists claimed_by uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz;

create index if not exists support_tickets_claim_idx
  on public.support_tickets (status, claimed_by, last_message_at);

-- Max concurrent open tickets one agent may hold.
create or replace function public.support_max_active() returns int language sql immutable as $$ select 4 $$;

-- How many open tickets are unclaimed and waiting.
create or replace function public.support_queue_depth()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.support_tickets
  where status = 'open' and claimed_by is null;
$$;

grant execute on function public.support_queue_depth() to authenticated;

-- Claim a specific ticket (p_ticket) or the oldest waiting one (null). Enforces
-- the per-agent active cap atomically. Returns the claimed ticket id, or null
-- when there is nothing to claim.
create or replace function public.claim_support_ticket(p_ticket uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_active int;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only staff can claim tickets';
  end if;

  -- Count what I'm already handling (open + assigned to me).
  select count(*) into v_active
  from public.support_tickets
  where status = 'open' and claimed_by = auth.uid();

  if v_active >= public.support_max_active() then
    raise exception 'You already have % active tickets. Resolve one before claiming more.', public.support_max_active()
      using errcode = 'P0001';
  end if;

  if p_ticket is not null then
    update public.support_tickets
      set claimed_by = auth.uid(), claimed_at = now()
      where id = p_ticket
        and status = 'open'
        and (claimed_by is null or claimed_by = auth.uid())
      returning id into v_id;
    return v_id;
  end if;

  -- Otherwise grab the oldest waiting (unclaimed, open) ticket atomically.
  select id into v_id
  from public.support_tickets
  where status = 'open' and claimed_by is null
  order by last_message_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.support_tickets
    set claimed_by = auth.uid(), claimed_at = now()
    where id = v_id;

  return v_id;
end $$;

grant execute on function public.claim_support_ticket(uuid) to authenticated;

-- Put a ticket back into the unclaimed pool (its owner-agent or any admin).
create or replace function public.release_support_ticket(p_ticket uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only staff can release tickets';
  end if;
  update public.support_tickets
    set claimed_by = null, claimed_at = null
    where id = p_ticket and (claimed_by = auth.uid() or public.is_admin(auth.uid()));
end $$;

grant execute on function public.release_support_ticket(uuid) to authenticated;
