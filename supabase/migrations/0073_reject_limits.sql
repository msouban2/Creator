-- 0073_reject_limits.sql
-- =============================================================
-- Re-upload limits after rejection.
-- =============================================================
-- Creators may re-upload (order screenshot or content) after a rejection, but
-- only up to 5 rejections; beyond that they must wait 24h between attempts.
-- We track the running rejection count + the last rejection time on the
-- application. A trigger bumps them automatically whenever the status moves
-- into 'rejected', so every rejection path (order / content / application) is
-- covered without touching the admin code.
--
-- Safe to run multiple times.
-- =============================================================

alter table public.applications
  add column if not exists reject_count integer not null default 0,
  add column if not exists last_rejected_at timestamptz;

create or replace function public.bump_reject_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    new.reject_count := coalesce(old.reject_count, 0) + 1;
    new.last_rejected_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_bump_reject_count on public.applications;
create trigger trg_bump_reject_count
  before update on public.applications
  for each row execute function public.bump_reject_count();

-- ---------- server-side enforcement of the re-upload cooldown ----------
-- Creators can't move a rejected application back into a submit state once they
-- have 5+ rejections until 24h have passed since the last one. Staff bypass.
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
     and old.last_rejected_at is not null
     and now() < old.last_rejected_at + interval '24 hours' then
    raise exception 'REUPLOAD_COOLDOWN: too many rejections — please wait 24 hours before re-uploading'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_reupload_cooldown on public.applications;
create trigger trg_reupload_cooldown
  before update on public.applications
  for each row execute function public.enforce_reupload_cooldown();
