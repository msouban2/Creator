-- =============================================================
-- Bilkul — Credit the referral bonus at approval, not completion
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Previously the referrer's bonus was paid only when the referred creator's
-- application reached 'completed'. Now it is credited as soon as the referred
-- creator has genuinely engaged and been approved:
--   * reimbursement  -> when the ORDER is approved      (status 'order_approved')
--   * barter / paid   -> when the DRAFT/content is approved (status 'draft_approved')
-- 'completed' is kept as a safety net so no eligible referral is ever missed.
--
-- Two fixes so the bonus is fully connected + safe:
--   1. The transaction now records campaign_id, so the admin per-campaign
--      Referral Amount reflects real referral spend (it was null before).
--   2. A per-application `referral_bonus_awarded` flag makes crediting
--      idempotent — the bonus is paid exactly once per application.
-- =============================================================

alter table public.applications
  add column if not exists referral_bonus_awarded boolean not null default false;

-- Backfill: applications already 'completed' had their chance to award under the
-- old (completion-based) logic, so mark them paid to prevent any re-crediting.
-- In-flight applications keep the flag false and will be credited once at their
-- new milestone (order_approved / draft_approved) or, as a fallback, completion.
update public.applications set referral_bonus_awarded = true where status = 'completed';

create or replace function public.award_referral_bonus()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_referrer   uuid;
  v_type       campaign_type;
  v_rewards    jsonb;
  v_bonus      numeric(12,2);
  v_milestone  boolean;
begin
  -- Already paid for this application, or not a status change — nothing to do.
  if coalesce(old.referral_bonus_awarded, false) then
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;

  select campaign_type into v_type from public.campaigns where id = new.campaign_id;

  -- The crediting milestone depends on the campaign type; 'completed' is a
  -- catch-all so nothing eligible is ever skipped.
  v_milestone := (
    (v_type = 'reimbursement' and new.status = 'order_approved')
    or (v_type in ('barter', 'paid') and new.status = 'draft_approved')
    or (new.status = 'completed')
  );
  if not v_milestone then
    return new;
  end if;

  select referrer_id into v_referrer
    from public.referrals where referred_creator_id = new.creator_id;
  if v_referrer is null then
    return new;
  end if;

  select value into v_rewards from public.app_settings where key = 'referral_rewards';
  v_bonus := coalesce((v_rewards->>v_type::text)::numeric, 0);

  if v_bonus > 0 then
    update public.referrals
      set commission_earned = commission_earned + v_bonus
      where referrer_id = v_referrer and referred_creator_id = new.creator_id;

    -- campaign_id links the bonus to the campaign for per-campaign reporting.
    insert into public.transactions (user_id, amount, type, campaign_id, remarks)
    values (v_referrer, v_bonus, 'referral_bonus', new.campaign_id,
            'Referral bonus for ' || v_type::text || ' campaign');

    update public.wallets
      set available_balance = available_balance + v_bonus,
          lifetime_earnings = lifetime_earnings + v_bonus,
          updated_at = now()
      where user_id = v_referrer;

    update public.profiles
      set total_earnings = total_earnings + v_bonus
      where id = v_referrer;

    insert into public.notifications (user_id, title, message, type, link)
    values (v_referrer, 'Referral Bonus Earned! 🎉',
            'You earned ₹' || v_bonus || ' from your referred creator.',
            'referral', '/wallet');
  end if;

  -- Mark as paid so it can never double-credit (safe: BEFORE trigger).
  new.referral_bonus_awarded := true;
  return new;
end $$;

-- Runs BEFORE so it can stamp referral_bonus_awarded on the same row.
drop trigger if exists trg_referral_bonus on public.applications;
create trigger trg_referral_bonus
  before update on public.applications
  for each row execute function public.award_referral_bonus();
