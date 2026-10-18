import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { db } from '@/db/schema'

const SYNC_TABLES = [
  'transactions',
  'accounts',
  'assets',
  'lending',
  'bills',
  'goals',
  'budgets',
  'investments',
  'customCategories',
  'tags',
  'notifications',
  'systemLogs',
  'userProfile',
  'debts',
  'subscriptions',
  'templates',
  'splits',
  'sharedWallets',
  'financialBriefs',
] as const

type SyncTable = typeof SYNC_TABLES[number]

/**
 * localStorage preference keys that are synced to the cloud as the
 * `_preferences` row. Keyed by the short name stored in the cloud blob →
 * the actual localStorage key.
 *
 * TO SYNC A NEW PREFERENCE: add one entry here. It will automatically be
 * included in every push AND restored by every pull/force-restore path.
 * This is the single source of truth — do NOT inline-list keys elsewhere.
 */
const PREFERENCE_KEYS: Record<string, string> = {
  currency: 'finance-os-currency',
  theme: 'finance-os-theme',
  notifications: 'finance-os-notifications',
  profile: 'finance-os-profile',
  hiddenCategories: 'pennyflow-hidden-categories',
  customAccountTypes: 'pennyflow-custom-account-types',
  hiddenAccountTypes: 'pennyflow-hidden-account-types',
  dashOrder: 'pennyflow-dash-order',
  overviewOrder: 'pennyflow-overview-order',
  onboardingDone: 'finance-os-onboarding-done',
  // Newly synced UI / feature preferences:
  dashHidden: 'pennyflow-dash-hidden',
  dashCompact: 'pennyflow-dash-compact',
  pennyflowTheme: 'pennyflow-theme',
  recentSearches: 'finance-os-recent-searches',
  onboardingLastShown: 'finance-os-onboarding-last-shown',
  notes: 'pennyflow-notes',
}

/**
 * The actual localStorage keys that are synced. Exported so the auto-sync
 * provider can detect same-tab writes to these keys and trigger a push.
 */
export const SYNCED_PREFERENCE_LS_KEYS: readonly string[] = Object.values(PREFERENCE_KEYS)

/** Read all synced preferences from localStorage into a cloud-storable blob. */
function buildPreferences(): Record<string, string> {
  const prefs: Record<string, string> = {}
  for (const [cloudKey, lsKey] of Object.entries(PREFERENCE_KEYS)) {
    const val = localStorage.getItem(lsKey)
    if (val !== null) prefs[cloudKey] = val
  }
  return prefs
}

/** Write a cloud preferences blob back into localStorage. */
function applyPreferences(prefs: Record<string, any> | null | undefined): void {
  if (!prefs) return
  for (const [cloudKey, lsKey] of Object.entries(PREFERENCE_KEYS)) {
    const val = prefs[cloudKey]
    if (val !== undefined && val !== null && val !== '') {
      localStorage.setItem(lsKey, String(val))
    }
  }
}

/**
 * SyncService — Production-safe cloud sync
 *
 * RULES:
 * 1. NEVER push empty data that would overwrite non-empty cloud data
 * 2. NEVER clear local tables during a pull unless local is confirmed empty
 * 3. On first sign-in with existing local data → MERGE into cloud (local wins)
 * 4. On sign-in with empty local → RESTORE from cloud (cloud wins)
 * 5. On subsequent syncs → push local changes to cloud (local is source of truth)
 * 6. Focus-pull is disabled — only explicit pull or initial sync triggers cloud restore
 */
export class SyncService {
  /**
   * Push all local IndexedDB data to Supabase.
   * SAFETY: Will NOT push if all major tables are empty (prevents accidental cloud wipe).
   */
  static async pushToCloud(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured) return { success: false, error: 'Cloud sync not configured' }
    try {
      // Safety check: don't push TABLE data if the local DB appears empty
      // (prevents overwriting a good cloud backup with nothing). Preferences
      // are still pushed below, so prefs-only changes (dashboard layout,
      // notes, theme, ...) are backed up even on an otherwise-empty DB.
      const accountCount = await db.accounts.count()
      const transactionCount = await db.transactions.count()
      let dataTablesEmpty = false
      if (accountCount === 0 && transactionCount === 0) {
        // Check if user has ANY data at all (goals, bills, etc.)
        const goalsCount = await db.goals.count()
        const billsCount = await db.bills.count()
        dataTablesEmpty = goalsCount === 0 && billsCount === 0
      }

      if (dataTablesEmpty) {
        // Skip table push to avoid wiping cloud backup, but still sync prefs.
        await SyncService.pushPreferences(userId)
        return { success: true }
      }

      for (const tableName of SYNC_TABLES) {
        const table = (db as any)[tableName]
        if (!table) continue

        const data = await table.toArray()

        const { error } = await supabase
          .from('user_data')
          .upsert({
            user_id: userId,
            table_name: tableName,
            data: data,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,table_name',
          })

        if (error) {
          return { success: false, error: `Failed to sync ${tableName}: ${error.message}` }
        }
      }

      // Sync localStorage preferences
      await SyncService.pushPreferences(userId)

      localStorage.setItem('pennyflow-last-sync', new Date().toISOString())
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error' }
    }
  }

  /**
   * Push the localStorage preference bundle to the cloud `_preferences` row.
   * Kept separate so it can run even when data tables are empty.
   */
  static async pushPreferences(userId: string): Promise<void> {
    if (!isSupabaseConfigured) return
    const preferences = buildPreferences()
    await supabase
      .from('user_data')
      .upsert({
        user_id: userId,
        table_name: '_preferences',
        data: preferences,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,table_name',
      })
  }

  /**
   * Pull data from Supabase and REPLACE local IndexedDB.
   * SAFETY: Only called when local is confirmed EMPTY (new device / fresh install).
   * For merge scenarios, use mergeFromCloud() instead.
   */
  static async pullFromCloud(userId: string): Promise<{ success: boolean; error?: string; isEmpty?: boolean }> {
    if (!isSupabaseConfigured) return { success: false, error: 'Cloud sync not configured' }
    try {
      const { data: rows, error } = await supabase
        .from('user_data')
        .select('table_name, data, updated_at')
        .eq('user_id', userId)

      if (error) {
        return { success: false, error: error.message }
      }

      if (!rows || rows.length === 0) {
        return { success: true, isEmpty: true }
      }

      // Double-check: only restore if local is truly empty
      const localAccountCount = await db.accounts.count()
      const localTransactionCount = await db.transactions.count()
      if (localAccountCount > 0 || localTransactionCount > 0) {
        // Local has data — do NOT overwrite. Use mergeFromCloud instead.
        return { success: true, isEmpty: false }
      }

      // Safe to restore — local is empty
      for (const row of rows) {
        if (row.table_name === '_preferences') {
          applyPreferences(row.data as any)
          continue
        }

        const table = (db as any)[row.table_name]
        if (!table) continue

        const cloudData = row.data as any[]
        if (!Array.isArray(cloudData) || cloudData.length === 0) continue

        // Clear and restore (safe because we confirmed local is empty above)
        await table.clear()
        await table.bulkAdd(cloudData)

        // Restore profile to localStorage as backup
        if (row.table_name === 'userProfile' && cloudData.length > 0) {
          const profile = cloudData[0]
          if (profile) {
            localStorage.setItem('finance-os-profile', JSON.stringify({
              name: profile.name || '',
              email: profile.email || '',
              avatar: profile.avatar || undefined,
            }))
            if (profile.currency) {
              localStorage.setItem('finance-os-currency', profile.currency)
            }
          }
        }
      }

      localStorage.setItem('pennyflow-last-sync', new Date().toISOString())
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error' }
    }
  }

  /**
   * Merge local guest data INTO cloud account on first sign-in.
   * Strategy: Local data wins (it's the most recent user activity).
   * Cloud data for tables that are empty locally gets restored.
   * This preserves guest data while also restoring any previous cloud data the user had.
   */
  static async mergeLocalIntoCloud(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured) return { success: false, error: 'Cloud sync not configured' }
    try {
      // First, fetch what's in the cloud
      const { data: rows, error } = await supabase
        .from('user_data')
        .select('table_name, data, updated_at')
        .eq('user_id', userId)

      if (error) {
        // If cloud fetch fails, just push local data
        return await SyncService.pushToCloud(userId)
      }

      const cloudDataMap: Record<string, any[]> = {}
      if (rows) {
        for (const row of rows) {
          if (row.table_name === '_preferences') continue
          if (Array.isArray(row.data)) {
            cloudDataMap[row.table_name] = row.data
          }
        }
      }

      // For each table: if local has data → keep local (push to cloud later)
      // If local is empty but cloud has data → restore cloud data locally
      for (const tableName of SYNC_TABLES) {
        const table = (db as any)[tableName]
        if (!table) continue

        const localCount = await table.count()
        const cloudData = cloudDataMap[tableName]

        if (localCount === 0 && cloudData && cloudData.length > 0) {
          // Local empty, cloud has data → restore from cloud
          await table.bulkAdd(cloudData)
        }
        // If local has data → it stays (will be pushed to cloud below)
      }

      // Now push the merged result to cloud
      return await SyncService.pushToCloud(userId)
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error' }
    }
  }

  /**
   * Force-restore from cloud, REPLACING local data.
   *
   * Unlike pullFromCloud (which only restores when local is empty), this is the
   * explicit "get my old data back" action the user triggers from Settings.
   * It clears each synced table and repopulates it from the cloud copy, so a
   * user who reinstalled — or is on a device with stale/partial data — can pull
   * their real account back on demand. Guarded by a confirmation in the UI.
   *
   * Returns isEmpty:true (and changes nothing) if the account has no cloud data.
   */
  static async forceRestoreFromCloud(userId: string): Promise<{ success: boolean; error?: string; isEmpty?: boolean }> {
    if (!isSupabaseConfigured) return { success: false, error: 'Cloud sync not configured' }
    try {
      const { data: rows, error } = await supabase
        .from('user_data')
        .select('table_name, data, updated_at')
        .eq('user_id', userId)

      if (error) return { success: false, error: error.message }
      if (!rows || rows.length === 0) return { success: true, isEmpty: true }

      for (const row of rows) {
        if (row.table_name === '_preferences') {
          applyPreferences(row.data as any)
          continue
        }

        const table = (db as any)[row.table_name]
        if (!table) continue

        const cloudData = row.data as any[]
        if (!Array.isArray(cloudData)) continue

        // Replace local table contents with the cloud copy.
        await table.clear()
        if (cloudData.length > 0) await table.bulkAdd(cloudData)
      }

      localStorage.setItem('pennyflow-last-sync', new Date().toISOString())
      SyncService.markAccountLinked(userId)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error' }
    }
  }

  /**
   * Get last sync timestamp
   */
  static getLastSync(): string | null {
    return localStorage.getItem('pennyflow-last-sync')
  }

  /**
   * Check if this user has ever synced before
   */
  static hasEverSynced(): boolean {
    return !!localStorage.getItem('pennyflow-last-sync')
  }

  /**
   * Mark that the user's account has been linked (first sign-in merge done)
   */
  static markAccountLinked(userId: string): void {
    localStorage.setItem('pennyflow-account-linked', userId)
  }

  /**
   * Check if this device has already been linked to this user
   */
  static isAccountLinked(userId: string): boolean {
    return localStorage.getItem('pennyflow-account-linked') === userId
  }
}
