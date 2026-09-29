# Cloud Sync Setup (Supabase + Google Sign-In)

This makes it so **anyone** who installs PennyFlow can sign in with Google,
have their data backed up to the cloud, and get it all back after deleting or
reinstalling the app. Do this once; it takes about 15 minutes.

The old Supabase project the app pointed to is gone (that's the
`DNS_PROBE_FINISHED_NXDOMAIN` error on login). These steps create a fresh,
working one.

---

## Step 1 — Create a Supabase project

1. Go to https://supabase.com and sign in (free tier is fine).
2. Click **New project**. Give it a name (e.g. `pennyflow`), set a database
   password (save it somewhere), pick a region close to your users.
3. Wait ~2 minutes for it to provision.

## Step 2 — Create the database table

1. In your project, open **SQL Editor** (left sidebar) → **New query**.
2. Open the file `supabase/schema.sql` from this repo, copy **all** of it,
   paste into the editor, and click **Run**.
3. You should see "Success. No rows returned." That created the `user_data`
   table and its security rules.

## Step 3 — Get your project credentials

1. Go to **Project Settings** (gear icon) → **API**.
2. Copy two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key (under "Project API keys") — a long string.

## Step 4 — Put the credentials in the app

1. In the project root, create a file named `.env.local` (copy from
   `.env.example`):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   ```

2. Restart the dev server (`npm run dev`) so the new env vars load.
   > These are `NEXT_PUBLIC_*` so they're baked in at build time — for a
   > production deploy (Vercel/Netlify), add the same two variables in the
   > host's Environment Variables settings and redeploy.

## Step 5 — Set up Google Sign-In

### 5a. Create Google OAuth credentials
1. Go to https://console.cloud.google.com → create/select a project.
2. **APIs & Services → OAuth consent screen**: pick **External**, fill in the
   app name + your support email, save. (You can leave it in "Testing" while
   developing; publish it when you go live so any Google user can sign in.)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs** — add this exact URL (from your Supabase
     project, Authentication → Providers → Google, it's shown there too):

     ```
     https://abcdefgh.supabase.co/auth/v1/callback
     ```
   - Create, then copy the **Client ID** and **Client secret**.

### 5b. Enable Google in Supabase
1. In Supabase → **Authentication → Providers → Google**.
2. Toggle it **on**, paste the **Client ID** and **Client secret** from 5a, save.

## Step 6 — Tell Supabase where your app lives (redirect URLs)

1. In Supabase → **Authentication → URL Configuration**.
2. Set **Site URL** to where the app runs:
   - Local dev: `http://localhost:3000`
   - Production: your real domain, e.g. `https://pennyflow.yourdomain.com`
3. Under **Redirect URLs**, add every origin the app runs from (one per line):
   ```
   http://localhost:3000
   https://pennyflow.yourdomain.com
   ```
   > The app signs in with `redirectTo: window.location.origin`, so the origin
   > it's opened from must be in this list or the login will bounce.

## Step 7 — Test the round-trip

1. Open the app, go to **Settings → Cloud Sync**. It should say
   **"Not linked — sign in to enable backup"** (green dot), not the amber
   "server unreachable" warning. If it's still amber, the URL/key in
   `.env.local` is wrong or the server is unreachable — recheck Step 3/4.
2. Add a few transactions.
3. Tap **Continue with Google**, complete sign-in. The card should turn green:
   **"Linked to cloud • Auto-synced"** with a "Last sync" time.
4. Now the real test: clear the app's data (or open in a private window / a
   different device) so local is empty, then sign in with the **same** Google
   account. Your transactions should reappear — that's the cloud restore.

---

## How it works (for reference)

- All local data lives in IndexedDB on-device. When signed in, `AutoSyncProvider`
  pushes each table as a JSON blob into the `user_data` row for that user
  (debounced after changes, and on tab focus).
- On a fresh install, when local is empty and you sign in, `SyncService.pullFromCloud`
  restores everything from your `user_data` rows.
- On first sign-in when you *had* local guest data, it merges (local wins) and
  uploads, so you never lose what you already entered.
- Row Level Security in `schema.sql` guarantees each user only ever accesses
  their own rows.

## Troubleshooting

- **`DNS_PROBE_FINISHED_NXDOMAIN` on login** → the URL in `.env.local` points at
  a project that doesn't exist. Recheck Step 3.
- **Login redirects back but you're still signed out** → the app's origin isn't
  in Supabase Redirect URLs (Step 6), or Google's Authorized redirect URI
  (Step 5a) doesn't match `https://<your-project>.supabase.co/auth/v1/callback`.
- **"provider is not enabled"** → Google provider isn't toggled on in Supabase
  (Step 5b).
- **Data doesn't come back after reinstall** → make sure you signed in with the
  exact same Google account, and that Step 2 (the SQL) ran successfully.
