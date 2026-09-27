-- =============================================================
-- Bilkul — System (audit) entries in the internal notes thread
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Turns the staff notes thread into an LRMS-style log: alongside the manual
-- notes staff type, key lifecycle actions are recorded automatically as
-- "system" entries (e.g. "Selected applicant", "Marked shipped", "Approved
-- submission"). System entries have no human author and are rendered distinctly.
-- =============================================================

alter table public.review_notes
  add column if not exists kind text not null default 'user'; -- 'user' | 'system'

-- System entries have no human author.
alter table public.review_notes alter column author_id drop not null;

-- Records an automatic system entry on the thread. SECURITY DEFINER so the
-- insert isn't blocked by the author-must-be-me policy; still staff-gated.
create or replace function public.log_review_event(
  p_application uuid,
  p_submission  uuid,
  p_message     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only staff can log review events';
  end if;
  insert into public.review_notes (application_id, submission_id, author_id, note, kind)
  values (p_application, p_submission, null, p_message, 'system');
end $$;

grant execute on function public.log_review_event(uuid, uuid, text) to authenticated;
