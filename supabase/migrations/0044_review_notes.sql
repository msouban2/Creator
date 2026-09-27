-- =============================================================
-- Bilkul — Internal review notes thread (staff collaboration)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Lets employees and admins leave a running thread of internal notes on a
-- creator's application/submission so they can coordinate a review, e.g.
-- an admin writes "review again, caption is wrong" and the employee replies
-- "corrected, please release payment". Notes are INTERNAL and only visible
-- to staff (admins + employees); creators never see them.
-- =============================================================

create table if not exists public.review_notes (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  submission_id  uuid references public.campaign_submissions(id) on delete set null,
  author_id      uuid not null references public.profiles(id) on delete set null,
  note           text not null,
  created_at     timestamptz not null default now()
);

create index if not exists review_notes_application_id_idx
  on public.review_notes (application_id, created_at);

alter table public.review_notes enable row level security;

-- Only staff can read internal notes.
drop policy if exists "review_notes_staff_select" on public.review_notes;
create policy "review_notes_staff_select" on public.review_notes
  for select using (public.is_staff(auth.uid()));

-- Only staff can add a note, and only as themselves.
drop policy if exists "review_notes_staff_insert" on public.review_notes;
create policy "review_notes_staff_insert" on public.review_notes
  for insert with check (public.is_staff(auth.uid()) and author_id = auth.uid());

-- A note author (or an admin) can edit/delete their own note.
drop policy if exists "review_notes_author_update" on public.review_notes;
create policy "review_notes_author_update" on public.review_notes
  for update using (author_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "review_notes_author_delete" on public.review_notes;
create policy "review_notes_author_delete" on public.review_notes
  for delete using (author_id = auth.uid() or public.is_admin(auth.uid()));

grant select, insert, update, delete on public.review_notes to authenticated;
