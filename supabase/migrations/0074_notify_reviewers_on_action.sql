-- =============================================================
-- Bilkul — Targeted "needs your action" notifications for reviewers
-- =============================================================
-- Safe to run multiple times. Apply live via the Supabase SQL editor /
-- Management API.
--
-- Problem: when a creator (or seller) hands work to the review team, nobody was
-- alerted — the item just quietly appeared in the Review Queue. This adds a
-- notification that goes ONLY to the staff who own that work:
--   • every admin (they oversee all types), and
--   • employees whose assigned review_types include the campaign's type.
-- So a reimbursement reviewer is pinged about reimbursement work, not barter or
-- paid, and vice-versa — each person gets their own notifications, not all.
--
-- Fires on the creator/seller-driven hand-off statuses only (so employee-driven
-- transitions like "shipped" don't create noise):
--   applied         -> new applicant to Select / Reject
--   ordered         -> (reimbursement) order screenshot to check
--   submitted       -> content submitted for review
--   link_submitted  -> (paid) reel link to verify
--   draft_submitted -> (paid) draft video to review
-- =============================================================

create or replace function public.notify_reviewers_on_app_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type    text;
  v_ref     bigint;
  v_creator text;
  v_title   text;
  v_msg     text;
  v_link    text;
begin
  -- Only when the status actually became one of the hand-off statuses.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('applied', 'ordered', 'submitted', 'link_submitted', 'draft_submitted') then
    return new;
  end if;

  select c.campaign_type::text, a.ref_no
    into v_type, v_ref
  from public.applications a
  join public.campaigns c on c.id = a.campaign_id
  where a.id = new.id;

  -- Keep each status to the flow it belongs to.
  if new.status = 'ordered' and v_type is distinct from 'reimbursement' then
    return new;
  end if;
  if new.status in ('link_submitted', 'draft_submitted') and v_type is distinct from 'paid' then
    return new;
  end if;

  select full_name into v_creator from public.profiles where id = new.creator_id;
  v_msg := coalesce(v_creator, 'A creator');

  if new.status = 'applied' then
    v_title := 'New application to review';
    v_msg := v_msg || ' applied and is waiting to be selected.';
  elsif new.status = 'ordered' then
    v_title := 'Order screenshot to check';
    v_msg := v_msg || ' uploaded their order screenshot — approve or reject the order.';
  elsif new.status = 'submitted' then
    v_title := 'Content submitted for review';
    v_msg := v_msg || ' submitted their content for review.';
  elsif new.status = 'link_submitted' then
    v_title := 'Reel link to verify';
    v_msg := v_msg || ' submitted their reel link — verify it.';
  elsif new.status = 'draft_submitted' then
    v_title := 'Draft to review';
    v_msg := v_msg || ' submitted a draft video — approve or request changes.';
  end if;

  v_link := '/review-queue';

  -- Recipients: admins + employees assigned to this campaign type. Skip the
  -- person who caused the change (e.g. an admin manually advancing the status).
  insert into public.notifications (user_id, title, message, type, link)
  select p.id, v_title, v_msg, 'review', v_link
  from public.profiles p
  where (
          p.role = 'admin'
          or (p.role = 'employee' and v_type = any(coalesce(p.review_types, '{}')))
        )
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  return new;
end $$;

drop trigger if exists trg_notify_reviewers_on_app_action on public.applications;
create trigger trg_notify_reviewers_on_app_action
  after insert or update of status on public.applications
  for each row execute function public.notify_reviewers_on_app_action();
