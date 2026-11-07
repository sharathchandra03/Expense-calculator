import { z } from 'zod'
import { getProvider, isProviderId, ProviderNotReadyError } from '@/lib/fin/providers/registry'
import { fail, guard, json, serverError } from '@/lib/fin/server/http'
import { refreshConsent, toPublic } from '@/lib/fin/server/consents'
import { getConsentStore, type ConsentRecord } from '@/lib/fin/server/store'

export const dynamic = 'force-dynamic'

const Body = z.object({
  provider: z.string().refine(isProviderId, 'unknown provider'),
  fiTypes: z.array(z.enum(['DEPOSIT', 'MUTUAL_FUNDS', 'EQUITIES', 'ETF'])).min(1).max(4),
  mobile: z.string().regex(/^\d{10}$/).optional(),
  /** How many months of history to request (bounded). */
  historyMonths: z.number().int().min(1).max(24).default(12),
  /** Consent validity in months (bounded). */
  validMonths: z.number().int().min(1).max(12).default(6),
})

function appOrigin(req: Request) {
  const configured = process.env.PENNYFLOW_APP_URL
  if (configured) return configured.replace(/\/$/, '')
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host
  return `${proto}://${host}`
}

export async function GET(req: Request) {
  const g = await guard(req, 'consents:list', 60)
  if ('res' in g) return g.res
  try {
    const store = getConsentStore()
    const rows = await store.list(g.user.id)
    const fresh = await Promise.all(rows.map((r) => refreshConsent(store, r)))
    return json({ consents: fresh.map(toPublic) })
  } catch (e) {
    return serverError('consents:list', e)
  }
}

export async function POST(req: Request) {
  const g = await guard(req, 'consents:create', 10)
  if ('res' in g) return g.res

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return fail(400, 'invalid_request', 'Invalid request.')
  const body = parsed.data
  const provider = getProvider(body.provider as Parameters<typeof getProvider>[0])

  if (g.user.sandboxOnly && !provider.simulated) return fail(403, 'sandbox_only', 'Only the sandbox provider is available without sign-in.')
  const availability = provider.availability()
  if (!availability.ready) return fail(503, 'provider_unavailable', availability.reason ?? 'Provider is not available.')
  const unsupported = body.fiTypes.filter((t) => !provider.fiTypes.includes(t))
  if (unsupported.length) return fail(400, 'unsupported_fi_type', `${provider.displayName} does not support ${unsupported.join(', ')} yet.`)

  const now = new Date()
  const dataFrom = new Date(now)
  dataFrom.setUTCMonth(dataFrom.getUTCMonth() - body.historyMonths)
  const validTo = new Date(now)
  validTo.setUTCMonth(validTo.getUTCMonth() + body.validMonths)
  const id = crypto.randomUUID()

  try {
    const created = await provider.createConsent({
      consentId: id,
      userId: g.user.id,
      mobile: body.mobile,
      fiTypes: body.fiTypes,
      dataFrom: dataFrom.toISOString(),
      dataTo: validTo.toISOString(),
      validFrom: now.toISOString(),
      validTo: validTo.toISOString(),
      redirectUrl: `${appOrigin(req)}/`,
      purpose: 'Personal finance tracking and analysis in PennyFlow',
    })
    const rec: ConsentRecord = {
      id,
      userId: g.user.id,
      provider: provider.id,
      providerConsentRef: created.providerConsentRef,
      status: 'awaiting_consent',
      fiTypes: body.fiTypes,
      dataFrom: dataFrom.toISOString(),
      dataTo: validTo.toISOString(),
      validTo: validTo.toISOString(),
      simulated: provider.simulated,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastSyncState: 'idle',
    }
    const store = getConsentStore()
    await store.create(rec)
    await store.audit(g.user.id, id, 'created', `provider=${provider.id} fiTypes=${body.fiTypes.join(',')}`)
    return json({ consent: toPublic(rec), consentUrl: created.consentUrl }, 201)
  } catch (e) {
    if (e instanceof ProviderNotReadyError) return fail(503, 'provider_unavailable', 'Provider is not available.')
    return serverError('consents:create', e)
  }
}
