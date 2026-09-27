-- =============================================================
-- Bilkul — Campaign platform (shopping platform picker)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- The Create/Edit Campaign form now has an explicit "Platform" field
-- (Amazon, Flipkart, Nykaa, Purplle, Ajio, Website, Google, or a custom
-- value typed by staff). Previously the platform was only inferred from
-- the product URL. This stores the chosen platform on the campaign.
-- =============================================================

alter table public.campaigns
  add column if not exists platform text;
