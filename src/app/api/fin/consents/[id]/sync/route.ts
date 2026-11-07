import { z } from 'zod'
import { getProvider } from '@/lib/fin/providers/registry'
import { fail, guard, json, serverError } from '@/lib/fin/server/http'
import { refreshConsent, toPublic } from '@/lib/fin/server/consents'
import { getConsentStore } from '@/lib/fin/server/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
type Ctx = { params: Promise<{ id: string }> }

const Body = z.object({ from: z.string().datetime().optional() }).default({})

/**
 * Fetches the consented data from the provider and returns it to the caller.
 * Nothing is persisted here except sync status / audit; the client stores the
 * data locally through its idempotent importer, so repeating this call (or
 * overlapping windows) can never create duplicates.
 */
export async function POST(req: Request, { params }: Ctx) {
  const g = await guard(req, 'consents:sync', 6)
  if ('res' in g) return g.res
  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return fail(400, 'invalid_request', 'Invalid request.')

  try {
    const store = getConsentStore()
    const found = await store.get(g.user.id, id)
    if (!found) return fail(404, 'not_found', 'Connection not found.')
    const rec = await refreshConsent(store, found)

    if (rec.status !== 'active') {
      const msg: Record<string, string> = {
        awaiting_consent: 'Consent has not been approved yet.',
        expired: 'Consent has expired. Reconnect to continue syncing.',
        revoked: 'Consent was revoked.',
        rejected: 'Consent was declined.',
        failed: 'Connection failed.',
      }
      return fail(409, `consent_${rec.status}`, msg[rec.status] ?? 'Consent is not active.')
    }

    await store.update(g.user.id, id, { lastSyncState: 'syncing' })
    const requestedFrom = parsed.data.from ? Date.parse(parsed.data.from) : Date.parse(rec.dataFrom)
    const from = new Date(Math.max(requestedFrom, Date.parse(rec.dataFrom)))
    const to = new Date(Math.min(Date.now(), Date.parse(rec.dataTo), Date.parse(rec.validTo)))

    try {
      const data = await getProvider(rec.provider).fetchData({
        consentId: rec.id,
        providerConsentRef: rec.providerConsentRef,
        fiTypes: rec.fiTypes,
        from: from.toISOString(),
        to: to.toISOString(),
      })
      const done = await store.update(g.user.id, id, { lastSyncState: 'success', lastSyncAt: new Date().toISOString(), lastError: '' })
      await store.audit(g.user.id, id, 'synced', `accounts=${data.accounts.length} txns=${data.transactions.length}`)
      return json({ consent: done ? toPublic(done) : null, data, window: { from: from.toISOString(), to: to.toISOString() } })
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'unknown error'
      console.error('[fin:sync]', reason)
      await store.update(g.user.id, id, { lastSyncState: 'failed', lastError: 'Provider data fetch failed' })
      await store.audit(g.user.id, id, 'sync_failed')
      return fail(502, 'sync_failed', 'Could not fetch data from the provider. Try again shortly.')
    }
  } catch (e) {
    return serverError('consents:sync', e)
  }
}
