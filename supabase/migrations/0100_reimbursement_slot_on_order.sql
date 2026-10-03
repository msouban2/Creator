-- Every non-rejected application reserves a campaign slot immediately,
-- including reimbursement applications that start in the selected status.

create or replace function public.campaign_slots_left(p_campaign uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce((select slots from public.campaigns where id = p_campaign), 0)
    - (
      select count(*)
      from public.applications a
      where a.campaign_id = p_campaign
        and a.status <> 'rejected'
    ),
    0
  )::int;
$$;

grant execute on function public.campaign_slots_left(uuid) to authenticated;

create or replace function public.enforce_campaign_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slots int;
  v_taken int;
  v_new_counts boolean;
  v_old_counts boolean := false;
begin
  if auth.uid() is not null and public.is_staff(auth.uid()) then
    return new;
  end if;

  select slots
    into v_slots
  from public.campaigns
  where id = new.campaign_id
  for update;

  if v_slots is null then
    return new;
  end if;

  v_new_counts := new.status <> 'rejected';

  if tg_op = 'UPDATE' then
    v_old_counts := old.status <> 'rejected';
  end if;

  if not v_new_counts or v_old_counts then
    return new;
  end if;

  select count(*) into v_taken
  from public.applications a
  where a.campaign_id = new.campaign_id
    and a.status <> 'rejected';

  if v_taken >= v_slots then
    raise exception 'CAMPAIGN_SLOTS_FULL: all % slots are taken', v_slots
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_enforce_campaign_slots on public.applications;
create trigger trg_enforce_campaign_slots
  before insert or update of status on public.applications
  for each row execute function public.enforce_campaign_slots();