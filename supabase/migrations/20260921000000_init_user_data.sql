-- PennyFlow — initial cloud sync schema
-- Creates the user_data table + Row Level Security so each user can only
-- access their own rows. Idempotent so it's safe to re-run.

create table if not exists public.user_data (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  table_name  text        not null,
  data        jsonb       not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, table_name)
);

create index if not exists user_data_user_id_idx
  on public.user_data (user_id);

alter table public.user_data enable row level security;

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
