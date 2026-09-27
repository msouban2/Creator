-- =============================================================
-- Bilkul — Seller ⇄ employee order fulfilment sync
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Keeps the seller and the seller-handling employee in sync on each order:
--   • a two-way comment thread per order (application) so they can coordinate
--     ("please share the code" / "here's the tracking"), like an LRMS log;
--   • sellers can see the SHIP-TO address to fulfil the order, but the creator's
--     name is hidden (privacy) — exposed only through a scoped RPC that omits it;
--   • the employee (staff) still sees everything, including the creator.
-- Shipment status + tracking + code live on the application (0019), so both
-- sides read/write the same source of truth.
-- =============================================================

-- ---------- 1. per-order comment thread ----------
create table if not exists public.order_comments (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  author_id      uuid not null references public.profiles(id) on delete set null,
  author_role    text not null default 'staff', -- 'staff' | 'seller'
  author_name    text,                           -- snapshot so each side sees who posted
  body           text not null,
  created_at     timestamptz not null default now()
);

create index if not exists order_comments_application_id_idx
  on public.order_comments (application_id, created_at);

alter table public.order_comments enable row level security;

-- Staff read all; a seller reads only comments on orders in their own campaigns.
drop policy if exists "order_comments_select" on public.order_comments;
create policy "order_comments_select" on public.order_comments
  for select using (
    public.is_staff(auth.uid())
    or exists (
      select 1 from public.applications a
      join public.campaigns c on c.id = a.campaign_id
      where a.id = order_comments.application_id and c.seller_id = auth.uid()
    )
  );

-- Staff or the owning seller can post, only as themselves.
drop policy if exists "order_comments_insert" on public.order_comments;
create policy "order_comments_insert" on public.order_comments
  for insert with check (
    author_id = auth.uid()
    and (
      public.is_staff(auth.uid())
      or exists (
        select 1 from public.applications a
        join public.campaigns c on c.id = a.campaign_id
        where a.id = order_comments.application_id and c.seller_id = auth.uid()
      )
    )
  );

-- Authors (or admins) can edit/remove their own comment.
drop policy if exists "order_comments_update" on public.order_comments;
create policy "order_comments_update" on public.order_comments
  for update using (author_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "order_comments_delete" on public.order_comments;
create policy "order_comments_delete" on public.order_comments
  for delete using (author_id = auth.uid() or public.is_admin(auth.uid()));

grant select, insert, update, delete on public.order_comments to authenticated;

-- ---------- 2. hide the creator's name from sellers ----------
-- Sellers no longer read creator_addresses directly (it carries the name).
drop policy if exists "addresses_seller_read" on public.creator_addresses;

-- Scoped, name-free ship-to address for a seller's own order.
create or replace function public.seller_order_address(p_application uuid)
returns table (
  address     text,
  city        text,
  state       text,
  country     text,
  postal_code text,
  phone       text
)
language sql
security definer
set search_path = public
as $$
  select ca.address, ca.city, ca.state, ca.country, ca.postal_code, ca.phone
  from public.applications app
  join public.campaigns c on c.id = app.campaign_id
  join public.creator_addresses ca on ca.user_id = app.creator_id
  where app.id = p_application
    and c.seller_id = auth.uid()
  order by ca.created_at desc
  limit 1;
$$;

grant execute on function public.seller_order_address(uuid) to authenticated;
