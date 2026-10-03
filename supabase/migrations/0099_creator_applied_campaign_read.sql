drop policy if exists "campaigns_read_existing_creator_app" on public.campaigns;
create policy "campaigns_read_existing_creator_app" on public.campaigns
  for select using (
    exists (
      select 1
      from public.applications a
      where a.campaign_id = campaigns.id
        and a.creator_id = auth.uid()
    )
  );