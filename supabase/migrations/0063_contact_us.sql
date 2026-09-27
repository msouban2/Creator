-- =============================================================
-- Bilkul — Contact Us: query details + optional screenshot
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- The creator "Contact Us" form captures a category, a query, their contact
-- details, and an optional screenshot. Staff read this and reply via WhatsApp /
-- email (no in-app messaging).
-- =============================================================

alter table public.support_tickets
  add column if not exists contact_email text,
  add column if not exists contact_name  text,
  add column if not exists contact_phone text,
  add column if not exists image_url     text,
  add column if not exists query         text;

-- ---------- public bucket for the optional issue screenshot ----------
insert into storage.buckets (id, name, public)
values ('support-images', 'support-images', true)
on conflict (id) do nothing;

drop policy if exists "support_images_insert" on storage.objects;
create policy "support_images_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'support-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "support_images_select" on storage.objects;
create policy "support_images_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'support-images');

drop policy if exists "support_images_delete" on storage.objects;
create policy "support_images_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'support-images' and (storage.foldername(name))[1] = auth.uid()::text);
