-- PostgreSQL does not implicitly cast applications.status (application_status)
-- to text when resolving a function signature. Add the enum-typed overload so
-- the existing campaign summary and enforcement functions resolve correctly.

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
  text, public.application_status, text, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, integer, timestamptz, timestamptz
) from public, anon, authenticated;
