-- =============================================================
-- Aaina/Bilkul — Fix profile guard to allow cascaded trigger writes
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Regression fix for 0038: the profiles guard blocked ANY non-admin write
-- to creator_score/total_earnings/etc. But legitimate SECURITY DEFINER
-- triggers (e.g. recalc_creator_score via trg_score_on_app, or
-- award_referral_bonus) update these columns as a side effect of a creator
-- action (like applying to a campaign). Those cascaded writes run at
-- trigger nesting depth > 1, whereas a DIRECT user UPDATE on profiles runs
-- at depth 1. We now allow depth > 1 (trusted trigger cascades) and keep
-- blocking direct user edits to privileged columns.
-- =============================================================

create or replace function public.enforce_profile_update_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Allow: the service role (no JWT), admins, and writes that originate from
  -- another trigger (nesting depth > 1) such as score recalculation.
  if auth.uid() is null
     or public.is_admin(auth.uid())
     or pg_trigger_depth() > 1 then
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
