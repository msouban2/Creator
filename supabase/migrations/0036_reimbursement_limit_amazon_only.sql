-- =============================================================
-- Aaina — Reimbursement monthly limit applies ONLY to Amazon links
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- Refines 0035: the 5-per-month cap only applies to reimbursement
-- campaigns whose product link is an Amazon URL (amazon.* / amzn.*).
-- Reimbursement campaigns with any other product link are NOT limited.
-- =============================================================

create or replace function public.enforce_reimbursement_monthly_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type  campaign_type;
  v_url   text;
  v_count int;
  v_limit int := 5;
begin
  select campaign_type, product_url into v_type, v_url
    from public.campaigns where id = new.campaign_id;

  -- Only reimbursement campaigns with an Amazon product link are capped.
  if v_type = 'reimbursement' and (v_url ilike '%amazon.%' or v_url ilike '%amzn.%') then
    select count(*) into v_count
    from public.applications a
    join public.campaigns c on c.id = a.campaign_id
    where a.creator_id = new.creator_id
      and c.campaign_type = 'reimbursement'
      and (c.product_url ilike '%amazon.%' or c.product_url ilike '%amzn.%')
      and a.status <> 'rejected'
      and a.applied_at >= date_trunc('month', now());

    if v_count >= v_limit then
      raise exception 'REIMBURSEMENT_MONTHLY_LIMIT: You can only take % Amazon-product campaigns per month.', v_limit
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_reimbursement_limit on public.applications;
create trigger trg_reimbursement_limit
  before insert on public.applications
  for each row execute function public.enforce_reimbursement_monthly_limit();
