-- =============================================================
-- Aaina — Row Level Security Policies
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
