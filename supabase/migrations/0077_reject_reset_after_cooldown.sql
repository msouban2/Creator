-- 0077_reject_reset_after_cooldown.sql
-- =============================================================
-- Reset the rejection counter after the 24h cooldown.
-- =============================================================
-- Order screenshots (and content) can be rejected up to 5 times. On the 5th
-- rejection the application is effectively CLOSED (rejected) and the creator
-- must wait 24h. This migration makes the wait a true RESET: once 24h have
-- passed since the 5th rejection, the next re-upload is allowed AND the running
-- reject_count is cleared back to 0, giving the creator a fresh set of attempts.
--
-- Before this, reject_count stayed at 5 forever, so every later re-upload was
-- one rejection away from another 24h block. Staff always bypass.
--
-- Safe to run multiple times.
-- =============================================================

create or replace function public.enforce_reupload_cooldown()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_staff(auth.uid()) then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'rejected'
     and new.status in ('ordered', 'submitted', 'product_received', 'draft_submitted', 'link_submitted')
     and coalesce(old.reject_count, 0) >= 5
     and old.last_rejected_at is not null then
    if now() < old.last_rejected_at + interval '24 hours' then
      raise exception 'REUPLOAD_COOLDOWN: too many rejections — please wait 24 hours before re-uploading'
        using errcode = 'check_violation';
    else
      -- Cooldown elapsed → fresh start: clear the counter for the new attempt.
      new.reject_count := 0;
      new.last_rejected_at := null;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_reupload_cooldown on public.applications;
create trigger trg_reupload_cooldown
  before update on public.applications
  for each row execute function public.enforce_reupload_cooldown();
