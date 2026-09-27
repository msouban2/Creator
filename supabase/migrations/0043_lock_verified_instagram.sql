-- =============================================================
-- Aaina/Bilkul — Lock verified Instagram fields once connected
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Once a creator connects Instagram (via InsightIQ), their follower count and
-- username are VERIFIED and must not be editable by the creator. The InsightIQ
-- sync/webhook writes these as the service role (auth.uid() is null) or via a
-- trigger cascade (pg_trigger_depth() > 1), both of which bypass this guard.
-- A creator's own client update, however, cannot change them.
-- =============================================================

create or replace function public.enforce_profile_update_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Allow: service role (no JWT), admins, and trusted trigger cascades.
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

  -- Verified-from-Instagram fields are locked once connected.
  if old.instagram_connected_at is not null then
    if new.instagram_followers is distinct from old.instagram_followers
       or new.instagram_username is distinct from old.instagram_username then
      raise exception 'FORBIDDEN_VERIFIED_FIELD: Instagram followers/username are verified and cannot be changed'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;
