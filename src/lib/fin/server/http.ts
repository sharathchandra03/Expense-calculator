import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { mockAvailability } from '../providers/mock'

/**
 * Resolves the authenticated user for an API request.
 *
 * - Supabase configured: the bearer token must be a valid Supabase access
 *   token; the returned id is the Supabase user id.
 * - Not configured: only the sandbox may run, and only outside production, with
 *   a fixed local user id. In production this always returns null.
 */
export async function getRequestUser(req: Request): Promise<{ id: string; sandboxOnly: boolean } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && anon) {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return null
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return null
    return { id: data.user.id, sandboxOnly: false }
  }
  if (process.env.NODE_ENV !== 'production' && mockAvailability().ready) {
    return { id: 'dev-local', sandboxOnly: true }
  }
  return null
}

// --- tiny fixed-window rate limiter (per instance) --------------------------
// Good enough to blunt abuse of a single node; behind multiple instances use a
// shared store (Redis/Upstash) instead.
const hits = new Map<string, { count: number; resetAt: number }>()
export function rateLimited(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now()
  const h = hits.get(key)
  if (!h || h.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs })
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k)
    return false
  }
  h.count++
  return h.count > limit
}

export const noStore = { 'Cache-Control': 'no-store' }

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

/** Errors reach the client as a stable code + generic message; details stay in server logs. */
export function fail(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status)
}

export function serverError(scope: string, err: unknown) {
  console.error(`[fin:${scope}]`, err instanceof Error ? err.message : 'unknown error')
  return fail(500, 'internal_error', 'Something went wrong. Please try again.')
}

/** Standard preamble: authenticate + rate-limit. Returns the user or a Response. */
export async function guard(req: Request, scope: string, limitPerMin = 30) {
  const user = await getRequestUser(req)
  if (!user) return { res: fail(401, 'unauthenticated', 'Please sign in to connect financial accounts.') }
  if (rateLimited(`${scope}:${user.id}`, limitPerMin)) return { res: fail(429, 'rate_limited', 'Too many requests. Please wait a moment.') }
  return { user }
}
