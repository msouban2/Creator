-- =============================================================
-- Aaina — Staff (employee) role, KYC verification, video proof
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- =============================================================

-- ---------- 1. Add 'employee' to user_role enum ----------
alter type user_role add value if not exists 'employee';

-- ---------- 2. staff helper (admin OR employee) ----------
-- Uses role::text to avoid "unsafe use of new enum value" in the same script.
create or replace function public.is_staff(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role::text in ('admin', 'employee')
  );
$$;

-- ---------- 3. video column on submissions ----------
alter table public.campaign_submissions
  add column if not exists video_url text;

-- ---------- 4. storage: submission-videos bucket ----------
insert into storage.buckets (id, name, public)
values ('submission-videos', 'submission-videos', false)
on conflict (id) do nothing;

-- creator writes to their own folder; staff read all
drop policy if exists "submission_videos_owner_write" on storage.objects;
create policy "submission_videos_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'submission-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "submission_videos_read" on storage.objects;
create policy "submission_videos_read" on storage.objects
  for select using (
    bucket_id = 'submission-videos'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_staff(auth.uid()))
  );

-- staff can read private screenshot + kyc buckets (for review)
drop policy if exists "submission_screenshots_staff_read" on storage.objects;
create policy "submission_screenshots_staff_read" on storage.objects
  for select using (
    bucket_id = 'submission-screenshots' and public.is_staff(auth.uid())
  );

drop policy if exists "kyc_documents_staff_read" on storage.objects;
create policy "kyc_documents_staff_read" on storage.objects
  for select using (
    bucket_id = 'kyc-documents' and public.is_staff(auth.uid())
  );

-- ---------- 5. RLS: give staff review/verify access ----------
-- profiles: staff can read everyone (dashboards, reviews)
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_staff(auth.uid()));

-- campaigns: staff can read all + create/edit
drop policy if exists "campaigns_read_active" on public.campaigns;
create policy "campaigns_read_active" on public.campaigns
  for select using (status = 'active' or public.is_staff(auth.uid()));

drop policy if exists "campaigns_admin_write" on public.campaigns;
create policy "campaigns_staff_write" on public.campaigns
  for all using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- applications: staff read + update status
drop policy if exists "applications_select" on public.applications;
create policy "applications_select" on public.applications
  for select using (creator_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists "applications_update" on public.applications;
create policy "applications_update" on public.applications
  for update using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- submissions: staff read + review
drop policy if exists "submissions_select" on public.campaign_submissions;
create policy "submissions_select" on public.campaign_submissions
  for select using (
    public.is_staff(auth.uid()) or exists (
      select 1 from public.applications a
      where a.id = application_id and a.creator_id = auth.uid()
    )
  );

drop policy if exists "submissions_update" on public.campaign_submissions;
create policy "submissions_update" on public.campaign_submissions
  for update using (
    public.is_staff(auth.uid()) or exists (
      select 1 from public.applications a
      where a.id = application_id and a.creator_id = auth.uid()
    )
  );

-- kyc: staff can read all (verification handled by RPC below)
drop policy if exists "kyc_staff_read" on public.kyc;
create policy "kyc_staff_read" on public.kyc
  for select using (user_id = auth.uid() or public.is_staff(auth.uid()));

-- wallets / transactions: staff read (money writes stay admin via RPC)
drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own" on public.wallets
  for select using (user_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (user_id = auth.uid() or public.is_staff(auth.uid()));

-- withdrawals: staff read (approve stays admin-only via RPC)
drop policy if exists "withdrawals_select" on public.withdrawals;
create policy "withdrawals_select" on public.withdrawals
  for select using (user_id = auth.uid() or public.is_staff(auth.uid()));

-- ---------- 6. verify_kyc RPC (staff) ----------
create or replace function public.verify_kyc(
  p_user   uuid,
  p_status kyc_status,
  p_notes  text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only staff can verify KYC';
  end if;

  update public.kyc
    set status = p_status, reviewed_by = auth.uid(), updated_at = now()
    where user_id = p_user;

  update public.profiles
    set kyc_status = p_status, updated_at = now()
    where id = p_user;

  insert into public.notifications (user_id, title, message, type)
  values (
    p_user,
    case when p_status = 'verified' then 'KYC Verified ✅'
         when p_status = 'rejected' then 'KYC Rejected'
         else 'KYC Update' end,
    coalesce(p_notes,
      case when p_status = 'verified' then 'Your KYC has been approved. You can now withdraw earnings.'
           when p_status = 'rejected' then 'Your KYC was rejected. Please re-submit your documents.'
           else 'Your KYC status was updated.' end),
    'kyc'
  );
end $$;

-- ---------- 7. set_user_role RPC (admin only) ----------
create or replace function public.set_user_role(
  p_user uuid,
  p_role user_role
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can change roles';
  end if;

  update public.profiles set role = p_role, updated_at = now() where id = p_user;
end $$;
