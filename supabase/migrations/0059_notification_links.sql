-- =============================================================
-- Bilkul — Deep-link notifications to their order/review
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Adds a `link` on notifications and sets it from the order/review triggers so
-- clicking a notification jumps straight to the relevant LRMS record.
--   • order-comment  -> /sellers?ref=<n>       (staff) — filters to that order
--                       /seller-orders?ref=<n> (seller)
--   • review-note    -> /submissions?ref=<n>   (staff) — filters to that review
-- The frontend reads ?ref=<n> to prefill the search box on those pages.
-- =============================================================

alter table public.notifications
  add column if not exists link text;

-- ---------- order-comment trigger (deep link by recipient role) ----------
create or replace function public.notify_order_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_ref    bigint;
  v_title  text;
  v_msg    text;
  r        record;
begin
  select c.seller_id, a.ref_no
    into v_seller, v_ref
  from public.applications a
  join public.campaigns c on c.id = a.campaign_id
  where a.id = NEW.application_id;

  v_title := 'New message on LRMS-' || coalesce(v_ref::text, '') || '-SHIP';
  v_msg := coalesce(NEW.author_name, 'Someone') || ': ' || left(NEW.body, 140);

  -- 1) Notify the seller (unless the seller wrote it) — link to their orders page.
  if v_seller is not null and v_seller <> NEW.author_id then
    insert into public.notifications (user_id, title, message, type, link)
    values (v_seller, v_title, v_msg, 'order', '/seller-orders?ref=' || coalesce(v_ref::text, ''));
  end if;

  -- 2) Notify staff already on this thread (excluding the author).
  for r in
    select distinct oc.author_id
    from public.order_comments oc
    where oc.application_id = NEW.application_id
      and oc.author_role = 'staff'
      and oc.author_id is not null
      and oc.author_id <> NEW.author_id
  loop
    insert into public.notifications (user_id, title, message, type, link)
    values (r.author_id, v_title, v_msg, 'order', '/sellers?ref=' || coalesce(v_ref::text, ''));
  end loop;

  -- 3) First message from a seller with no staff on the thread yet -> route to
  --    the seller-handling employees (and admins).
  if NEW.author_role = 'seller' and not exists (
    select 1 from public.order_comments oc
    where oc.application_id = NEW.application_id
      and oc.author_role = 'staff'
      and oc.author_id is not null
      and oc.author_id <> NEW.author_id
  ) then
    for r in
      select p.id
      from public.profiles p
      where p.role = 'admin'
         or (p.role = 'employee' and coalesce(p.permissions, '{}') @> array['sellers']::text[])
    loop
      insert into public.notifications (user_id, title, message, type, link)
      values (r.id, v_title, v_msg, 'order', '/sellers?ref=' || coalesce(v_ref::text, ''));
    end loop;
  end if;

  return NEW;
end $$;

-- ---------- review-note trigger (deep link to the review) ----------
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
  v_link        text;
  r             record;
begin
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
  v_link := '/submissions?ref=' || coalesce(v_ref::text, '');

  for r in
    select distinct uid from (
      select rn.author_id as uid
      from public.review_notes rn
      where rn.application_id = NEW.application_id
        and rn.kind = 'user'
        and rn.author_id is not null
      union
      select cs.reviewed_by
      from public.campaign_submissions cs
      where cs.id = NEW.submission_id and cs.reviewed_by is not null
      union
      select cs.claimed_by
      from public.campaign_submissions cs
      where cs.id = NEW.submission_id and cs.claimed_by is not null
    ) t
    where uid is not null and uid <> NEW.author_id
  loop
    insert into public.notifications (user_id, title, message, type, link)
    values (r.uid, v_title, v_msg, 'review', v_link);
  end loop;

  return NEW;
end $$;
