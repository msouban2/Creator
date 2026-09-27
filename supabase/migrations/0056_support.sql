-- =============================================================
-- Bilkul — In-app support tickets (creator ⇄ staff)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Creators raise a support ticket (subject + first message) from the app; staff
-- see every ticket in the admin Support inbox, reply, and mark it resolved.
-- Each message notifies the other side. Threads are private to the ticket owner
-- and staff.
-- =============================================================

create table if not exists public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  subject         text not null,
  category        text,
  status          text not null default 'open', -- 'open' | 'resolved'
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists support_tickets_user_idx on public.support_tickets (user_id, last_message_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, last_message_at desc);

create table if not exists public.support_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- ---------- tickets RLS ----------
drop policy if exists "support_tickets_select" on public.support_tickets;
create policy "support_tickets_select" on public.support_tickets
  for select using (user_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists "support_tickets_insert" on public.support_tickets;
create policy "support_tickets_insert" on public.support_tickets
  for insert with check (user_id = auth.uid());

-- Only staff change status (resolve/reopen).
drop policy if exists "support_tickets_update" on public.support_tickets;
create policy "support_tickets_update" on public.support_tickets
  for update using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

grant select, insert, update on public.support_tickets to authenticated;

-- ---------- messages RLS ----------
drop policy if exists "support_messages_select" on public.support_messages;
create policy "support_messages_select" on public.support_messages
  for select using (
    public.is_staff(auth.uid())
    or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

drop policy if exists "support_messages_insert" on public.support_messages;
create policy "support_messages_insert" on public.support_messages
  for insert with check (
    author_id = auth.uid()
    and (
      public.is_staff(auth.uid())
      or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
    )
  );

grant select, insert on public.support_messages to authenticated;

-- ---------- notify + bump on each new message ----------
create or replace function public.support_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.support_tickets where id = new.ticket_id;

  -- Keep the ticket sorted by activity; a creator reply reopens a resolved one.
  update public.support_tickets
    set last_message_at = now(),
        status = case when status = 'resolved' and new.author_id = v_owner then 'open' else status end
    where id = new.ticket_id;

  if new.author_id = v_owner then
    -- Creator wrote → alert admins.
    insert into public.notifications (user_id, title, message, type)
    select p.id, 'New support message', 'A creator sent a support message.', 'support'
    from public.profiles p
    where p.role = 'admin';
  else
    -- Staff wrote → alert the ticket owner.
    insert into public.notifications (user_id, title, message, type)
    values (v_owner, 'Support replied', 'Our team replied to your support request.', 'support');
  end if;

  return new;
end $$;

drop trigger if exists support_on_message_trg on public.support_messages;
create trigger support_on_message_trg
  after insert on public.support_messages
  for each row execute function public.support_on_message();
