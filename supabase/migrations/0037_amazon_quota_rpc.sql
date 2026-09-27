-- =============================================================
-- Aaina — RPC: how many Amazon reimbursement deals used this month
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- Returns the current creator's count of non-rejected Amazon-link
-- reimbursement applications in the current calendar month, so the app
-- can show "X of 5 left this month".
-- =============================================================

create or replace function public.amazon_reimbursement_used()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.applications a
  join public.campaigns c on c.id = a.campaign_id
  where a.creator_id = auth.uid()
    and c.campaign_type = 'reimbursement'
    and (c.product_url ilike '%amazon.%' or c.product_url ilike '%amzn.%')
    and a.status <> 'rejected'
    and a.applied_at >= date_trunc('month', now());
$$;

grant execute on function public.amazon_reimbursement_used() to authenticated;
