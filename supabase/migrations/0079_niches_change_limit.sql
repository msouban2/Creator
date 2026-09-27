-- 0079_niches_change_limit.sql
-- =============================================================
-- Limit how many times a creator can CHANGE their content niches.
-- =============================================================
-- A creator sets niches at signup, then may change them at most 3 times.
-- After the 3rd change the niches are locked. We count only real changes
-- (when the niches array actually differs) via a trigger, and enforce the cap
-- server-side so it can't be bypassed. Staff bypass entirely.
--
-- Safe to run multiple times.
-- =============================================================

alter table public.profiles
  add column if not exists niches_change_count integer not null default 0;

comment on column public.profiles.niches_change_count is
  'How many times the creator has changed their content niches. Capped at 3 by enforce_niches_change_limit().';

create or replace function public.enforce_niches_change_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only react when the niches array actually changed.
  if new.niches is distinct from old.niches then
    -- Staff (or system/no-auth contexts) can always adjust.
    if auth.uid() is null or public.is_staff(auth.uid()) then
      return new;
    end if;

    if coalesce(old.niches_change_count, 0) >= 3 then
      raise exception 'NICHES_LOCKED: you have used all 3 niche changes'
        using errcode = 'check_violation';
    end if;

    new.niches_change_count := coalesce(old.niches_change_count, 0) + 1;
  end if;

  return new;
end $$;

drop trigger if exists trg_enforce_niches_change_limit on public.profiles;
create trigger trg_enforce_niches_change_limit
  before update on public.profiles
  for each row execute function public.enforce_niches_change_limit();
