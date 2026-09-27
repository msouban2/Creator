-- =============================================================
-- Aaina — Referral bonus per completed campaign (not just the first)
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- Previously the referrer earned a bonus only on the referred creator's
-- FIRST completed campaign. Now they earn the (per-type) bonus every time
-- the referred creator completes a campaign/product. Each application
-- completes once, so this awards once per completed order.
-- =============================================================

create or replace function public.award_referral_bonus()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_referrer   uuid;
  v_type       campaign_type;
  v_rewards    jsonb;
  v_bonus      numeric(12,2);
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    -- find referrer of this creator
    select referrer_id into v_referrer
      from public.referrals where referred_creator_id = new.creator_id;
    if v_referrer is null then
      return new;
    end if;

    -- Award on EVERY completed campaign of the referred creator (per product).
    select campaign_type into v_type from public.campaigns where id = new.campaign_id;
    select value into v_rewards from public.app_settings where key = 'referral_rewards';
    v_bonus := coalesce((v_rewards->>v_type::text)::numeric, 0);

    if v_bonus > 0 then
      update public.referrals
        set commission_earned = commission_earned + v_bonus
        where referrer_id = v_referrer and referred_creator_id = new.creator_id;

      insert into public.transactions (user_id, amount, type, remarks)
      values (v_referrer, v_bonus, 'referral_bonus',
              'Referral bonus for ' || v_type::text || ' campaign');

      update public.wallets
        set available_balance = available_balance + v_bonus,
            lifetime_earnings = lifetime_earnings + v_bonus,
            updated_at = now()
        where user_id = v_referrer;

      update public.profiles
        set total_earnings = total_earnings + v_bonus
        where id = v_referrer;

      insert into public.notifications (user_id, title, message, type)
      values (v_referrer, 'Referral Bonus Earned! 🎉',
              'You earned ₹' || v_bonus || ' from your referred creator.', 'referral');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_referral_bonus on public.applications;
create trigger trg_referral_bonus
  after update on public.applications
  for each row execute function public.award_referral_bonus();
