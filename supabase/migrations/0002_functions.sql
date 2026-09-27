-- =============================================================
-- Aaina — Functions, Triggers & Business Logic
-- =============================================================

-- ---------- updated_at helper ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','campaigns','applications','campaign_submissions','kyc'
  ] loop
    execute format(
      'drop trigger if exists trg_%1$s_updated on public.%1$s;
       create trigger trg_%1$s_updated before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ---------- role helper (used by RLS) ----------
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin');
$$;

-- ---------- unique referral code ----------
create or replace function public.generate_referral_code()
returns text language plpgsql as $$
declare
  code text;
begin
  loop
    code := 'AAINA' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.profiles where referral_code = code);
  end loop;
  return code;
end $$;

-- ---------- handle new auth user -> create profile + wallet ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref_code    text;
  referrer    uuid;
begin
  referrer := null;
  ref_code := coalesce(new.raw_user_meta_data->>'referred_by_code', null);
  if ref_code is not null then
    select id into referrer from public.profiles where referral_code = ref_code limit 1;
  end if;

  insert into public.profiles (
    id, role, full_name, email, phone,
    instagram_username, instagram_url, instagram_followers,
    youtube_channel, youtube_subscribers, profile_image,
    referral_code, referred_by
  ) values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'creator'),
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'instagram_username',
    new.raw_user_meta_data->>'instagram_url',
    coalesce((new.raw_user_meta_data->>'instagram_followers')::int, 0),
    new.raw_user_meta_data->>'youtube_channel',
    coalesce((new.raw_user_meta_data->>'youtube_subscribers')::int, 0),
    new.raw_user_meta_data->>'profile_image',
    public.generate_referral_code(),
    referrer
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;

  if referrer is not null then
    insert into public.referrals (referrer_id, referred_creator_id)
    values (referrer, new.id)
    on conflict (referred_creator_id) do nothing;
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- referral commission on first completed campaign ----------
-- Awards the referrer a bonus (configurable by campaign type) the first
-- time a referred creator completes a campaign.
create or replace function public.award_referral_bonus()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_referrer   uuid;
  v_type       campaign_type;
  v_rewards    jsonb;
  v_bonus      numeric(12,2);
  v_already    boolean;
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    -- find referrer of this creator
    select referrer_id into v_referrer
      from public.referrals where referred_creator_id = new.creator_id;
    if v_referrer is null then
      return new;
    end if;

    -- only award on the FIRST completed campaign of the referred creator
    select exists (
      select 1 from public.applications
      where creator_id = new.creator_id and status = 'completed' and id <> new.id
    ) into v_already;
    if v_already then
      return new;
    end if;

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

-- ---------- creator score recalculation ----------
-- score out of 100: completion rate (50) + on-time submission (30) + volume (20)
create or replace function public.recalc_creator_score(p_creator uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  total_apps    int;
  completed_apps int;
  on_time        int;
  submitted      int;
  score          numeric(5,2);
begin
  select count(*) into total_apps from public.applications where creator_id = p_creator;
  select count(*) into completed_apps
    from public.applications where creator_id = p_creator and status = 'completed';
  select count(*) into submitted
    from public.applications a
    join public.campaign_submissions s on s.application_id = a.id
    where a.creator_id = p_creator;
  select count(*) into on_time
    from public.applications a
    join public.campaign_submissions s on s.application_id = a.id
    join public.campaigns c on c.id = a.campaign_id
    where a.creator_id = p_creator
      and (c.campaign_deadline is null or s.created_at <= c.campaign_deadline);

  score := 0;
  if total_apps > 0 then
    score := score + (completed_apps::numeric / total_apps) * 50;
  end if;
  if submitted > 0 then
    score := score + (on_time::numeric / submitted) * 30;
  end if;
  score := score + least(completed_apps, 10) * 2; -- up to 20 for volume

  update public.profiles set creator_score = round(least(score, 100), 2)
    where id = p_creator;
end $$;

create or replace function public.trg_recalc_score()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_creator_score(new.creator_id);
  return new;
end $$;

drop trigger if exists trg_score_on_app on public.applications;
create trigger trg_score_on_app
  after insert or update on public.applications
  for each row execute function public.trg_recalc_score();

-- ---------- release campaign payment (admin RPC) ----------
create or replace function public.release_campaign_payment(
  p_application uuid,
  p_amount      numeric,
  p_type        transaction_type default 'campaign_payment'
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_creator uuid;
  v_campaign uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can release payments';
  end if;

  select creator_id, campaign_id into v_creator, v_campaign
    from public.applications where id = p_application;

  insert into public.transactions (user_id, amount, type, remarks, campaign_id)
  values (v_creator, p_amount, p_type, 'Campaign payment released', v_campaign);

  update public.wallets
    set available_balance = available_balance + p_amount,
        lifetime_earnings = lifetime_earnings + p_amount,
        updated_at = now()
    where user_id = v_creator;

  update public.profiles set total_earnings = total_earnings + p_amount
    where id = v_creator;

  update public.applications
    set status = 'completed', completed_at = now()
    where id = p_application;

  insert into public.notifications (user_id, title, message, type)
  values (v_creator, 'Payment Released 💰',
          '₹' || p_amount || ' has been credited to your wallet.', 'payment');
end $$;

-- ---------- request withdrawal (creator RPC) ----------
create or replace function public.request_withdrawal(
  p_amount numeric,
  p_method withdrawal_method,
  p_upi text default null,
  p_bank_account text default null,
  p_ifsc text default null,
  p_account_name text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
  v_id uuid;
begin
  select available_balance into v_balance from public.wallets where user_id = auth.uid();
  if v_balance is null or v_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  update public.wallets
    set available_balance = available_balance - p_amount,
        pending_balance = pending_balance + p_amount,
        updated_at = now()
    where user_id = auth.uid();

  insert into public.withdrawals (user_id, amount, method, upi_id, bank_account, ifsc_code, account_name)
  values (auth.uid(), p_amount, p_method, p_upi, p_bank_account, p_ifsc, p_account_name)
  returning id into v_id;

  return v_id;
end $$;

-- ---------- approve withdrawal (admin RPC) ----------
create or replace function public.approve_withdrawal(p_withdrawal uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_amount numeric;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can approve withdrawals';
  end if;

  select user_id, amount into v_user, v_amount
    from public.withdrawals where id = p_withdrawal and status = 'requested';
  if v_user is null then
    raise exception 'Withdrawal not found or already processed';
  end if;

  if p_approve then
    update public.wallets set pending_balance = pending_balance - v_amount, updated_at = now()
      where user_id = v_user;
    insert into public.transactions (user_id, amount, type, remarks)
      values (v_user, -v_amount, 'withdrawal', 'Withdrawal approved');
    update public.withdrawals
      set status = 'paid', processed_by = auth.uid(), processed_at = now()
      where id = p_withdrawal;
    insert into public.notifications (user_id, title, message, type)
      values (v_user, 'Withdrawal Approved ✅', '₹' || v_amount || ' has been paid out.', 'payment');
  else
    -- refund to available balance
    update public.wallets
      set pending_balance = pending_balance - v_amount,
          available_balance = available_balance + v_amount,
          updated_at = now()
      where user_id = v_user;
    update public.withdrawals
      set status = 'rejected', processed_by = auth.uid(), processed_at = now()
      where id = p_withdrawal;
    insert into public.notifications (user_id, title, message, type)
      values (v_user, 'Withdrawal Rejected', 'Your withdrawal request was rejected. Amount refunded.', 'payment');
  end if;
end $$;
