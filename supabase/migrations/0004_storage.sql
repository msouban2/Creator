-- =============================================================
-- Aaina — Storage Buckets & Policies
-- =============================================================
-- Run after core schema. Creates buckets used by the app.

insert into storage.buckets (id, name, public)
values
  ('avatars',            'avatars',            true),
  ('campaign-images',    'campaign-images',    true),
  ('submission-screenshots', 'submission-screenshots', false),
  ('kyc-documents',      'kyc-documents',      false)
on conflict (id) do nothing;

-- ---------- avatars (public read, owner write) ----------
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------- campaign images (public read, admin write) ----------
drop policy if exists "campaign_images_public_read" on storage.objects;
create policy "campaign_images_public_read" on storage.objects
  for select using (bucket_id = 'campaign-images');

drop policy if exists "campaign_images_admin_write" on storage.objects;
create policy "campaign_images_admin_write" on storage.objects
  for all using (bucket_id = 'campaign-images' and public.is_admin(auth.uid()))
  with check (bucket_id = 'campaign-images' and public.is_admin(auth.uid()));

-- ---------- submission screenshots (private, owner + admin) ----------
drop policy if exists "submissions_owner_read" on storage.objects;
create policy "submissions_owner_read" on storage.objects
  for select using (
    bucket_id = 'submission-screenshots'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin(auth.uid()))
  );

drop policy if exists "submissions_owner_write" on storage.objects;
create policy "submissions_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'submission-screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------- kyc documents (private, owner + admin) ----------
drop policy if exists "kyc_owner_read" on storage.objects;
create policy "kyc_owner_read" on storage.objects
  for select using (
    bucket_id = 'kyc-documents'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin(auth.uid()))
  );

drop policy if exists "kyc_owner_write" on storage.objects;
create policy "kyc_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'kyc-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
