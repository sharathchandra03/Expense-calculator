# Support Tickets — capture, email notifications & admin inbox

This wires the in-app **Help & Support** form so every submission is captured
server-side in Supabase (with screenshots), emails you on each new ticket, and
is reviewable inside the app via an operator-only **Support Inbox**.

Everything degrades gracefully: if Supabase isn't configured or the device is
offline, tickets still save locally and sync later.

---

## 1. Set your operator email (do this first)

Your email must be listed in **two** places (client shows the menu, server
grants data access):

1. `src/lib/admin-config.ts` → replace `you@example.com` in `OPERATOR_EMAILS`.
2. `supabase/migrations/20260929000200_support_admin_access.sql` → replace
   `you@example.com` in the `insert into public.support_operators` line
   (or add rows later from the Supabase dashboard → Table editor →
   `support_operators`).

Use the same email you sign into the app with (Google account email).

---

## 2. Run the migrations

Apply the three migrations to your Supabase project (Dashboard → SQL Editor,
paste each file's contents and run — or `supabase db push` with the CLI):

- `20260929000000_support_tickets.sql`     — table + storage bucket + RLS
- `20260929000100_support_ticket_notify.sql` — email trigger (pg_net)
- `20260929000200_support_admin_access.sql`  — operator allowlist + admin RPCs

---

## 3. (A) Email notifications

### 3a. Get a Resend API key
- Create a free account at https://resend.com, verify a sending domain (or use
  their `onboarding@resend.dev` sender for testing), and copy an API key.

### 3b. Deploy the Edge Function
```bash
supabase functions deploy notify-support-ticket --no-verify-jwt
```

### 3c. Set the function secrets
```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxx \
  RESEND_FROM="PennyFlow <support@yourdomain.com>" \
  SUPPORT_NOTIFY_EMAIL=you@example.com \
  NOTIFY_SHARED_SECRET=<a-long-random-string>
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the function
automatically by Supabase.)

### 3d. Point the DB trigger at the function
Run once in the SQL Editor (replace the placeholders — the secret must match
`NOTIFY_SHARED_SECRET` above):
```sql
alter database postgres
  set app.settings.edge_function_url =
    'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/notify-support-ticket';
alter database postgres
  set app.settings.notify_shared_secret = '<the-same-long-random-string>';
```

Now every new ticket emails `SUPPORT_NOTIFY_EMAIL` with all fields + screenshot
links. If email fails, the ticket is still saved (the trigger never blocks the
insert).

---

## 4. (B) In-app Support Inbox

Once your email is in the allowlist (step 1) and migrations are applied
(step 2), sign into the app with that account. A new **Operator → Support
Inbox** entry appears in the side menu. It lists every ticket, lets you filter
by status, open a detail sheet with the full submission + device diagnostics +
screenshots, and change a ticket's status.

Non-operator accounts never see the menu, and the server RPCs reject them even
if they reach the route — so access is enforced on both sides.

---

## Where submissions land (summary)

| Data | Location |
| --- | --- |
| Ticket fields + submitter account/email | `support_tickets` table |
| Screenshots | `support-attachments` storage bucket |
| Notification | Email to `SUPPORT_NOTIFY_EMAIL` |
| Review UI | In-app **Support Inbox** (operator only) |
