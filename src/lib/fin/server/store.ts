import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ConsentStatus, FinancialProviderId, FiType, SyncState } from '../types'

/**
 * Server-side consent registry.
 *
 * Stores the consent *lifecycle* only (ids, status, validity, audit trail).
 * Fetched financial data is NOT persisted on the server: it is returned to the
 * authenticated client once and stored in the user's own IndexedDB.
 *
 * Every method takes `userId` and filters by it, so one user can never read or
 * modify another user's consent even though the service-role client bypasses
 * row-level security.
 */

export interface ConsentRecord {
  id: string
  userId: string
  provider: FinancialProviderId
  providerConsentRef: string
  status: ConsentStatus
  fiTypes: FiType[]
  dataFrom: string
  dataTo: string
  validTo: string
  simulated: boolean
  createdAt: string
  updatedAt: string
  lastSyncAt?: string
  lastSyncState: SyncState
  lastError?: string
}

export interface AuditEvent {
  consentId: string
  userId: string
  event: string
  detail?: string
  at: string
}

export interface ConsentStore {
  create(rec: ConsentRecord): Promise<void>
  get(userId: string, id: string): Promise<ConsentRecord | null>
  list(userId: string): Promise<ConsentRecord[]>
  update(userId: string, id: string, patch: Partial<ConsentRecord>): Promise<ConsentRecord | null>
  /** Removes the consent row and its audit trail for secure deletion. */
  remove(userId: string, id: string): Promise<void>
  audit(userId: string, consentId: string, event: string, detail?: string): Promise<void>
  listAudit(userId: string, consentId: string): Promise<AuditEvent[]>
}

// ---------------------------------------------------------------------------
// In-memory store (development / sandbox only)
// ---------------------------------------------------------------------------

const g = globalThis as unknown as {
  __pfConsents?: Map<string, ConsentRecord>
  __pfAudit?: AuditEvent[]
}

class MemoryStore implements ConsentStore {
  private consents = (g.__pfConsents ??= new Map())
  private auditLog = (g.__pfAudit ??= [])
  async create(rec: ConsentRecord) {
    this.consents.set(rec.id, rec)
  }
  async get(userId: string, id: string) {
    const r = this.consents.get(id)
    return r && r.userId === userId ? r : null
  }
  async list(userId: string) {
    return [...this.consents.values()].filter((r) => r.userId === userId)
  }
  async update(userId: string, id: string, patch: Partial<ConsentRecord>) {
    const r = await this.get(userId, id)
    if (!r) return null
    const next = { ...r, ...patch, id: r.id, userId: r.userId, updatedAt: new Date().toISOString() }
    this.consents.set(id, next)
    return next
  }
  async remove(userId: string, id: string) {
    if (await this.get(userId, id)) this.consents.delete(id)
    for (let i = this.auditLog.length - 1; i >= 0; i--) {
      if (this.auditLog[i].consentId === id && this.auditLog[i].userId === userId) this.auditLog.splice(i, 1)
    }
  }
  async audit(userId: string, consentId: string, event: string, detail?: string) {
    this.auditLog.push({ userId, consentId, event, detail, at: new Date().toISOString() })
  }
  async listAudit(userId: string, consentId: string) {
    return this.auditLog.filter((a) => a.userId === userId && a.consentId === consentId)
  }
}

// ---------------------------------------------------------------------------
// Supabase store (production). Schema: supabase/migrations/…financial_consents.sql
// ---------------------------------------------------------------------------

type Row = {
  id: string
  user_id: string
  provider: FinancialProviderId
  provider_consent_ref: string
  status: ConsentStatus
  fi_types: FiType[]
  data_from: string
  data_to: string
  valid_to: string
  simulated: boolean
  created_at: string
  updated_at: string
  last_sync_at: string | null
  last_sync_state: SyncState
  last_error: string | null
}

const fromRow = (r: Row): ConsentRecord => ({
  id: r.id,
  userId: r.user_id,
  provider: r.provider,
  providerConsentRef: r.provider_consent_ref,
  status: r.status,
  fiTypes: r.fi_types,
  dataFrom: r.data_from,
  dataTo: r.data_to,
  validTo: r.valid_to,
  simulated: r.simulated,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastSyncAt: r.last_sync_at ?? undefined,
  lastSyncState: r.last_sync_state,
  lastError: r.last_error ?? undefined,
})

const toRow = (r: Partial<ConsentRecord>): Partial<Row> => {
  const o: Partial<Row> = {}
  if (r.id !== undefined) o.id = r.id
  if (r.userId !== undefined) o.user_id = r.userId
  if (r.provider !== undefined) o.provider = r.provider
  if (r.providerConsentRef !== undefined) o.provider_consent_ref = r.providerConsentRef
  if (r.status !== undefined) o.status = r.status
  if (r.fiTypes !== undefined) o.fi_types = r.fiTypes
  if (r.dataFrom !== undefined) o.data_from = r.dataFrom
  if (r.dataTo !== undefined) o.data_to = r.dataTo
  if (r.validTo !== undefined) o.valid_to = r.validTo
  if (r.simulated !== undefined) o.simulated = r.simulated
  if (r.createdAt !== undefined) o.created_at = r.createdAt
  if (r.lastSyncAt !== undefined) o.last_sync_at = r.lastSyncAt
  if (r.lastSyncState !== undefined) o.last_sync_state = r.lastSyncState
  if (r.lastError !== undefined) o.last_error = r.lastError
  return o
}

class SupabaseStore implements ConsentStore {
  constructor(private db: SupabaseClient) {}
  async create(rec: ConsentRecord) {
    const { error } = await this.db.from('financial_consents').insert(toRow(rec))
    if (error) throw new Error(`consent insert failed: ${error.message}`)
  }
  async get(userId: string, id: string) {
    const { data, error } = await this.db.from('financial_consents').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
    if (error) throw new Error(`consent read failed: ${error.message}`)
    return data ? fromRow(data as Row) : null
  }
  async list(userId: string) {
    const { data, error } = await this.db.from('financial_consents').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) throw new Error(`consent list failed: ${error.message}`)
    return (data as Row[]).map(fromRow)
  }
  async update(userId: string, id: string, patch: Partial<ConsentRecord>) {
    const { data, error } = await this.db
      .from('financial_consents')
      .update({ ...toRow(patch), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(`consent update failed: ${error.message}`)
    return data ? fromRow(data as Row) : null
  }
  async remove(userId: string, id: string) {
    await this.db.from('financial_consent_audit').delete().eq('consent_id', id).eq('user_id', userId)
    const { error } = await this.db.from('financial_consents').delete().eq('id', id).eq('user_id', userId)
    if (error) throw new Error(`consent delete failed: ${error.message}`)
  }
  async audit(userId: string, consentId: string, event: string, detail?: string) {
    await this.db.from('financial_consent_audit').insert({ user_id: userId, consent_id: consentId, event, detail })
  }
  async listAudit(userId: string, consentId: string) {
    const { data } = await this.db.from('financial_consent_audit').select('*').eq('consent_id', consentId).eq('user_id', userId).order('at')
    return ((data ?? []) as Array<{ consent_id: string; user_id: string; event: string; detail: string | null; at: string }>).map((a) => ({
      consentId: a.consent_id,
      userId: a.user_id,
      event: a.event,
      detail: a.detail ?? undefined,
      at: a.at,
    }))
  }
}

let cached: ConsentStore | null = null
export function getConsentStore(): ConsentStore {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) {
    cached = new SupabaseStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }))
  } else if (process.env.NODE_ENV !== 'production') {
    cached = new MemoryStore()
  } else {
    throw new Error('Consent store not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }
  return cached
}
