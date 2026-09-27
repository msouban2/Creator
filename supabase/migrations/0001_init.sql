-- =============================================================
-- Aaina Creator Marketplace — Core Schema
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
