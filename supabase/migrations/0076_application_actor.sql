-- =============================================================
-- Bilkul — Record which staff member performed each application action
-- =============================================================
-- Safe to run multiple times. Apply live via the Supabase SQL editor /
-- Management API.
--
-- So admins/employees can see "who did it", every staff-driven status change on
-- an application stamps the actor + time. A BEFORE-UPDATE trigger does this
-- automatically, so it covers every action (select, ship, deliver, approve
-- draft, order approval, review decisions, …) — current and future — without
-- touching each call site. Creator/seller-driven changes (e.g. the creator
-- submitting) are ignored so the field reflects the responsible staff member.
-- =============================================================

alter table public.applications
  add column if not exists last_action_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_action_at timestamptz;

comment on column public.applications.last_action_by is
  'Staff member who made the most recent status change on this application.';

create or replace function public.stamp_application_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and public.is_staff(auth.uid()) then
    new.last_action_by := auth.uid();
    new.last_action_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_application_actor on public.applications;
create trigger trg_stamp_application_actor
  before update on public.applications
  for each row execute function public.stamp_application_actor();
