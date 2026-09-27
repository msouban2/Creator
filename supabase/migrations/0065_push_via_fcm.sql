-- =============================================================
-- Bilkul — Route push through the send-push edge function (FCM v1)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Replaces the Expo Push API call with our send-push edge function, which
-- delivers to Android devices directly via FCM v1. The shared internal key is
-- read from Vault (never stored in this migration).
-- =============================================================

create or replace function public.send_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if new.user_id is null then
    return new;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'internal_push_key'
  limit 1;

  if v_key is null then
    return new;
  end if;

  perform net.http_post(
    url     := 'https://pixvgmumhsodffjlwxlp.supabase.co/functions/v1/send-push',
    body    := jsonb_build_object(
                 'user_id', new.user_id,
                 'title',   new.title,
                 'body',    coalesce(new.message, ''),
                 'link',    coalesce(new.link, ''),
                 'type',    coalesce(new.type, 'general')
               ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-key', v_key)
  );

  return new;
end $$;

-- Trigger already exists from 0064; ensure it's present.
drop trigger if exists send_push_on_notification_trg on public.notifications;
create trigger send_push_on_notification_trg
  after insert on public.notifications
  for each row execute function public.send_push_on_notification();
