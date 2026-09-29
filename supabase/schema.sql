-- =====================================================================
-- PennyFlow — Supabase backend schema
-- =====================================================================
-- Run this ONCE in your Supabase project:
--   Supabase Dashboard → SQL Editor → New query → paste all → Run
--
-- It creates the single `user_data` table the app syncs to, and locks it
-- down with Row Level Security so every user can only read/write THEIR OWN
-- rows. This is what makes "sign in on a fresh install and get your data
-- back" work securely for any number of users.
-- =====================================================================

-- 1. The sync table --------------------------------------------------------
-- The app stores each local IndexedDB table (transactions, accounts, goals,
-- ...) as one row here: a JSON blob keyed by (user_id, table_name).
create table if not exists public.user_data (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  table_name  text        not null,
  data        jsonb       not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, table_name)
);

-- Fast lookups of "all rows for this user".
create index if not exists user_data_user_id_idx
  on public.user_data (user_id);

-- 2. Row Level Security ----------------------------------------------------
-- Without this, any signed-in user could read everyone's data. With it,
-- Postgres enforces that a user only ever touches rows where user_id = them.
alter table public.user_data enable row level security;

-- Drop old policies if re-running, so this script is idempotent.
drop policy if exists "Users can read their own data"   on public.user_data;
drop policy if exists "Users can insert their own data" on public.user_data;
drop policy if exists "Users can update their own data" on public.user_data;
drop policy if exists "Users can delete their own data" on public.user_data;

create policy "Users can read their own data"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "Users can insert their own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own data"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own data"
  on public.user_data for delete
  using (auth.uid() = user_id);

-- 3. Keep updated_at fresh on every write ----------------------------------
create or replace function public.set_user_data_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_data_updated_at on public.user_data;
create trigger trg_user_data_updated_at
  before update on public.user_data
  for each row
  execute function public.set_user_data_updated_at();

-- =====================================================================
-- Done. Next: enable the Google auth provider and set redirect URLs.
-- See supabase/SETUP.md for the click-through steps.
-- =====================================================================
