-- PennyFlow — Help & Support ticket capture
-- Creates the support_tickets table (server-side capture of every submission,
-- tied to the submitting account when signed in) + a storage bucket for
-- screenshot/image attachments. Idempotent so it's safe to re-run.

-- ============================================================================
-- TABLE
-- ============================================================================
create table if not exists public.support_tickets (
  id                  text        primary key,             -- human ticket id, e.g. PF-7A3X2
  user_id             uuid        references auth.users (id) on delete set null,
  user_email          text,                                -- captured for convenience even if account is later deleted
  guest_id            text,                                -- anonymous session id when not signed in
  category            text        not null,
  subject             text        not null,
  description         text,
  steps_to_reproduce  text,
  expected_behaviour  text,
  actual_behaviour    text,
  problem_to_solve    text,
  suggestion          text,
  rating              int,
  attachments         jsonb       not null default '[]'::jsonb, -- [{ name, type, size, url, path }]
  diagnostics         jsonb       not null default '{}'::jsonb,
  priority            text        not null default 'medium',
  status              text        not null default 'open',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists support_tickets_user_id_idx  on public.support_tickets (user_id);
create index if not exists support_tickets_status_idx   on public.support_tickets (status);
create index if not exists support_tickets_created_idx  on public.support_tickets (created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.support_tickets enable row level security;

drop policy if exists "Users insert own tickets"   on public.support_tickets;
drop policy if exists "Anon can insert tickets"     on public.support_tickets;
drop policy if exists "Users read own tickets"      on public.support_tickets;
drop policy if exists "Users update own tickets"    on public.support_tickets;

-- Signed-in users may submit tickets attributed to themselves.
create policy "Users insert own tickets"
  on public.support_tickets for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Guests (not signed in) may submit tickets with no user_id.
create policy "Anon can insert tickets"
  on public.support_tickets for insert
  to anon
  with check (user_id is null);

-- Users may read only their own tickets (so ticket history can sync back).
-- You, the operator, read everything via the Supabase dashboard / service_role
-- key, which bypasses RLS.
create policy "Users read own tickets"
  on public.support_tickets for select
  to authenticated
  using (auth.uid() = user_id);

-- Users may update their own tickets (e.g. append a message) — optional.
create policy "Users update own tickets"
  on public.support_tickets for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- keep updated_at fresh
create or replace function public.set_support_ticket_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_support_tickets_updated_at on public.support_tickets;
create trigger trg_support_tickets_updated_at
  before update on public.support_tickets
  for each row
  execute function public.set_support_ticket_updated_at();

-- ============================================================================
-- STORAGE BUCKET for screenshots / image attachments
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('support-attachments', 'support-attachments', false)
on conflict (id) do nothing;

drop policy if exists "Anyone can upload support attachments" on storage.objects;
drop policy if exists "Users read own support attachments"    on storage.objects;

-- Allow uploads to the support bucket from authenticated users AND anonymous
-- guests (both use the anon/authenticated roles from the browser client).
create policy "Anyone can upload support attachments"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'support-attachments');

-- Let a user read back files they uploaded (files are namespaced by uploader).
-- Operator reads all via the dashboard / service_role.
create policy "Users read own support attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'support-attachments'
    and owner = auth.uid()
  );
