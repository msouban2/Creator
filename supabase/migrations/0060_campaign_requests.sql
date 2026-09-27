-- =============================================================
-- Bilkul — Seller campaign quote/requests
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- A seller requests their next campaign (brand, slots, budget / money per slot,
-- etc.). The request lands in the admin's Seller Management for review; staff
-- approve or reject with a note. Each side is notified.
-- =============================================================

create table if not exists public.campaign_requests (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid not null references public.profiles(id) on delete cascade,
  brand_name     text not null,
  product_name   text,
  campaign_type  text not null default 'barter',   -- barter | reimbursement | paid
  slots          integer not null default 1,
  reward_amount  numeric,                           -- money to give per creator / slot
  budget         numeric,                           -- optional total budget
  min_followers  integer,
  preferred_start date,
  notes          text,
  status         text not null default 'pending',   -- pending | approved | rejected
  admin_note     text,
  reviewed_by    uuid references public.profiles(id) on delete set null,
  reviewed_at    timestamptz,
  campaign_id    uuid references public.campaigns(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists campaign_requests_seller_idx on public.campaign_requests (seller_id, created_at desc);
create index if not exists campaign_requests_status_idx on public.campaign_requests (status, created_at desc);

alter table public.campaign_requests enable row level security;

drop policy if exists "campaign_requests_select" on public.campaign_requests;
create policy "campaign_requests_select" on public.campaign_requests
  for select using (seller_id = auth.uid() or public.is_staff(auth.uid()));

-- A seller creates their own request.
drop policy if exists "campaign_requests_insert" on public.campaign_requests;
create policy "campaign_requests_insert" on public.campaign_requests
  for insert with check (seller_id = auth.uid());

-- Staff review (approve/reject/note); a seller may edit only while still pending.
drop policy if exists "campaign_requests_update" on public.campaign_requests;
create policy "campaign_requests_update" on public.campaign_requests
  for update using (
    public.is_staff(auth.uid())
    or (seller_id = auth.uid() and status = 'pending')
  ) with check (
    public.is_staff(auth.uid())
    or (seller_id = auth.uid() and status = 'pending')
  );

grant select, insert, update on public.campaign_requests to authenticated;

-- Notify admins when a new request comes in.
create or replace function public.campaign_request_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seller text;
begin
  select full_name into v_seller from public.profiles where id = new.seller_id;
  insert into public.notifications (user_id, title, message, type)
  select p.id, 'New campaign request',
    coalesce(v_seller, 'A seller') || ' requested a ' || new.campaign_type || ' campaign for ' || new.brand_name
      || ' (' || new.slots || ' slot' || case when new.slots = 1 then '' else 's' end || ').',
    'campaign_request'
  from public.profiles p where p.role = 'admin';
  return new;
end $$;

drop trigger if exists campaign_request_on_insert_trg on public.campaign_requests;
create trigger campaign_request_on_insert_trg
  after insert on public.campaign_requests
  for each row execute function public.campaign_request_on_insert();

-- Notify the seller when staff decide.
create or replace function public.campaign_request_on_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    insert into public.notifications (user_id, title, message, type)
    values (
      new.seller_id,
      'Campaign request ' || new.status,
      'Your ' || new.campaign_type || ' campaign request for ' || new.brand_name || ' was ' || new.status
        || case when new.admin_note is not null and length(btrim(new.admin_note)) > 0 then ' — ' || new.admin_note else '' end || '.',
      'campaign_request'
    );
  end if;
  return new;
end $$;

drop trigger if exists campaign_request_on_decision_trg on public.campaign_requests;
create trigger campaign_request_on_decision_trg
  after update on public.campaign_requests
  for each row execute function public.campaign_request_on_decision();

-- ---------- discussion thread on a request (seller <-> staff) ----------
create table if not exists public.campaign_request_messages (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.campaign_requests(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  author_role text not null default 'staff',   -- 'seller' | 'staff'
  author_name text,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists campaign_request_messages_idx on public.campaign_request_messages (request_id, created_at);

alter table public.campaign_request_messages enable row level security;

-- Visible to staff or the request's owning seller.
drop policy if exists "crm_select" on public.campaign_request_messages;
create policy "crm_select" on public.campaign_request_messages
  for select using (
    public.is_staff(auth.uid())
    or exists (select 1 from public.campaign_requests r where r.id = request_id and r.seller_id = auth.uid())
  );

drop policy if exists "crm_insert" on public.campaign_request_messages;
create policy "crm_insert" on public.campaign_request_messages
  for insert with check (
    author_id = auth.uid()
    and (
      public.is_staff(auth.uid())
      or exists (select 1 from public.campaign_requests r where r.id = request_id and r.seller_id = auth.uid())
    )
  );

grant select, insert on public.campaign_request_messages to authenticated;

-- Notify the other side on each new message.
create or replace function public.campaign_request_message_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select seller_id into v_owner from public.campaign_requests where id = new.request_id;
  if new.author_id = v_owner then
    -- seller wrote -> alert admins
    insert into public.notifications (user_id, title, message, type)
    select p.id, 'New message on a campaign request', 'A seller replied on their campaign request.', 'campaign_request'
    from public.profiles p where p.role = 'admin';
  else
    -- staff wrote -> alert seller
    insert into public.notifications (user_id, title, message, type)
    values (v_owner, 'Reply on your campaign request', 'Our team replied on your campaign request.', 'campaign_request');
  end if;
  return new;
end $$;

drop trigger if exists campaign_request_message_notify_trg on public.campaign_request_messages;
create trigger campaign_request_message_notify_trg
  after insert on public.campaign_request_messages
  for each row execute function public.campaign_request_message_notify();

