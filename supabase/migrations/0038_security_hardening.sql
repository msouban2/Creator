-- =============================================================
-- Aaina/Bilkul — Security hardening (privilege-escalation fixes)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Fixes from the security review:
--   #1 Signup trigger must NOT trust a client-supplied role.
--   #2 Creators must not be able to change privileged profile columns
--      (role / kyc_status / earnings / score / staff permissions).
--   #3 Creators must not be able to self-advance an application to a
--      privileged status (e.g. 'completed'), which auto-pays referrals.
--   #4 Creators must not be able to self-approve their own KYC.
--
-- RLS in Postgres is row-scoped only, so column-level protection is
-- enforced here with SECURITY DEFINER BEFORE-triggers. Staff/admin
-- (and the service role, where auth.uid() is null) are unaffected.
-- =============================================================

-- -------------------------------------------------------------
-- #1 handle_new_user: never derive role from client metadata.
--    New self-service signups are always 'creator'. Elevation
--    happens only through the admin-only set_user_role RPC.
-- -------------------------------------------------------------
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
    'creator',                       -- SECURITY: role is never taken from metadata
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

-- -------------------------------------------------------------
-- #2 Guard privileged columns on profiles against self-edits.
--    Non-admin callers cannot change role / kyc_status / earnings
--    / score / staff permissions. Admins and the service role pass.
-- -------------------------------------------------------------
create or replace function public.enforce_profile_update_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin(auth.uid()) then
    return new;
  end if;

  if new.role          is distinct from old.role
     or new.kyc_status is distinct from old.kyc_status
     or new.total_earnings is distinct from old.total_earnings
     or new.creator_score  is distinct from old.creator_score
     or new.permissions    is distinct from old.permissions
     or new.review_types   is distinct from old.review_types
     or new.seller_type    is distinct from old.seller_type then
    raise exception 'FORBIDDEN_PROFILE_FIELD: you cannot modify privileged profile fields'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_profile_update_guard on public.profiles;
create trigger trg_profile_update_guard
  before update on public.profiles
  for each row execute function public.enforce_profile_update_guard();

-- -------------------------------------------------------------
-- #3 Guard application status transitions for creators.
--    Creators may only move an application through the states the
--    app legitimately uses; they can never set 'completed' (which
--    triggers referral payouts) or any other privileged status.
-- -------------------------------------------------------------
create or replace function public.enforce_application_update_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_staff(auth.uid()) then
    return new;
  end if;

  if new.status is distinct from old.status
     and new.status not in (
       'product_received', 'draft_submitted', 'link_submitted', 'submitted'
     ) then
    raise exception 'FORBIDDEN_STATUS_TRANSITION: creators cannot set status %', new.status
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_application_update_guard on public.applications;
create trigger trg_application_update_guard
  before update on public.applications
  for each row execute function public.enforce_application_update_guard();

-- -------------------------------------------------------------
-- #4 Guard KYC verification. Creators may submit/update their KYC
--    documents but never set the review outcome; on insert the
--    status is forced to 'pending'. Only admin (or the staff
--    verify_kyc RPC) can approve.
-- -------------------------------------------------------------
create or replace function public.enforce_kyc_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.reviewed_by := null;
    return new;
  end if;

  -- UPDATE by a non-admin
  if new.status is distinct from old.status
     or new.reviewed_by is distinct from old.reviewed_by then
    raise exception 'FORBIDDEN_KYC_FIELD: you cannot change KYC status'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_kyc_guard on public.kyc;
create trigger trg_kyc_guard
  before insert or update on public.kyc
  for each row execute function public.enforce_kyc_guard();
