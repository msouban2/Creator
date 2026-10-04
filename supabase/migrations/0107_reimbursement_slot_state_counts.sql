-- Expose each reimbursement slot state separately for creator-facing counts.
-- Uses the application_status enum overload added after migration 0105.

create or replace function public.campaign_application_slot_state(
  p_campaign_type text,
  p_status public.application_status,
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
      then 'purchase_window'
    when p_status = 'ordered'
      and p_purchase_proof is not null
      and coalesce(p_order_submitted_at, p_updated_at) is not null
      and p_now < coalesce(p_order_submitted_at, p_updated_at) + interval '24 hours'
      then 'awaiting_review'
    when p_status = 'rejected'
      and p_purchase_proof is not null
      and p_product_received_at is null
      and coalesce(p_reject_count, 0) < 5
      and p_order_submitted_at is not null
      and p_last_rejected_at is not null
      and p_last_rejected_at <= p_order_submitted_at + interval '24 hours'
      then 'reupload'
    else 'none'
  end;
$$;

revoke all on function public.campaign_application_slot_state(
  text, public.application_status, text, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, integer, timestamptz, timestamptz
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
  v_purchase_window integer := 0;
  v_awaiting_review integer := 0;
  v_reupload integer := 0;
  v_reserved integer := 0;
begin
  select c.slots, c.campaign_type
    into v_total, v_campaign_type
  from public.campaigns c
  where c.id = p_campaign;

  if not found then
    return jsonb_build_object(
      'total', 0, 'approved', 0, 'purchase_window', 0,
      'awaiting_review', 0, 'reupload', 0, 'reserved', 0, 'available', 0
    );
  end if;

  select
    count(*) filter (where state.slot_state = 'approved')::int,
    count(*) filter (where state.slot_state = 'purchase_window')::int,
    count(*) filter (where state.slot_state = 'awaiting_review')::int,
    count(*) filter (where state.slot_state = 'reupload')::int
  into v_approved, v_purchase_window, v_awaiting_review, v_reupload
  from public.applications a
  cross join lateral (
    select public.campaign_application_slot_state(
      v_campaign_type, a.status, a.purchase_proof, a.product_received_at,
      a.selected_at, a.order_started_at, a.order_submitted_at, a.updated_at,
      a.reject_count, a.last_rejected_at, now()
    ) as slot_state
  ) state
  where a.campaign_id = p_campaign;

  v_reserved := coalesce(v_purchase_window, 0) + coalesce(v_awaiting_review, 0) + coalesce(v_reupload, 0);

  return jsonb_build_object(
    'total', coalesce(v_total, 0),
    'approved', coalesce(v_approved, 0),
    'purchase_window', coalesce(v_purchase_window, 0),
    'awaiting_review', coalesce(v_awaiting_review, 0),
    'reupload', coalesce(v_reupload, 0),
    'reserved', v_reserved,
    'available', greatest(coalesce(v_total, 0) - coalesce(v_approved, 0) - v_reserved, 0)
  );
end;
$$;

grant execute on function public.campaign_slot_summary(uuid) to authenticated;
