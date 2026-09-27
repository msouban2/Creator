-- =============================================================
-- Bilkul — Push notifications: device tokens + auto-send on notify
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Stores each device's Expo push token, and sends a push through the Expo Push
-- API (via pg_net) whenever a notifications row is inserted. Delivery to the
-- device is handled by Expo -> FCM (Android) / APNs (iOS).
-- =============================================================

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  platform   text,
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_own_select" on public.push_tokens;
create policy "push_tokens_own_select" on public.push_tokens
  for select using (user_id = auth.uid());

drop policy if exists "push_tokens_own_insert" on public.push_tokens;
create policy "push_tokens_own_insert" on public.push_tokens
  for insert with check (user_id = auth.uid());

drop policy if exists "push_tokens_own_update" on public.push_tokens;
create policy "push_tokens_own_update" on public.push_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push_tokens_own_delete" on public.push_tokens;
create policy "push_tokens_own_delete" on public.push_tokens
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.push_tokens to authenticated;

-- ---------- send a push whenever a notification is created ----------
create or replace function public.send_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_messages jsonb;
begin
  if new.user_id is null then
    return new;
  end if;

  -- Build one Expo push message per device token for this user.
  select jsonb_agg(
           jsonb_build_object(
             'to', t.token,
             'title', new.title,
             'body', coalesce(new.message, ''),
             'sound', 'default',
             'channelId', 'default',
             'priority', 'high',
             'data', jsonb_build_object('link', coalesce(new.link, ''), 'type', coalesce(new.type, 'general'))
           )
         )
    into v_messages
  from public.push_tokens t
  where t.user_id = new.user_id;

  if v_messages is null then
    return new;
  end if;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    body    := v_messages,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json')
  );

  return new;
end $$;

drop trigger if exists send_push_on_notification_trg on public.notifications;
create trigger send_push_on_notification_trg
  after insert on public.notifications
  for each row execute function public.send_push_on_notification();
