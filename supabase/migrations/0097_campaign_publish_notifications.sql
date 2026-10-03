create or replace function public.notify_creators_new_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  insert into public.notifications (user_id, title, message, type, link)
  select p.id,
         'New campaign available',
         coalesce(new.brand_name, 'A brand') || ' launched ' || new.title || '.',
         'campaign',
         '/campaign/' || new.id::text
  from public.profiles p
  where p.role = 'creator';

  return new;
end;
$$;

drop trigger if exists notify_creators_new_campaign_trg on public.campaigns;
create trigger notify_creators_new_campaign_trg
  after insert or update of status on public.campaigns
  for each row execute function public.notify_creators_new_campaign();