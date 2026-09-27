-- =============================================================
-- Aaina/Bilkul — Restrict application status on INSERT too
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Follow-up to 0038: the application guard only covered UPDATE, but the
-- applications_insert_own RLS policy checks only creator_id (not status).
-- A creator could therefore INSERT a row with a privileged status
-- (e.g. 'completed' / 'review') to bypass staff review. The referral
-- payout trigger is UPDATE-only so this could not directly pay out, but
-- we close it anyway for defense in depth: creators may only create an
-- application in an initial state ('applied' or 'selected').
-- =============================================================

create or replace function public.enforce_application_update_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_staff(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is not null and new.status not in ('applied', 'selected') then
      raise exception 'FORBIDDEN_STATUS_TRANSITION: creators cannot create an application with status %', new.status
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE by a creator
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
  before insert or update on public.applications
  for each row execute function public.enforce_application_update_guard();
