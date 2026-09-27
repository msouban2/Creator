-- 0076_creator_niches.sql
-- =============================================================
-- Creator content niches (multi-select) for better applicant fit.
-- =============================================================
-- Creators can now tag one or more content niches (Fashion, Beauty, Tech, …)
-- on their profile. Employers/admins see these on barter & paid applicants so
-- they can judge whether the creator fits the campaign before selecting them.
--
-- Stored as a text[] so a creator can belong to multiple categories.
-- =============================================================

alter table public.profiles
  add column if not exists niches text[] not null default '{}';

-- Let a creator pick their niches at signup: the mobile client passes a
-- `niches` JSON array in the auth metadata, which we copy into the profile row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref_code    text;
  referrer    uuid;
  meta_niches text[];
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

  return new;
end $$;
