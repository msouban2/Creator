-- 0012_campaign_seller_name.sql
-- Internal "seller name" for a campaign, filled by staff when creating/editing a
-- campaign. It is visible to the assigned seller (in their Performance view) but
-- is NOT shown to creators/users in the mobile app.

alter table public.campaigns
  add column if not exists seller_name text;

comment on column public.campaigns.seller_name is
  'Internal seller name entered by staff. Shown to the assigned seller, hidden from creators.';
