-- PennyFlow — operator (admin) read access to all support tickets
--
-- The browser uses the anon key, and RLS limits normal users to their own
-- tickets. To power the in-app Admin Inbox we expose SECURITY DEFINER RPCs that
-- return all tickets, but ONLY when the caller's authenticated email is in the
-- operator allowlist below. Update the allowlist with your own email(s).

-- ── Operator allowlist ──────────────────────────────────────────────────────
create table if not exists public.support_operators (
  email text primary key
);

alter table public.support_operators enable row level security;
-- No policies => not readable/writable via the anon/authenticated API. Manage
-- this list from the Supabase dashboard (Table editor) or SQL editor only.

-- >>> Add YOUR operator email(s) here (edit before running, or insert later):
insert into public.support_operators (email) values
  ('ksharath2003@gmail.com')
on conflict (email) do nothing;

-- Helper: is the current authenticated user an operator?
create or replace function public.is_support_operator()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.support_operators o
    where lower(o.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- List all tickets (operator only). Returns the full table when authorized,
-- otherwise raises so the client can surface "not authorized".
create or replace function public.admin_list_support_tickets()
returns setof public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_support_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select * from public.support_tickets order by created_at desc;
end;
$$;

-- Update a ticket's status (operator only).
create or replace function public.admin_update_ticket_status(p_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_support_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.support_tickets set status = p_status where id = p_id;
end;
$$;

-- Generate a fresh signed URL for a stored attachment path (operator only).
-- (Storage signing from SQL isn't available; the client calls storage directly
--  using its own session, so operators also get a storage read policy below.)

-- Let operators read every object in the support bucket.
drop policy if exists "Operators read all support attachments" on storage.objects;
create policy "Operators read all support attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'support-attachments'
    and public.is_support_operator()
  );

-- Allow authenticated operators to execute the RPCs.
grant execute on function public.admin_list_support_tickets() to authenticated;
grant execute on function public.admin_update_ticket_status(text, text) to authenticated;
grant execute on function public.is_support_operator() to authenticated;
