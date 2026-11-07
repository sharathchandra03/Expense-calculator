import 'server-only'
import { getProvider } from '../providers/registry'
import type { ConsentRecord, ConsentStore } from './store'

/** Public (client-safe) projection. The provider's internal reference is never sent to the browser. */
export function toPublic(r: ConsentRecord) {
  const { providerConsentRef: _ref, userId: _user, ...rest } = r
  void _ref
  void _user
  return rest
}

/**
 * Brings a stored consent up to date with reality:
 *  - validity elapsed  -> expired
 *  - still awaiting    -> ask the provider (the only source of truth) and record the answer
 * A status is never advanced to `active` without the provider saying so.
 */
export async function refreshConsent(store: ConsentStore, rec: ConsentRecord): Promise<ConsentRecord> {
  if (rec.status === 'revoked' || rec.status === 'rejected' || rec.status === 'expired') return rec

  if (Date.parse(rec.validTo) < Date.now()) {
    await store.audit(rec.userId, rec.id, 'expired')
    return (await store.update(rec.userId, rec.id, { status: 'expired' })) ?? rec
  }

  if (rec.status === 'awaiting_consent' || rec.status === 'active') {
    try {
      const res = await getProvider(rec.provider).getConsentStatus(rec.providerConsentRef)
      if (res.status !== rec.status) {
        await store.audit(rec.userId, rec.id, `status:${res.status}`, res.detail)
        return (await store.update(rec.userId, rec.id, { status: res.status })) ?? rec
      }
    } catch (e) {
      // Provider unreachable: keep last known status, do not guess.
      console.error('[fin:refreshConsent]', e instanceof Error ? e.message : 'unknown error')
    }
  }
  return rec
}
