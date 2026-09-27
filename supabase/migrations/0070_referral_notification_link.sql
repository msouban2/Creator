-- 0070_referral_notification_link.sql
-- =============================================================
-- Deep-link the referral-earning notification to the wallet.
-- =============================================================
-- The referral bonus already inserts a `notifications` row, which fires the
-- push trigger (send_push_on_notification -> APNs/iOS, FCM/Android). This adds a
-- `link` so tapping the push on the phone opens the creator's wallet/earnings
-- screen instead of just the app home.
--
-- Redefines award_referral_bonus() (last set in 0032) verbatim, plus the link.
-- Safe to run multiple times.
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

      insert into public.notifications (user_id, title, message, type, link)
      values (v_referrer, 'Referral Bonus Earned! 🎉',
              'You earned ₹' || v_bonus || ' from your referred creator.',
              'referral', '/wallet');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_referral_bonus on public.applications;
create trigger trg_referral_bonus
  after update on public.applications
  for each row execute function public.award_referral_bonus();
