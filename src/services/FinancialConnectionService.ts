/**
 * FinancialConnectionService (browser)
 *
 * Talks to the server-side integration API (/api/fin/*) and feeds the result
 * into ImportService. The browser never sees provider credentials or the
 * provider's internal consent reference.
 */
import { db, type FinancialConnection } from '@/db/schema'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { isSyncDue } from '@/lib/fin/state'
import type { FetchDataResult, FiType, ProviderInfo } from '@/lib/fin/types'
import { ImportService, type IngestResult } from './ImportService'

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (isSupabaseConfigured) {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  }
  let res: Response
  try {
    res = await fetch(`/api/fin${path}`, { ...init, headers, cache: 'no-store' })
  } catch {
    throw new ApiError('network', 'Could not reach PennyFlow. Check your connection.', 0)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(body?.error?.code ?? 'error', body?.error?.message ?? 'Request failed.', res.status)
  }
  return body as T
}

type PublicConsent = Omit<FinancialConnection, never>

const inFlight = new Set<string>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export const PENDING_FLAG = 'pennyflow-fin-pending'

export class FinancialConnectionService {
  /** IDs of connections syncing on this device right now (for UI state). */
  static syncing(): ReadonlySet<string> {
    return inFlight
  }
  static subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }

  static async providers() {
    return api<{ providers: ProviderInfo[]; sandboxOnly: boolean }>('/providers')
  }

  /** Creates a consent. For real providers the caller must send the user to `consentUrl`. */
  static async startConnection(input: { provider: string; fiTypes: FiType[]; mobile?: string }) {
    const res = await api<{ consent: PublicConsent; consentUrl: string }>('/consents', {
      method: 'POST',
      body: JSON.stringify({ ...input, historyMonths: 12, validMonths: 6 }),
    })
    await db.financialConnections.put(res.consent)
    notify()
    return res
  }

  /** Pulls the server's view of all connections into the local mirror. */
  static async refresh(): Promise<FinancialConnection[]> {
    const { consents } = await api<{ consents: PublicConsent[] }>('/consents')
    await db.transaction('rw', db.financialConnections, async () => {
      const serverIds = new Set(consents.map((c) => c.id))
      const local = await db.financialConnections.toArray()
      // A connection the server no longer knows (e.g. purged elsewhere) is not a live connection.
      for (const l of local) if (!serverIds.has(l.id) && l.status !== 'revoked') await db.financialConnections.update(l.id, { status: 'revoked' })
      await db.financialConnections.bulkPut(consents)
    })
    notify()
    return consents
  }

  static async decideSandbox(consentId: string, decision: 'approve' | 'reject') {
    const { consent } = await api<{ consent: PublicConsent }>(`/consents/${consentId}/mock-decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    })
    await db.financialConnections.put(consent)
    notify()
    return consent
  }

  /** Asks the server for the current status; syncs automatically once it turns active for the first time. */
  static async checkStatus(consentId: string): Promise<FinancialConnection> {
    const before = await db.financialConnections.get(consentId)
    const { consent } = await api<{ consent: PublicConsent }>(`/consents/${consentId}`)
    await db.financialConnections.put(consent)
    notify()
    if (consent.status === 'active' && before?.status !== 'active') await FinancialConnectionService.sync(consentId).catch(() => undefined)
    return consent
  }

  static async sync(consentId: string): Promise<IngestResult> {
    if (inFlight.has(consentId)) throw new ApiError('already_syncing', 'A sync is already running.', 409)
    inFlight.add(consentId)
    notify()
    const startedAt = new Date().toISOString()
    try {
      // Incremental window starts at the last import that really completed on THIS device
      // (the server's "success" only means the provider fetch worked), minus a few days of
      // overlap: duplicates are impossible (idempotent import) and it catches late postings.
      const last = (await db.syncHistory.where('consentId').equals(consentId).filter((h) => h.state === 'success').toArray())
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
      const from = last ? new Date(Date.parse(last.startedAt) - 3 * 86400000).toISOString() : undefined
      const res = await api<{ consent: PublicConsent; data: FetchDataResult }>(`/consents/${consentId}/sync`, {
        method: 'POST',
        body: JSON.stringify(from ? { from } : {}),
      })
      const result = await ImportService.ingest(res.consent, res.data)
      await db.financialConnections.put(res.consent)
      return result
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('import_failed', 'Could not save the imported data.', 0)
      await ImportService.recordFailure(consentId, startedAt, err.code)
      // Reflect the server-side state (expired / revoked / failed) locally.
      await FinancialConnectionService.refresh().catch(() => undefined)
      await db.financialConnections.update(consentId, { lastSyncState: 'failed', lastError: err.code }).catch(() => undefined)
      throw err
    } finally {
      inFlight.delete(consentId)
      notify()
    }
  }

  /** Revokes consent with the provider. `deleteData` also wipes everything imported on this device and the server record. */
  static async disconnect(consentId: string, deleteData: boolean) {
    await api(`/consents/${consentId}${deleteData ? '?purge=1' : ''}`, { method: 'DELETE' })
    if (deleteData) {
      await ImportService.removeConnectionData(consentId, true)
    } else {
      await db.financialConnections.update(consentId, { status: 'revoked' })
    }
    notify()
  }

  /** Scheduled sync: refreshes stale active connections. Safe to call often; no-op without connections. */
  static async syncDueConnections(): Promise<void> {
    const conns = await db.financialConnections.toArray()
    if (conns.length === 0) return
    let list = conns
    try {
      list = await FinancialConnectionService.refresh()
    } catch {
      return // offline or signed out: try again next time
    }
    for (const c of list) {
      if (isSyncDue({ ...c, syncingNow: inFlight.has(c.id) })) {
        await FinancialConnectionService.sync(c.id).catch(() => undefined)
      }
    }
  }
}
