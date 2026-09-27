-- 0078_welcome_notification.sql
-- =============================================================
-- Greet every new creator with a friendly welcome notification.
-- =============================================================
-- Redefines handle_new_user() (last set in 0076) so that, right after the
-- creator's profile is created, we drop a warm welcome message into their
-- notifications feed. It's the first thing they see in the app.
--
-- Safe to run multiple times.
-- =============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref_code    text;
  referrer    uuid;
  meta_niches text[];
  first_name  text;
begin
  referrer := null;
  ref_code := coalesce(new.raw_user_meta_data->>'referred_by_code', null);
  if ref_code is not null then
    select id into referrer from public.profiles where referral_code = ref_code limit 1;
  end if;

  -- Safely turn the metadata `niches` JSON array into a text[] (empty if absent).
  meta_niches := coalesce(
    (
      select array_agg(value)
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(new.raw_user_meta_data->'niches') = 'array'
            then new.raw_user_meta_data->'niches'
          else '[]'::jsonb
        end
      ) as value
    ),
    '{}'
  );

  insert into public.profiles (
    id, role, full_name, email, phone,
    instagram_username, instagram_url, instagram_followers,
    youtube_channel, youtube_subscribers, profile_image,
    referral_code, referred_by, niches
  ) values (
    new.id,
    'creator',                       -- SECURITY: role is never taken from metadata
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'instagram_username',
    new.raw_user_meta_data->>'instagram_url',
    coalesce((new.raw_user_meta_data->>'instagram_followers')::int, 0),
    new.raw_user_meta_data->>'youtube_channel',
    coalesce((new.raw_user_meta_data->>'youtube_subscribers')::int, 0),
    new.raw_user_meta_data->>'profile_image',
    public.generate_referral_code(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone'),
    referrer,
    meta_niches
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;

  if referrer is not null then
    insert into public.referrals (referrer_id, referred_creator_id)
    values (referrer, new.id)
    on conflict (referred_creator_id) do nothing;
  end if;

  -- Warm welcome — the creator's very first notification.
  first_name := split_part(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'there'), ' ', 1);
  insert into public.notifications (user_id, title, message, type)
  values (
    new.id,
    '🎉 Welcome to Bilkul, ' || first_name || '!',
    'Your creator journey starts now. Explore campaigns, apply to the ones you love, and start earning from brand collaborations. We''re glad you''re here! 💖',
    'general'
  );

  return new;
end $$;
