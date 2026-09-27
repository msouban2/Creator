-- =============================================================
-- Bilkul — Deep-link the remaining notifications (support, campaign requests,
-- mentions/watchers) so clicking a notification opens the right page.
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
-- =============================================================

-- ---------- Support messages -> /support (staff side) ----------
create or replace function public.support_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.support_tickets where id = new.ticket_id;

  update public.support_tickets
    set last_message_at = now(),
        status = case when status = 'resolved' and new.author_id = v_owner then 'open' else status end
    where id = new.ticket_id;

  if new.author_id = v_owner then
    -- Creator wrote → alert admins, link to the Support queue.
    insert into public.notifications (user_id, title, message, type, link)
    select p.id, 'New support message', 'A creator sent a support message.', 'support', '/support?id=' || new.ticket_id
    from public.profiles p
    where p.role = 'admin';
  else
    -- Staff wrote → alert the ticket owner (creator, mobile — no admin link).
    insert into public.notifications (user_id, title, message, type)
    values (v_owner, 'Support replied', 'Our team replied to your support request.', 'support');
  end if;

  return new;
end $$;

-- ---------- Campaign requests -> /campaign-requests (staff) | /seller-campaigns (seller) ----------
create or replace function public.campaign_request_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seller text;
begin
  select full_name into v_seller from public.profiles where id = new.seller_id;
  insert into public.notifications (user_id, title, message, type, link)
  select p.id, 'New campaign request',
    coalesce(v_seller, 'A seller') || ' requested a campaign for ' || new.brand_name
      || ' (' || new.slots || ' slot' || case when new.slots = 1 then '' else 's' end || ').',
    'campaign_request', '/campaign-requests?id=' || new.id
  from public.profiles p where p.role = 'admin';
  return new;
end $$;

create or replace function public.campaign_request_on_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    insert into public.notifications (user_id, title, message, type, link)
    values (
      new.seller_id,
      'Campaign request ' || new.status,
      'Your campaign request for ' || new.brand_name || ' was ' || new.status
        || case when new.admin_note is not null and length(btrim(new.admin_note)) > 0 then ' — ' || new.admin_note else '' end || '.',
      'campaign_request', '/seller-campaigns?id=' || new.id
    );
  end if;
  return new;
end $$;

create or replace function public.campaign_request_message_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select seller_id into v_owner from public.campaign_requests where id = new.request_id;
  if new.author_id = v_owner then
    insert into public.notifications (user_id, title, message, type, link)
    select p.id, 'New message on a campaign request', 'A seller replied on their campaign request.', 'campaign_request', '/campaign-requests?id=' || new.request_id
    from public.profiles p where p.role = 'admin';
  else
    insert into public.notifications (user_id, title, message, type, link)
    values (v_owner, 'Reply on your campaign request', 'Our team replied on your campaign request.', 'campaign_request', '/seller-campaigns?id=' || new.request_id);
  end if;
  return new;
end $$;

-- ---------- @mentions / watchers -> deep link to the item (optional link arg) ----------
create or replace function public.notify_users(
  p_user_ids uuid[],
  p_title    text,
  p_message  text,
  p_type     text default 'mention',
  p_link     text default null
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
  insert into public.notifications (user_id, title, message, type, link)
  select distinct u, p_title, p_message, coalesce(nullif(p_type, ''), 'mention'), p_link
  from unnest(p_user_ids) as u
  where u is not null and u <> auth.uid();
end $$;

grant execute on function public.notify_users(uuid[], text, text, text, text) to authenticated;
