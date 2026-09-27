-- 0068_reimbursement_order_flow.sql
-- =============================================================
-- Bilkul — Reimbursement flow rework
-- =============================================================
-- New creator/employee stages for reimbursement campaigns:
--   selected
--     -> (creator taps the product link: 15-min order window starts)
--   ordered            (creator uploaded the order screenshot)
--   order_approved     (employee confirmed the order is correct)
--   submitted          (creator submitted their review)
--   review             (employee approved the review submission)
--   payment_in_progress(payout being processed)
--   completed          (payout released to wallet)
--
-- Safe to run multiple times. Applied live via the Management API.
-- =============================================================

-- ---------- 1. new status values ----------
alter type public.application_status add value if not exists 'ordered';
alter type public.application_status add value if not exists 'order_approved';
alter type public.application_status add value if not exists 'payment_in_progress';

-- ---------- 2. order window timestamp ----------
-- Set to now() when the creator taps the product link; the 15-minute order
-- deadline and the 24-hour retry cooldown are derived from it on the client.
alter table public.applications
  add column if not exists order_started_at timestamptz;

-- ---------- 3. allow the creator to move selected -> ordered ----------
-- (staff bypass the guard entirely; order_approved / review / payment_in_progress
-- / completed remain staff-only transitions.)
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
       'ordered', 'product_received', 'draft_submitted', 'link_submitted', 'submitted'
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
