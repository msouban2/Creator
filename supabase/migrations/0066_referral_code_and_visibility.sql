-- 0066_referral_code_and_visibility.sql
-- 1) Referral codes derived from the creator's name + phone number (unique).
-- 2) Let a referrer see ONLY the creators they referred (name + avatar + their
--    campaign progress) via security-definer RPCs — without exposing those
--    creators' private data to anyone else.

-- ---------------------------------------------------------------------------
-- 1) Name+number referral code
-- ---------------------------------------------------------------------------
create or replace function public.generate_referral_code(p_name text, p_phone text)
returns text language plpgsql as $$
declare
  namepart text;
  numpart  text;
  base     text;
  code     text;
  tries    int := 0;
begin
  -- Letters from the name, uppercased, first 4 (fallback "BLKL").
  namepart := upper(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z]', '', 'g'));
  if length(namepart) < 2 then
    namepart := 'BLKL';
  end if;
  namepart := substr(namepart, 1, 4);

  -- Last 4 digits of the phone number (fallback: random 4 digits).
  numpart := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if length(numpart) >= 4 then
    numpart := right(numpart, 4);
  else
    numpart := lpad((floor(random() * 10000))::int::text, 4, '0');
  end if;

  base := namepart || numpart;
  code := base;

  -- Ensure uniqueness; append short random suffix on collision.
  loop
    exit when not exists (select 1 from public.profiles where referral_code = code);
    tries := tries + 1;
    code := base || upper(substr(md5(gen_random_uuid()::text), 1, 2));
    if tries > 20 then
      code := base || upper(substr(md5(gen_random_uuid()::text), 1, 4));
      exit;
    end if;
  end loop;

  return code;
end $$;

-- Point new-user creation at the name+number generator.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref_code    text;
  referrer    uuid;
begin
  referrer := null;
  ref_code := coalesce(new.raw_user_meta_data->>'referred_by_code', null);
  if ref_code is not null then
    select id into referrer from public.profiles where referral_code = ref_code limit 1;
  end if;

  insert into public.profiles (
    id, role, full_name, email, phone,
    instagram_username, instagram_url, instagram_followers,
    youtube_channel, youtube_subscribers, profile_image,
    referral_code, referred_by
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
    referrer
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

-- Backfill existing creators to the new name+number format (unique per creator).
do $$
declare rec record;
begin
  for rec in select id, full_name, phone from public.profiles loop
    update public.profiles
      set referral_code = public.generate_referral_code(rec.full_name, rec.phone)
      where id = rec.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Referrer-only visibility of referred creators (safe fields only)
-- ---------------------------------------------------------------------------

-- List of creators the caller referred: name + avatar only.
create or replace function public.get_my_referrals()
returns table (
  id                  uuid,
  referred_creator_id uuid,
  full_name           text,
  profile_image       text,
  created_at          timestamptz
) language sql security definer set search_path = public stable as $$
  select r.id, r.referred_creator_id, p.full_name, p.profile_image, r.created_at
  from public.referrals r
  join public.profiles p on p.id = r.referred_creator_id
  where r.referrer_id = auth.uid()
  order by r.created_at desc;
$$;

-- One referred creator's public-ish detail + their campaign progress.
-- Returns null if the referral does not belong to the caller.
create or replace function public.get_referral_detail(p_referral_id uuid)
returns json language plpgsql security definer set search_path = public stable as $$
declare
  v record;
  v_result json;
begin
  select r.id, r.referrer_id, r.referred_creator_id, r.created_at,
         p.full_name, p.profile_image
    into v
  from public.referrals r
  join public.profiles p on p.id = r.referred_creator_id
  where r.id = p_referral_id and r.referrer_id = auth.uid();

  if not found then
    return null;
  end if;

  select json_build_object(
    'id', v.id,
    'referrer_id', v.referrer_id,
    'referred_creator_id', v.referred_creator_id,
    'created_at', v.created_at,
    'full_name', v.full_name,
    'profile_image', v.profile_image,
    'totalCompleted', (
      select count(*) from public.applications a
      where a.creator_id = v.referred_creator_id and a.status = 'completed'
    ),
    'breakdown', coalesce((
      select json_object_agg(t.campaign_type,
               json_build_object('complete', t.complete, 'inProcess', t.in_process))
      from (
        select c.campaign_type::text as campaign_type,
               count(*) filter (where a.status = 'completed') as complete,
               count(*) filter (where a.status not in ('completed', 'rejected')) as in_process
        from public.applications a
        join public.campaigns c on c.id = a.campaign_id
        where a.creator_id = v.referred_creator_id
        group by c.campaign_type
      ) t
    ), '{}'::json)
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.get_my_referrals() to authenticated;
grant execute on function public.get_referral_detail(uuid) to authenticated;
