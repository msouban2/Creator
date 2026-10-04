-- Reimbursement slots are consumed only after an order screenshot is approved.
-- Pending applications/orders remain eligible for consideration, but do not use
-- capacity until staff approves the order. Other campaign types keep their
-- existing non-rejected application reservation behavior.

create or replace function public.campaign_slots_left(p_campaign uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slots integer;
  v_campaign_type text;
  v_taken integer;
begin
  select c.slots, c.campaign_type
    into v_slots, v_campaign_type
  from public.campaigns c
  where c.id = p_campaign;

  if not found then
    return 0;
  end if;

  if v_campaign_type = 'reimbursement' then
    select count(*)::int
      into v_taken
    from public.applications a
    where a.campaign_id = p_campaign
      and a.status in (
        'order_approved', 'product_received', 'content_creation', 'submitted',
        'review', 'payment_in_progress', 'completed'
      );
  else
    select count(*)::int
      into v_taken
    from public.applications a
    where a.campaign_id = p_campaign
      and a.status <> 'rejected';
  end if;

  return greatest(coalesce(v_slots, 0) - coalesce(v_taken, 0), 0);
end;
$$;

grant execute on function public.campaign_slots_left(uuid) to authenticated;

create or replace function public.enforce_campaign_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slots integer;
  v_campaign_type text;
  v_taken integer;
  v_new_counts boolean;
  v_old_counts boolean := false;
begin
  select c.slots, c.campaign_type
    into v_slots, v_campaign_type
  from public.campaigns c
  where c.id = new.campaign_id
  for update;

  if v_slots is null then
    return new;
  end if;

  if auth.uid() is not null
    and public.is_staff(auth.uid())
    and not (
      v_campaign_type = 'reimbursement'
      and new.status in (
        'order_approved', 'product_received', 'content_creation', 'submitted',
        'review', 'payment_in_progress', 'completed'
      )
      and (tg_op = 'INSERT' or old.status not in (
        'order_approved', 'product_received', 'content_creation', 'submitted',
        'review', 'payment_in_progress', 'completed'
      ))
    )
  then
    return new;
  end if;

  if v_campaign_type = 'reimbursement' then
    v_new_counts := new.status in (
      'order_approved', 'product_received', 'content_creation', 'submitted',
      'review', 'payment_in_progress', 'completed'
    );
    if tg_op = 'UPDATE' then
      v_old_counts := old.status in (
        'order_approved', 'product_received', 'content_creation', 'submitted',
        'review', 'payment_in_progress', 'completed'
      );
    end if;
  else
    v_new_counts := new.status <> 'rejected';
    if tg_op = 'UPDATE' then
      v_old_counts := old.status <> 'rejected';
    end if;
  end if;

  if not v_new_counts or v_old_counts then
    return new;
  end if;

  if v_campaign_type = 'reimbursement' then
    select count(*)::int
      into v_taken
    from public.applications a
    where a.campaign_id = new.campaign_id
      and a.status in (
        'order_approved', 'product_received', 'content_creation', 'submitted',
        'review', 'payment_in_progress', 'completed'
      );
  else
    select count(*)::int
      into v_taken
    from public.applications a
    where a.campaign_id = new.campaign_id
      and a.status <> 'rejected';
  end if;

  if v_taken >= v_slots then
    raise exception 'CAMPAIGN_SLOTS_FULL: all % slots are taken', v_slots
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_campaign_slots on public.applications;
create trigger trg_enforce_campaign_slots
  before insert or update of status on public.applications
  for each row execute function public.enforce_campaign_slots();
