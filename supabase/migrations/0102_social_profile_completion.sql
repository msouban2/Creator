create or replace function public.complete_social_profile(
  p_niches text[],
  p_referral_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_niches text[];
  v_code text;
  v_existing_referrer_id uuid;
  v_referrer_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select array_agg(distinct btrim(selected_niche))
    into v_niches
  from unnest(coalesce(p_niches, '{}'::text[])) as selected(selected_niche)
  where btrim(selected_niche) <> '';

  if coalesce(cardinality(v_niches), 0) not between 1 and 3 then
    raise exception 'Choose between one and three niches.' using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from unnest(v_niches) as selected(selected_niche)
    where selected_niche not in (
      'Fashion', 'Beauty', 'Tech', 'Food', 'Fitness', 'Travel', 'Lifestyle',
      'Gaming', 'Health & Wellness', 'Finance', 'Education', 'Entertainment',
      'Parenting', 'Home & Decor', 'Automobile', 'Photography', 'Comedy', 'Music'
    )
  ) then
    raise exception 'One or more selected niches are invalid.' using errcode = 'check_violation';
  end if;

  select referred_by
    into v_existing_referrer_id
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  v_code := upper(btrim(coalesce(p_referral_code, '')));
  if v_code <> '' then
    if v_existing_referrer_id is not null then
      if not exists (
        select 1 from public.profiles
        where id = v_existing_referrer_id and upper(referral_code) = v_code
      ) then
        raise exception 'A referral code has already been applied to this account.';
      end if;
      v_referrer_id := v_existing_referrer_id;
    else
      select id
        into v_referrer_id
      from public.profiles
      where upper(referral_code) = v_code
        and id <> v_user_id
      limit 1;

      if v_referrer_id is null then
        raise exception 'Referral code not found.';
      end if;
    end if;
  end if;

  update public.profiles
  set niches = v_niches,
      referred_by = coalesce(v_existing_referrer_id, v_referrer_id)
  where id = v_user_id;

  if v_referrer_id is not null then
    insert into public.referrals (referrer_id, referred_creator_id)
    values (v_referrer_id, v_user_id)
    on conflict (referred_creator_id) do nothing;
  end if;
end;
$$;

revoke all on function public.complete_social_profile(text[], text) from public;
grant execute on function public.complete_social_profile(text[], text) to authenticated;
