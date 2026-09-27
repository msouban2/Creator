-- =============================================================
-- Bilkul — Notify staff on internal review-note messages
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- When a staff member posts an internal note on an application/submission, the
-- other people involved are notified so review collaboration doesn't stall:
--   • everyone who has already posted a note on that thread, and
--   • the employee who reviewed / claimed the submission.
-- Automatic "system" log entries never notify (they'd be noise). Uses the
-- existing notifications table; SECURITY DEFINER so it can insert for recipients.
-- =============================================================

create or replace function public.notify_review_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref         bigint;
  v_author_name text;
  v_title       text;
  v_msg         text;
  r             record;
begin
  -- Only human notes notify; skip the auto system/audit entries.
  if NEW.kind = 'system' then
    return NEW;
  end if;

  if NEW.submission_id is not null then
    select ref_no into v_ref from public.campaign_submissions where id = NEW.submission_id;
  end if;
  if v_ref is null then
    select ref_no into v_ref from public.applications where id = NEW.application_id;
  end if;

  select full_name into v_author_name from public.profiles where id = NEW.author_id;

  v_title := 'New internal note on LRMS-' || coalesce(v_ref::text, '') || '-REV';
  v_msg := coalesce(v_author_name, 'Staff') || ': ' || left(NEW.note, 140);

  for r in
    select distinct uid from (
      -- everyone who has already posted a note on this application's thread
      select rn.author_id as uid
      from public.review_notes rn
      where rn.application_id = NEW.application_id
        and rn.kind = 'user'
        and rn.author_id is not null
      union
      -- the employee who reviewed the submission
      select cs.reviewed_by
      from public.campaign_submissions cs
      where cs.id = NEW.submission_id and cs.reviewed_by is not null
      union
      -- the employee currently holding the review claim
      select cs.claimed_by
      from public.campaign_submissions cs
      where cs.id = NEW.submission_id and cs.claimed_by is not null
    ) t
    where uid is not null and uid <> NEW.author_id
  loop
    insert into public.notifications (user_id, title, message, type)
    values (r.uid, v_title, v_msg, 'review');
  end loop;

  return NEW;
end $$;

drop trigger if exists trg_notify_review_note on public.review_notes;
create trigger trg_notify_review_note
  after insert on public.review_notes
  for each row execute function public.notify_review_note();
