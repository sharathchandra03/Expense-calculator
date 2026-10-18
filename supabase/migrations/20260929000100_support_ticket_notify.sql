-- PennyFlow — notify operator on new support tickets
--
-- Fires the `notify-support-ticket` Edge Function via an HTTP POST whenever a
-- row is inserted into public.support_tickets. Uses the pg_net extension.
--
-- BEFORE THIS WORKS you must set two Postgres settings so the trigger knows
-- where to call and how to authenticate. Run these once in the SQL editor
-- (replace the placeholder values):
--
--   alter database postgres
--     set app.settings.edge_function_url =
--       'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/notify-support-ticket';
--   alter database postgres
--     set app.settings.notify_shared_secret = '<A-LONG-RANDOM-STRING>';
--
-- The same random string must be set as the NOTIFY_SHARED_SECRET secret on the
-- Edge Function (supabase secrets set NOTIFY_SHARED_SECRET=...).

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_support_ticket()
returns trigger
language plpgsql
security definer
as $$
declare
  fn_url  text := current_setting('app.settings.edge_function_url', true);
  secret  text := current_setting('app.settings.notify_shared_secret', true);
begin
  -- If the settings aren't configured yet, do nothing (don't block the insert).
  if fn_url is null or fn_url = '' then
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', coalesce(secret, '')
    ),
    body    := jsonb_build_object('record', to_jsonb(new))
  );

  return new;
exception when others then
  -- Never let a notification failure roll back the ticket insert.
  return new;
end;
$$;

drop trigger if exists trg_notify_new_support_ticket on public.support_tickets;
create trigger trg_notify_new_support_ticket
  after insert on public.support_tickets
  for each row
  execute function public.notify_new_support_ticket();
