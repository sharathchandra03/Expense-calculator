import { getProvider } from '@/lib/fin/providers/registry'
import { fail, guard, json, serverError } from '@/lib/fin/server/http'
import { refreshConsent, toPublic } from '@/lib/fin/server/consents'
import { getConsentStore } from '@/lib/fin/server/store'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

/** Current consent status (asks the provider while the consent is pending). */
export async function GET(req: Request, { params }: Ctx) {
  const g = await guard(req, 'consents:get', 120)
  if ('res' in g) return g.res
  const { id } = await params
  try {
    const store = getConsentStore()
    const rec = await store.get(g.user.id, id)
    if (!rec) return fail(404, 'not_found', 'Connection not found.')
    return json({ consent: toPublic(await refreshConsent(store, rec)) })
  } catch (e) {
    return serverError('consents:get', e)
  }
}

/**
 * Revokes consent at the provider and marks it revoked. With ?purge=1 the
 * consent row and its audit trail are deleted as well (secure deletion). The
 * browser removes the imported data on its side.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await guard(req, 'consents:revoke', 20)
  if ('res' in g) return g.res
  const { id } = await params
  const purge = new URL(req.url).searchParams.get('purge') === '1'
  try {
    const store = getConsentStore()
    const rec = await store.get(g.user.id, id)
    if (!rec) return fail(404, 'not_found', 'Connection not found.')

    if (rec.status === 'active' || rec.status === 'awaiting_consent') {
      try {
        await getProvider(rec.provider).revokeConsent(rec.providerConsentRef)
      } catch (e) {
        // Do not claim revocation happened if the provider could not confirm it.
        console.error('[fin:revoke]', e instanceof Error ? e.message : 'unknown error')
        await store.audit(g.user.id, id, 'revoke_failed')
        return fail(502, 'revoke_failed', 'Could not revoke consent with the provider. Please try again.')
      }
    }
    await store.audit(g.user.id, id, 'revoked')
    const updated = await store.update(g.user.id, id, { status: 'revoked' })
    if (purge) {
      await store.remove(g.user.id, id)
      return json({ purged: true })
    }
    return json({ consent: updated ? toPublic(updated) : null })
  } catch (e) {
    return serverError('consents:revoke', e)
  }
}
