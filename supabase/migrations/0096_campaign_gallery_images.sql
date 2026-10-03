alter table public.campaigns
  add column if not exists campaign_images text[] not null default '{}';

comment on column public.campaigns.campaign_images is
  'Additional campaign product/gallery images, separate from the banner and sample screenshots.';