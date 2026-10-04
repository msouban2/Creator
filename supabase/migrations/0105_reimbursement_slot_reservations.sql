-- Reimbursement campaign capacity includes approved orders and temporary holds.
-- A selected creator holds one slot for the 15-minute purchase window. An
-- uploaded order screenshot holds it for the 24-hour staff review window.
-- A rejected order screenshot retains its hold while free reuploads remain;
-- the fifth rejection releases it as the 24-hour retry cooldown begins.

create or replace function public.campaign_application_slot_state(
  p_campaign_type text,
  p_status text,
  p_purchase_proof text,
  p_product_received_at timestamptz,
  p_selected_at timestamptz,
  p_order_started_at timestamptz,
  p_order_submitted_at timestamptz,
  p_updated_at timestamptz,
  p_reject_count integer,
  p_last_rejected_at timestamptz,
  p_now timestamptz
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_campaign_type <> 'reimbursement' then
      case when p_status <> 'rejected' then 'approved' else 'none' end
    when p_product_received_at is not null or p_status in (
      'order_approved', 'product_received', 'content_creation', 'submitted',
      'review', 'payment_in_progress', 'completed'
    ) then 'approved'
    when p_status = 'selected'
      and coalesce(p_order_started_at, p_selected_at) is not null
      and p_now < coalesce(p_order_started_at, p_selected_at) + interval '15 minutes'
      then 'reserved'
    when p_status = 'ordered'
      and p_purchase_proof is not null
      and coalesce(p_order_submitted_at, p_updated_at) is not null
      and p_now < coalesce(p_order_submitted_at, p_updated_at) + interval '24 hours'
      then 'reserved'
    when p_status = 'rejected'
      and p_purchase_proof is not null
      and p_product_received_at is null
      and coalesce(p_reject_count, 0) < 5
      and p_order_submitted_at is not null
      and p_last_rejected_at is not null
      and p_last_rejected_at <= p_order_submitted_at + interval '24 hours'
      then 'reserved'
    else 'none'
  end;
$$;

revoke all on function public.campaign_application_slot_state(
  text, text, text, timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, integer, timestamptz, timestamptz
) from public, anon, authenticated;

create or replace function public.campaign_slot_summary(p_campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_campaign_type text;
  v_approved integer := 0;
  v_reserved integer := 0;
begin
  select c.slots, c.campaign_type
    into v_total, v_campaign_type
  from public.campaigns c
  where c.id = p_campaign;

  if not found then
    return jsonb_build_object('total', 0, 'approved', 0, 'reserved', 0, 'available', 0);
  end if;

  select
    count(*) filter (where state.slot_state = 'approved')::int,
    count(*) filter (where state.slot_state = 'reserved')::int
    into v_approved, v_reserved
  from public.applications a
  cross join lateral (
    select public.campaign_application_slot_state(
      v_campaign_type,
      a.status,
      a.purchase_proof,
      a.product_received_at,
      a.selected_at,
      a.order_started_at,
      a.order_submitted_at,
      a.updated_at,
      a.reject_count,
      a.last_rejected_at,
      now()
    ) as slot_state
  ) state
  where a.campaign_id = p_campaign;

  return jsonb_build_object(
    'total', coalesce(v_total, 0),
    'approved', coalesce(v_approved, 0),
    'reserved', coalesce(v_reserved, 0),
    'available', greatest(coalesce(v_total, 0) - coalesce(v_approved, 0) - coalesce(v_reserved, 0), 0)
  );
end;
$$;

grant execute on function public.campaign_slot_summary(uuid) to authenticated;

create or replace function public.campaign_slots_left(p_campaign uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((public.campaign_slot_summary(p_campaign)->>'available')::int, 0);
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
  v_old_state text := 'none';
  v_new_state text;
  v_available integer;
begin
  select c.slots, c.campaign_type
    into v_slots, v_campaign_type
  from public.campaigns c
  where c.id = new.campaign_id
  for update;

  if v_slots is null then
    return new;
  end if;

  v_new_state := public.campaign_application_slot_state(
    v_campaign_type, new.status, new.purchase_proof, new.product_received_at,
    new.selected_at, new.order_started_at, new.order_submitted_at, new.updated_at,
    new.reject_count, new.last_rejected_at, now()
  );

  if tg_op = 'UPDATE' then
    v_old_state := public.campaign_application_slot_state(
      v_campaign_type, old.status, old.purchase_proof, old.product_received_at,
      old.selected_at, old.order_started_at, old.order_submitted_at, old.updated_at,
      old.reject_count, old.last_rejected_at, now()
    );
  end if;

  if auth.uid() is not null and public.is_staff(auth.uid()) then
    if v_campaign_type <> 'reimbursement'
      or v_new_state <> 'approved'
      or v_old_state <> 'none' then
      return new;
    end if;
  elsif v_new_state = 'none' or v_old_state <> 'none' then
    return new;
  end if;

  select coalesce((public.campaign_slot_summary(new.campaign_id)->>'available')::int, 0)
    into v_available;

  if v_available <= 0 then
    raise exception 'CAMPAIGN_SLOTS_FULL: all % slots are approved or reserved', v_slots
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_campaign_slots on public.applications;
create trigger trg_enforce_campaign_slots
  before insert or update of status, selected_at, order_started_at, order_submitted_at,
    purchase_proof, product_received_at, reject_count, last_rejected_at
  on public.applications
  for each row execute function public.enforce_campaign_slots();
