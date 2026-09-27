-- 0020_address_phone.sql
-- Adds a delivery phone number to creator shipping addresses so sellers can
-- ship barter/paid orders (couriers require a contact number).

alter table public.creator_addresses
  add column if not exists phone text;

comment on column public.creator_addresses.phone is
  'Delivery contact phone number for this shipping address.';
