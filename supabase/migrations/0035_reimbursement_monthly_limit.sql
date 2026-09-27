-- =============================================================
-- Aaina — Limit reimbursement (Amazon-product) campaigns to 5/creator/month
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- Only reimbursement campaigns (the ones with an Amazon purchase link where
-- the creator buys the product) are limited. A creator can hold at most 5
-- non-rejected reimbursement applications within the current calendar month.
-- Enforced with a BEFORE INSERT trigger so it can't be bypassed by the client.
-- =============================================================

create or replace function public.enforce_reimbursement_monthly_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type  campaign_type;
  v_count int;
  v_limit int := 5;
begin
  select campaign_type into v_type from public.campaigns where id = new.campaign_id;

  if v_type = 'reimbursement' then
    select count(*) into v_count
    from public.applications a
    join public.campaigns c on c.id = a.campaign_id
    where a.creator_id = new.creator_id
      and c.campaign_type = 'reimbursement'
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
