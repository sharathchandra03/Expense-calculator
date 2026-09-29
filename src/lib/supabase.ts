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

/** The configured project URL (empty string when unconfigured). */
export const supabaseProjectUrl = supabaseUrl

/**
 * Verify the configured Supabase project is actually reachable.
 *
 * This catches the case where NEXT_PUBLIC_SUPABASE_URL points at a project
 * that was deleted/paused or is mistyped — the domain won't resolve
 * (DNS_PROBE_FINISHED_NXDOMAIN) and any auth attempt would just bounce the user
 * to a dead page. We hit the auth health endpoint with a short timeout.
 *
 * Returns true only when we get an actual HTTP response back (any status is
 * fine — even 401/404 proves the host exists). Network/DNS failure → false.
 */
export async function checkSupabaseReachable(timeoutMs = 6000): Promise<boolean> {
  if (!isSupabaseConfigured) return false
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: supabaseAnonKey },
      signal: controller.signal,
    })
    clearTimeout(timer)
    // Any response (even an error status) means the host is alive.
    return res.status > 0
  } catch {
    // DNS failure, timeout, or offline.
    return false
  }
}
