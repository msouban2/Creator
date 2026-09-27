-- 0078_niches_max_three.sql
-- =============================================================
-- Cap creator content niches at 3.
-- =============================================================
-- Creators pick up to 3 content niches (enforced in the app's NichePicker).
-- This constraint enforces the same limit server-side so it can't be bypassed
-- via the API or the signup metadata path. Existing rows with more than 3 are
-- trimmed to the first 3 before adding the constraint so it can be applied
-- safely.
--
-- Safe to run multiple times.
-- =============================================================

-- Trim any existing profiles that already exceed 3 niches.
update public.profiles
set niches = niches[1:3]
where array_length(niches, 1) > 3;

alter table public.profiles
  drop constraint if exists profiles_niches_max_3;

alter table public.profiles
  add constraint profiles_niches_max_3
  check (niches is null or array_length(niches, 1) is null or array_length(niches, 1) <= 3);
