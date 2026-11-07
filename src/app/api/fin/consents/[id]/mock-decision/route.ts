import { z } from 'zod'
import { mockAvailability, setMockDecision } from '@/lib/fin/providers/mock'
import { fail, guard, json, serverError } from '@/lib/fin/server/http'
import { refreshConsent, toPublic } from '@/lib/fin/server/consents'
import { getConsentStore } from '@/lib/fin/server/store'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

const Body = z.object({ decision: z.enum(['approve', 'reject']) })

/**
 * Stand-in for the AA's consent screen — SANDBOX ONLY. Real providers decide
 * consent on their own UI and report it back; this endpoint refuses to act
 * for any non-simulated consent.
 */
export async function POST(req: Request, { params }: Ctx) {
  if (!mockAvailability().ready) return fail(404, 'not_found', 'Not found.')
  const g = await guard(req, 'consents:mock', 20)
  if ('res' in g) return g.res
  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail(400, 'invalid_request', 'Invalid request.')
  try {
    const store = getConsentStore()
    const rec = await store.get(g.user.id, id)
    if (!rec || !rec.simulated) return fail(404, 'not_found', 'Connection not found.')
    setMockDecision(rec.providerConsentRef, parsed.data.decision === 'approve' ? 'active' : 'rejected')
    return json({ consent: toPublic(await refreshConsent(store, rec)) })
  } catch (e) {
    return serverError('consents:mock', e)
  }
}
