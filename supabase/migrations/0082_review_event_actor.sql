-- =============================================================
-- Bilkul — Attribute review/lifecycle actions to the staff member
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- The internal notes thread already records key lifecycle actions as "system"
-- entries (e.g. "Marked shipped", "Approved draft video"), but with no author,
-- so we couldn't tell WHO performed each action. Add an `actor_id` that records
-- the acting staff member on every logged event, powering a review activity
-- report (who reviewed what, when).
-- =============================================================

alter table public.review_notes
  add column if not exists actor_id uuid references public.profiles(id) on delete set null;

create index if not exists review_notes_actor_id_idx
  on public.review_notes (actor_id, created_at);

-- Record the acting staff member (auth.uid()) as the actor on each system entry.
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
  insert into public.review_notes (application_id, submission_id, author_id, actor_id, note, kind)
  values (p_application, p_submission, null, auth.uid(), p_message, 'system');
end $$;

grant execute on function public.log_review_event(uuid, uuid, text) to authenticated;
