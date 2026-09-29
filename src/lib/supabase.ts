import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/**
 * Whether Supabase credentials are actually configured.
 * When false, cloud sync / Google sign-in are unavailable and the UI
 * should surface that instead of silently failing.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/**
 * Supabase client.
 *
 * OAuth notes:
 * - `flowType: 'pkce'` is the recommended, most reliable flow for browser
 *   OAuth. The provider redirects back with a `?code=` param which the client
 *   exchanges for a session.
 * - `detectSessionInUrl: true` makes the client automatically pick up that
 *   `?code=` (or legacy hash tokens) on page load and complete sign-in.
 * - `persistSession` + `autoRefreshToken` keep the user logged in across
 *   reloads and refresh expiring tokens in the background.
 *
 * If env vars are missing, `createClient` in current supabase-js versions
 * throws ("supabaseUrl is required") — which breaks SSR/prerender. To keep
 * imports safe we fall back to a harmless placeholder URL/key when unconfigured.
 * `isSupabaseConfigured` stays false and gates every real auth/sync call, so the
 * placeholder client is never actually used to talk to a server.
 */
const clientUrl = isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co'
const clientKey = isSupabaseConfigured ? supabaseAnonKey : 'placeholder-anon-key'

export const supabase: SupabaseClient = createClient(clientUrl, clientKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: isSupabaseConfigured,
    persistSession: isSupabaseConfigured,
    autoRefreshToken: isSupabaseConfigured,
    storageKey: 'pennyflow-auth',
  },
})
