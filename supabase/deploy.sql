
-- ===== migrations\0001_init.sql =====

-- =============================================================
-- Aaina Creator Marketplace â€” Core Schema
-- =============================================================
-- Requires: pgcrypto (uuid), Supabase auth schema
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- ENUM TYPES ----------
do $$ begin
  create type user_role as enum ('admin', 'creator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campaign_type as enum ('reimbursement', 'barter', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campaign_status as enum ('active', 'draft', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_status as enum (
    'applied', 'selected', 'product_received',
    'content_creation', 'submitted', 'review', 'completed', 'rejected'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_status as enum ('pending', 'approved', 'rejected', 'revision');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_type as enum (
    'campaign_payment', 'reimbursement', 'referral_bonus', 'withdrawal'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type kyc_status as enum ('pending', 'verified', 'rejected', 'not_submitted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type withdrawal_method as enum ('upi', 'bank_transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type withdrawal_status as enum ('requested', 'approved', 'rejected', 'paid');
exception when duplicate_object then null; end $$;

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  role                user_role not null default 'creator',
  full_name           text,
  email               text unique,
  phone               text,
  profile_image       text,
  instagram_username  text,
  instagram_url       text,
  instagram_followers integer not null default 0,
  youtube_channel     text,
  youtube_subscribers integer not null default 0,
  creator_score       numeric(5,2) not null default 0,
  referral_code       text unique,
  referred_by         uuid references public.profiles (id) on delete set null,
  total_earnings      numeric(12,2) not null default 0,
  kyc_status          kyc_status not null default 'not_submitted',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------- CAMPAIGNS ----------
create table if not exists public.campaigns (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  brand_name          text not null,
  campaign_type       campaign_type not null,
  campaign_image      text,
  description         text,
  deliverables        text,
  instructions        text,
  category            text,
  min_followers       integer not null default 0,
  max_followers       integer,
  slots               integer not null default 10,
  reward_amount       numeric(12,2) not null default 0,
  cashback_percentage numeric(5,2) not null default 0,
  application_deadline timestamptz,
  campaign_deadline   timestamptz,
  status              campaign_status not null default 'draft',
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------- APPLICATIONS ----------
create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references public.profiles (id) on delete cascade,
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  status        application_status not null default 'applied',
  reject_reason text,
  applied_at    timestamptz not null default now(),
  selected_at   timestamptz,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  unique (creator_id, campaign_id)
);

-- ---------- CREATOR ADDRESSES ----------
create table if not exists public.creator_addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text,
  address     text,
  city        text,
  state       text,
  country     text default 'India',
  postal_code text,
  created_at  timestamptz not null default now()
);

-- ---------- CAMPAIGN SUBMISSIONS ----------
create table if not exists public.campaign_submissions (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  reel_url       text,
  story_url      text,
  post_url       text,
  youtube_url    text,
  screenshots    text[] default '{}',
  notes          text,
  review_status  review_status not null default 'pending',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- WALLETS ----------
create table if not exists public.wallets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references public.profiles (id) on delete cascade,
  available_balance numeric(12,2) not null default 0,
  pending_balance   numeric(12,2) not null default 0,
  lifetime_earnings numeric(12,2) not null default 0,
  updated_at        timestamptz not null default now()
);

-- ---------- TRANSACTIONS ----------
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  amount      numeric(12,2) not null,
  type        transaction_type not null,
  remarks     text,
  campaign_id uuid references public.campaigns (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- WITHDRAWALS ----------
create table if not exists public.withdrawals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  amount       numeric(12,2) not null,
  method       withdrawal_method not null,
  upi_id       text,
  bank_account text,
  ifsc_code    text,
  account_name text,
  status       withdrawal_status not null default 'requested',
  processed_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------- REFERRALS ----------
create table if not exists public.referrals (
  id                  uuid primary key default gen_random_uuid(),
  referrer_id         uuid not null references public.profiles (id) on delete cascade,
  referred_creator_id uuid not null references public.profiles (id) on delete cascade,
  commission_earned   numeric(12,2) not null default 0,
  created_at          timestamptz not null default now(),
  unique (referred_creator_id)
);

-- ---------- NOTIFICATIONS ----------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete cascade,
  title      text not null,
  message    text,
  type       text default 'general',
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- KYC ----------
create table if not exists public.kyc (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references public.profiles (id) on delete cascade,
  pan_number     text,
  aadhaar_number text,
  document_image text,
  status         kyc_status not null default 'pending',
  reviewed_by    uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- APP SETTINGS (configurable referral rewards, etc.) ----------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('referral_rewards', '{"reimbursement": 20, "barter": 50, "paid": 100}'::jsonb),
  ('barter_min_followers', '500'::jsonb)
on conflict (key) do nothing;

-- ---------- INDEXES ----------
create index if not exists idx_campaigns_type on public.campaigns (campaign_type);
create index if not exists idx_campaigns_status on public.campaigns (status);
create index if not exists idx_applications_creator on public.applications (creator_id);
create index if not exists idx_applications_campaign on public.applications (campaign_id);
create index if not exists idx_applications_status on public.applications (status);
create index if not exists idx_transactions_user on public.transactions (user_id);
create index if not exists idx_notifications_user on public.notifications (user_id);
create index if not exists idx_referrals_referrer on public.referrals (referrer_id);


-- ===== migrations\0002_functions.sql =====

-- =============================================================
-- Aaina â€” Functions, Triggers & Business Logic
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
      values (v_referrer, 'Referral Bonus Earned! ðŸŽ‰',
              'You earned â‚¹' || v_bonus || ' from your referred creator.', 'referral');
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
  values (v_creator, 'Payment Released ðŸ’°',
          'â‚¹' || p_amount || ' has been credited to your wallet.', 'payment');
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
      values (v_user, 'Withdrawal Approved âœ…', 'â‚¹' || v_amount || ' has been paid out.', 'payment');
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


-- ===== migrations\0003_rls.sql =====

-- =============================================================
-- Aaina â€” Row Level Security Policies
-- =============================================================

alter table public.profiles            enable row level security;
alter table public.campaigns           enable row level security;
alter table public.applications        enable row level security;
alter table public.creator_addresses   enable row level security;
alter table public.campaign_submissions enable row level security;
alter table public.wallets             enable row level security;
alter table public.transactions        enable row level security;
alter table public.withdrawals         enable row level security;
alter table public.referrals           enable row level security;
alter table public.notifications       enable row level security;
alter table public.kyc                 enable row level security;
alter table public.app_settings        enable row level security;

-- ---------- PROFILES ----------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());

-- ---------- CAMPAIGNS ----------
drop policy if exists "campaigns_read_active" on public.campaigns;
create policy "campaigns_read_active" on public.campaigns
  for select using (status = 'active' or public.is_admin(auth.uid()));

drop policy if exists "campaigns_admin_write" on public.campaigns;
create policy "campaigns_admin_write" on public.campaigns
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- APPLICATIONS ----------
drop policy if exists "applications_select" on public.applications;
create policy "applications_select" on public.applications
  for select using (creator_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "applications_insert_own" on public.applications;
create policy "applications_insert_own" on public.applications
  for insert with check (creator_id = auth.uid());

drop policy if exists "applications_update" on public.applications;
create policy "applications_update" on public.applications
  for update using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- CREATOR ADDRESSES ----------
drop policy if exists "addresses_own" on public.creator_addresses;
create policy "addresses_own" on public.creator_addresses
  for all using (user_id = auth.uid() or public.is_admin(auth.uid()))
  with check (user_id = auth.uid());

-- ---------- SUBMISSIONS ----------
drop policy if exists "submissions_select" on public.campaign_submissions;
create policy "submissions_select" on public.campaign_submissions
  for select using (
    public.is_admin(auth.uid()) or exists (
      select 1 from public.applications a
      where a.id = application_id and a.creator_id = auth.uid()
    )
  );

drop policy if exists "submissions_insert_own" on public.campaign_submissions;
create policy "submissions_insert_own" on public.campaign_submissions
  for insert with check (
    exists (select 1 from public.applications a
            where a.id = application_id and a.creator_id = auth.uid())
  );

drop policy if exists "submissions_update" on public.campaign_submissions;
create policy "submissions_update" on public.campaign_submissions
  for update using (
    public.is_admin(auth.uid()) or exists (
      select 1 from public.applications a
      where a.id = application_id and a.creator_id = auth.uid()
    )
  );

-- ---------- WALLETS ----------
drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own" on public.wallets
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "wallets_admin_write" on public.wallets;
create policy "wallets_admin_write" on public.wallets
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- TRANSACTIONS ----------
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "transactions_admin_write" on public.transactions;
create policy "transactions_admin_write" on public.transactions
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- WITHDRAWALS ----------
drop policy if exists "withdrawals_select" on public.withdrawals;
create policy "withdrawals_select" on public.withdrawals
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "withdrawals_insert_own" on public.withdrawals;
create policy "withdrawals_insert_own" on public.withdrawals
  for insert with check (user_id = auth.uid());

drop policy if exists "withdrawals_admin_update" on public.withdrawals;
create policy "withdrawals_admin_update" on public.withdrawals
  for update using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- REFERRALS ----------
drop policy if exists "referrals_select" on public.referrals;
create policy "referrals_select" on public.referrals
  for select using (referrer_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "referrals_admin_write" on public.referrals;
create policy "referrals_admin_write" on public.referrals
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- NOTIFICATIONS ----------
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifications_admin_insert" on public.notifications;
create policy "notifications_admin_insert" on public.notifications
  for insert with check (public.is_admin(auth.uid()));

-- ---------- KYC ----------
drop policy if exists "kyc_own" on public.kyc;
create policy "kyc_own" on public.kyc
  for all using (user_id = auth.uid() or public.is_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin(auth.uid()));

-- ---------- APP SETTINGS ----------
drop policy if exists "settings_read_all" on public.app_settings;
create policy "settings_read_all" on public.app_settings
  for select using (auth.uid() is not null);

drop policy if exists "settings_admin_write" on public.app_settings;
create policy "settings_admin_write" on public.app_settings
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));


-- ===== migrations\0004_storage.sql =====

-- =============================================================
-- Aaina â€” Storage Buckets & Policies
-- =============================================================
-- Run after core schema. Creates buckets used by the app.

insert into storage.buckets (id, name, public)
values
  ('avatars',            'avatars',            true),
  ('campaign-images',    'campaign-images',    true),
  ('submission-screenshots', 'submission-screenshots', false),
  ('kyc-documents',      'kyc-documents',      false)
on conflict (id) do nothing;

-- ---------- avatars (public read, owner write) ----------
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------- campaign images (public read, admin write) ----------
drop policy if exists "campaign_images_public_read" on storage.objects;
create policy "campaign_images_public_read" on storage.objects
  for select using (bucket_id = 'campaign-images');

drop policy if exists "campaign_images_admin_write" on storage.objects;
create policy "campaign_images_admin_write" on storage.objects
  for all using (bucket_id = 'campaign-images' and public.is_admin(auth.uid()))
  with check (bucket_id = 'campaign-images' and public.is_admin(auth.uid()));

-- ---------- submission screenshots (private, owner + admin) ----------
drop policy if exists "submissions_owner_read" on storage.objects;
create policy "submissions_owner_read" on storage.objects
  for select using (
    bucket_id = 'submission-screenshots'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin(auth.uid()))
  );

drop policy if exists "submissions_owner_write" on storage.objects;
create policy "submissions_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'submission-screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------- kyc documents (private, owner + admin) ----------
drop policy if exists "kyc_owner_read" on storage.objects;
create policy "kyc_owner_read" on storage.objects
  for select using (
    bucket_id = 'kyc-documents'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin(auth.uid()))
  );

drop policy if exists "kyc_owner_write" on storage.objects;
create policy "kyc_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'kyc-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ===== seed.sql =====

-- =============================================================
-- Aaina â€” Seed Data (development / demo)
-- =============================================================
-- NOTE: profiles reference auth.users. For local dev, create the auth
-- users first (via Supabase Studio or the seed script in /supabase/seed),
-- then run this file, OR use the supabase CLI `db seed`.
-- The UUIDs below are placeholders â€” replace with real auth user ids.

-- Demo campaigns (no auth dependency)
insert into public.campaigns
  (id, title, brand_name, campaign_type, campaign_image, description, deliverables,
   instructions, category, min_followers, reward_amount, cashback_percentage,
   application_deadline, campaign_deadline, status)
values
  (
    '11111111-1111-1111-1111-111111111101',
    'Hair Reset Mist 30 ml (ZP)', 'ZeroPore', 'reimbursement',
    'https://picsum.photos/seed/hairmist/600/600',
    'Share honest feedback for our new Hair Reset Mist and get cashback.',
    '1 Instagram Reel, 1 Story', 'Buy the product, create content, submit invoice + content.',
    'Beauty & Personal Care', 0, 225, 100,
    now() + interval '20 days', now() + interval '30 days', 'active'
  ),
  (
    '11111111-1111-1111-1111-111111111102',
    'Shine Stopper Primer â€“ Mini (TR)', 'The Ruby', 'reimbursement',
    'https://picsum.photos/seed/primer/600/600',
    'Try our mattifying primer and share your review.',
    '1 Instagram Reel', 'Buy, review, submit.',
    'Makeup', 0, 180, 100,
    now() + interval '18 days', now() + interval '28 days', 'active'
  ),
  (
    '11111111-1111-1111-1111-111111111103',
    'LANEIGE Lip Sleeping Mask', 'LANEIGE', 'barter',
    'https://picsum.photos/seed/laneige/600/600',
    'Get the iconic lip mask in exchange for a reel.',
    '1 Reel', 'Create 1 reel featuring the product.',
    'Skincare', 500, 0, 0,
    now() + interval '14 days', now() + interval '25 days', 'active'
  ),
  (
    '11111111-1111-1111-1111-111111111104',
    'Rice Water Hair Growth Serum', 'Alps Goodness', 'barter',
    'https://picsum.photos/seed/riceserum/600/600',
    'Barter collaboration for our bestselling hair serum.',
    '1 Reel', 'Create 1 reel featuring the product.',
    'Hair Care', 500, 0, 0,
    now() + interval '16 days', now() + interval '26 days', 'active'
  ),
  (
    '11111111-1111-1111-1111-111111111105',
    'Glowish Vitamin C Serum Campaign', 'Glowish', 'paid',
    'https://picsum.photos/seed/vitc/600/600',
    'Paid collaboration â€” create amazing content and earn.',
    '1 Reel + 1 Post', 'Deliver reel and post as per brief.',
    'Skincare', 5000, 3000, 0,
    now() + interval '13 days', now() + interval '23 days', 'active'
  ),
  (
    '11111111-1111-1111-1111-111111111106',
    'LumiÃ¨re Matte Foundation Campaign', 'LumiÃ¨re', 'paid',
    'https://picsum.photos/seed/lumiere/600/600',
    'Paid collaboration for our matte foundation.',
    '1 Reel', 'Deliver reel as per brief.',
    'Makeup', 10000, 5000, 0,
    now() + interval '16 days', now() + interval '26 days', 'active'
  )
on conflict (id) do nothing;

