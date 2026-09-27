-- =============================================================
-- Bilkul — Creator bank accounts (KYC + unified payouts)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Creators add up to a few bank accounts during KYC. Exactly one is the
-- primary account, which is used as the destination for wallet withdrawals.
-- =============================================================

create table if not exists public.bank_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  account_holder_name text not null,
  bank_name           text not null,
  account_number      text not null,
  ifsc_code           text not null,
  is_primary          boolean not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists bank_accounts_user_id_idx on public.bank_accounts (user_id);

-- At most one primary account per user.
create unique index if not exists bank_accounts_one_primary_per_user
  on public.bank_accounts (user_id) where is_primary;

alter table public.bank_accounts enable row level security;

-- Creators manage their own accounts; staff can read for verification/payouts.
drop policy if exists "bank_accounts_owner_select" on public.bank_accounts;
create policy "bank_accounts_owner_select" on public.bank_accounts
  for select using (user_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists "bank_accounts_owner_insert" on public.bank_accounts;
create policy "bank_accounts_owner_insert" on public.bank_accounts
  for insert with check (user_id = auth.uid());

drop policy if exists "bank_accounts_owner_update" on public.bank_accounts;
create policy "bank_accounts_owner_update" on public.bank_accounts
  for update using (user_id = auth.uid());

drop policy if exists "bank_accounts_owner_delete" on public.bank_accounts;
create policy "bank_accounts_owner_delete" on public.bank_accounts
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.bank_accounts to authenticated;

-- Set a bank account as the primary one for the current user, unsetting any
-- previous primary in the same transaction (avoids the unique-index clash).
create or replace function public.set_primary_bank_account(p_account uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.bank_accounts
    set is_primary = false
    where user_id = auth.uid() and is_primary and id <> p_account;

  update public.bank_accounts
    set is_primary = true
    where id = p_account and user_id = auth.uid();
end $$;

grant execute on function public.set_primary_bank_account(uuid) to authenticated;
