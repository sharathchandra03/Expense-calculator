-- PennyFlow: financial data integration — consent registry
--
-- Stores the consent LIFECYCLE only (status, validity, audit trail). Imported
-- financial data (balances, transactions) is never stored in these tables; it is
-- delivered to the signed-in user's device once and stored there.
--
-- The API routes use the service-role key and always filter by user_id. RLS is
-- enabled with owner-only SELECT so that, even if a table is ever exposed to the
-- anon/authenticated roles, a user can only ever read their own rows. All writes
-- go through the server (no INSERT/UPDATE/DELETE policies for end users).

create table if not exists public.financial_consents (
  id                    uuid primary key,
  user_id               uuid not null references auth.users(id) on delete cascade,
  provider              text not null check (provider in ('mock','setu','finvu','camsfinserv','onemoney','anumati')),
  provider_consent_ref  text not null,
  status                text not null check (status in ('awaiting_consent','active','rejected','expired','revoked','failed')),
  fi_types              text[] not null,
  data_from             timestamptz not null,
  data_to               timestamptz not null,
  valid_to              timestamptz not null,
  simulated             boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  last_sync_at          timestamptz,
  last_sync_state       text not null default 'idle' check (last_sync_state in ('idle','syncing','success','failed')),
  last_error            text
);

create index if not exists financial_consents_user_idx on public.financial_consents (user_id, created_at desc);

create table if not exists public.financial_consent_audit (
  id          bigint generated always as identity primary key,
  consent_id  uuid not null references public.financial_consents(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  event       text not null,
  detail      text,
  at          timestamptz not null default now()
);

create index if not exists financial_consent_audit_idx on public.financial_consent_audit (consent_id, at);

alter table public.financial_consents      enable row level security;
alter table public.financial_consent_audit enable row level security;

drop policy if exists "owner can read own consents" on public.financial_consents;
create policy "owner can read own consents"
  on public.financial_consents for select
  using (auth.uid() = user_id);

drop policy if exists "owner can read own consent audit" on public.financial_consent_audit;
create policy "owner can read own consent audit"
  on public.financial_consent_audit for select
  using (auth.uid() = user_id);

-- provider_consent_ref is internal. Revoke column access from client roles so it is
-- not readable even with the owner-select policy above.
revoke all on public.financial_consents from anon, authenticated;
grant select (id, user_id, provider, status, fi_types, data_from, data_to, valid_to, simulated,
              created_at, updated_at, last_sync_at, last_sync_state, last_error)
  on public.financial_consents to authenticated;
revoke all on public.financial_consent_audit from anon, authenticated;
grant select on public.financial_consent_audit to authenticated;
