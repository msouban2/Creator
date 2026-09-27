-- 0018_seller_shipping_and_media.sql
-- Sellers get to (a) VIEW the review media — screenshots + videos + order proof —
-- for creators in their own campaigns, and (b) keep seeing engagement, all WITHOUT
-- learning who the creator is. Private-bucket objects are stored under
-- `{creatorId}/...`, so seller read access is scoped by that folder belonging to a
-- creator who applied to one of the seller's campaigns.

-- ---------- safe folder-ownership check (handles non-uuid folders) ----------
create or replace function public.seller_can_see_creator_folder(p_folder text, p_seller uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v uuid;
begin
  begin
    v := p_folder::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1
    from public.applications a
    join public.campaigns c on c.id = a.campaign_id
    where a.creator_id = v and c.seller_id = p_seller
  );
end $$;

grant execute on function public.seller_can_see_creator_folder(text, uuid) to authenticated;

-- ---------- storage: sellers can READ review media for their campaigns --------
drop policy if exists "submission_screens_seller_read" on storage.objects;
create policy "submission_screens_seller_read" on storage.objects
  for select using (
    bucket_id = 'submission-screenshots'
    and public.seller_can_see_creator_folder((storage.foldername(name))[1], auth.uid())
  );

drop policy if exists "submission_videos_seller_read" on storage.objects;
create policy "submission_videos_seller_read" on storage.objects
  for select using (
    bucket_id = 'submission-videos'
    and public.seller_can_see_creator_folder((storage.foldername(name))[1], auth.uid())
  );

drop policy if exists "purchase_orders_seller_read" on storage.objects;
create policy "purchase_orders_seller_read" on storage.objects
  for select using (
    bucket_id = 'purchase-orders'
    and public.seller_can_see_creator_folder((storage.foldername(name))[1], auth.uid())
  );

-- ---------- anonymize seller_creators(): engagement only, no name/handle -------
drop function if exists public.seller_creators();
create or replace function public.seller_creators()
returns table (
  id                  uuid,
  instagram_followers integer,
  ig_avg_views        integer
) language sql stable security definer set search_path = public as $$
  select distinct p.id, p.instagram_followers, p.ig_avg_views
  from public.profiles p
  join public.applications a on a.creator_id = p.id
  join public.campaigns c on c.id = a.campaign_id
  where c.seller_id = auth.uid();
$$;

grant execute on function public.seller_creators() to authenticated;
