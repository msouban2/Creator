-- =============================================================
-- Bilkul — Staff collaboration: watchers, @mention notifications, reassignment
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Builds on the existing review_notes thread (user + system entries):
--   • application_watchers  — staff can "watch" an application and get notified
--   • notify_users(...)     — staff-callable fan-out into notifications (so an
--                             employee can notify a mentioned teammate / watchers
--                             even though per-row RLS would otherwise block it)
--   • reassign_review(...)  — hand a claimed review to another employee, with a
--                             reason, logged to the thread + notifies the assignee
-- =============================================================

-- ---------- 1. watchers ----------
create table if not exists public.application_watchers (
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (application_id, user_id)
);

alter table public.application_watchers enable row level security;

drop policy if exists "watchers_staff_select" on public.application_watchers;
create policy "watchers_staff_select" on public.application_watchers
  for select using (public.is_staff(auth.uid()));

drop policy if exists "watchers_staff_insert" on public.application_watchers;
create policy "watchers_staff_insert" on public.application_watchers
  for insert with check (public.is_staff(auth.uid()) and (user_id = auth.uid() or public.is_admin(auth.uid())));

drop policy if exists "watchers_staff_delete" on public.application_watchers;
create policy "watchers_staff_delete" on public.application_watchers
  for delete using (user_id = auth.uid() or public.is_admin(auth.uid()));

grant select, insert, delete on public.application_watchers to authenticated;

-- ---------- 2. staff-gated notification fan-out ----------
-- Lets any staff member create notifications for other users (mentions,
-- watcher alerts). SECURITY DEFINER so it isn't blocked by the per-user
-- notifications RLS; still staff-gated and never notifies the caller.
create or replace function public.notify_users(
  p_user_ids uuid[],
  p_title    text,
  p_message  text,
  p_type     text default 'mention'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only staff can send notifications';
  end if;
  insert into public.notifications (user_id, title, message, type)
  select distinct u, p_title, p_message, coalesce(nullif(p_type, ''), 'mention')
  from unnest(p_user_ids) as u
  where u is not null and u <> auth.uid();
end $$;

grant execute on function public.notify_users(uuid[], text, text, text) to authenticated;

-- ---------- 3. reassignment with reason ----------
-- Hands a claimed submission review to another employee, records a system entry
-- on the thread, and notifies the new assignee. Staff-gated.
create or replace function public.reassign_review(
  p_submission uuid,
  p_to         uuid,
  p_reason     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app     uuid;
  v_to_name text;
  v_by_name text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only staff can reassign reviews';
  end if;

  select application_id into v_app from public.campaign_submissions where id = p_submission;
  if v_app is null then
    raise exception 'Submission not found';
  end if;

  update public.campaign_submissions
    set claimed_by = p_to, claimed_at = now()
    where id = p_submission;

  select full_name into v_by_name from public.profiles where id = auth.uid();
  select full_name into v_to_name from public.profiles where id = p_to;

  insert into public.review_notes (application_id, submission_id, author_id, note, kind)
  values (
    v_app, p_submission, null,
    coalesce(v_by_name, 'A teammate') || ' reassigned this review to ' || coalesce(v_to_name, 'a teammate')
      || case when p_reason is not null and length(trim(p_reason)) > 0 then ' — ' || trim(p_reason) else '' end,
    'system'
  );

  if p_to is not null and p_to <> auth.uid() then
    insert into public.notifications (user_id, title, message, type)
    values (p_to, 'Review assigned to you',
      coalesce(v_by_name, 'A teammate') || ' assigned you a submission review.', 'review');
  end if;
end $$;

grant execute on function public.reassign_review(uuid, uuid, text) to authenticated;
