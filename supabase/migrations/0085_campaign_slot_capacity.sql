-- =============================================================
-- Bilkul — Enforce campaign slot capacity (rejected apps free a slot)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- A campaign has `slots` — the number of creators wanted. Once that many
-- non-rejected applications exist, no new creator can apply. Rejecting an
-- application frees its slot, so others can apply again. Enforced in the DB so
-- it can't be bypassed and is safe under concurrent applies (the campaign row
-- is locked while we count).
-- =============================================================

-- How many slots are still open on a campaign (never negative). SECURITY
-- DEFINER so a creator can read the count without seeing others' applications.
create or replace function public.campaign_slots_left(p_campaign uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce((select slots from public.campaigns where id = p_campaign), 0)
    - (select count(*) from public.applications
        where campaign_id = p_campaign and status <> 'rejected'),
    0
  )::int;
$$;

grant execute on function public.campaign_slots_left(uuid) to authenticated;

-- Block a new application when the campaign's slots are full. Staff inserts are
-- exempt. The campaign row is locked first so two concurrent applies can't both
-- slip past the capacity check.
create or replace function public.enforce_campaign_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slots int;
  v_taken int;
begin
  -- Staff (admins/employees) are not subject to the cap.
  if auth.uid() is not null and public.is_staff(auth.uid()) then
    return new;
  end if;

  -- Lock the campaign row to serialise concurrent applies for it.
  select slots into v_slots from public.campaigns where id = new.campaign_id for update;
  if v_slots is null then
    return new; -- unknown campaign — let other guards handle it
  end if;

  select count(*) into v_taken
  from public.applications
  where campaign_id = new.campaign_id
    and status <> 'rejected';

  if v_taken >= v_slots then
    raise exception 'CAMPAIGN_SLOTS_FULL: all % slots are taken', v_slots
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_enforce_campaign_slots on public.applications;
create trigger trg_enforce_campaign_slots
  before insert on public.applications
  for each row execute function public.enforce_campaign_slots();
