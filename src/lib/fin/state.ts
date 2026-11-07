import type { ConnectionState } from './types'

export interface StateInput {
  status: 'awaiting_consent' | 'active' | 'rejected' | 'expired' | 'revoked' | 'failed'
  lastSyncState: 'idle' | 'syncing' | 'success' | 'failed'
  /** True while a sync request from this device is in flight. */
  syncingNow?: boolean
}

/**
 * The single place that maps stored facts to the state shown in the UI.
 * "synced" is only ever returned when a sync actually completed successfully;
 * a freshly approved consent is "connected" until its first sync finishes.
 */
export function deriveConnectionState(c: StateInput): ConnectionState {
  switch (c.status) {
    case 'awaiting_consent':
      return 'awaiting_consent'
    case 'expired':
      return 'consent_expired'
    case 'revoked':
    case 'rejected':
      return 'consent_revoked'
    case 'failed':
      return 'sync_failed'
    case 'active':
      if (c.syncingNow || c.lastSyncState === 'syncing') return 'syncing'
      if (c.lastSyncState === 'failed') return 'sync_failed'
      if (c.lastSyncState === 'success') return 'synced'
      return 'connected'
  }
}

export const STATE_LABEL: Record<ConnectionState, string> = {
  not_connected: 'Not connected',
  awaiting_consent: 'Awaiting consent',
  connected: 'Connected',
  syncing: 'Syncing…',
  synced: 'Synced',
  sync_failed: 'Sync failed',
  consent_expired: 'Consent expired',
  consent_revoked: 'Consent revoked',
}

export const STATE_TONE: Record<ConnectionState, 'neutral' | 'info' | 'good' | 'warn' | 'bad'> = {
  not_connected: 'neutral',
  awaiting_consent: 'warn',
  connected: 'info',
  syncing: 'info',
  synced: 'good',
  sync_failed: 'bad',
  consent_expired: 'warn',
  consent_revoked: 'neutral',
}

/** A connection is due for an automatic refresh when it is active and stale. */
export function isSyncDue(c: StateInput & { lastSyncAt?: string }, now = Date.now(), maxAgeMs = 6 * 3600_000): boolean {
  if (c.status !== 'active' || c.syncingNow || c.lastSyncState === 'syncing') return false
  if (!c.lastSyncAt) return true
  return now - Date.parse(c.lastSyncAt) >= maxAgeMs
}
