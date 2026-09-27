-- =============================================================
-- Bilkul — Notify on order-thread messages (seller ⇄ employee)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- When someone posts on an order thread, the other side is notified:
--   • a seller's message  -> the staff already on the thread (or, if none yet,
--     the seller-handling employees + admins);
--   • an employee's message -> the seller who owns the campaign, plus any other
--     staff already on that thread.
-- Uses the existing notifications table (each user reads their own). The trigger
-- is SECURITY DEFINER so it can insert notifications for the recipients.
-- =============================================================

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

  -- 1) Notify the seller (unless the seller wrote it).
  if v_seller is not null and v_seller <> NEW.author_id then
    insert into public.notifications (user_id, title, message, type)
    values (v_seller, v_title, v_msg, 'order');
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
    insert into public.notifications (user_id, title, message, type)
    values (r.author_id, v_title, v_msg, 'order');
  end loop;

  -- 3) First message from a seller with no staff on the thread yet -> route to
  --    the seller-handling employees (and admins) so someone picks it up.
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
      insert into public.notifications (user_id, title, message, type)
      values (r.id, v_title, v_msg, 'order');
    end loop;
  end if;

  return NEW;
end $$;

drop trigger if exists trg_notify_order_comment on public.order_comments;
create trigger trg_notify_order_comment
  after insert on public.order_comments
  for each row execute function public.notify_order_comment();
