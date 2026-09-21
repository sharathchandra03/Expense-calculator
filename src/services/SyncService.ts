import { supabase } from '@/lib/supabase'
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
] as const

type SyncTable = typeof SYNC_TABLES[number]

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
    try {
      // Safety check: don't push if local DB appears empty
      // (prevents overwriting cloud backup with nothing)
      const accountCount = await db.accounts.count()
      const transactionCount = await db.transactions.count()
      if (accountCount === 0 && transactionCount === 0) {
        // Check if user has ANY data at all (goals, bills, etc.)
        const goalsCount = await db.goals.count()
        const billsCount = await db.bills.count()
        if (goalsCount === 0 && billsCount === 0) {
          // Truly empty — skip push to avoid wiping cloud backup
          return { success: true }
        }
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
      const preferences = {
        currency: localStorage.getItem('finance-os-currency') || 'INR',
        theme: localStorage.getItem('finance-os-theme') || 'light',
        notifications: localStorage.getItem('finance-os-notifications') || 'true',
        profile: localStorage.getItem('finance-os-profile') || '{}',
        hiddenCategories: localStorage.getItem('pennyflow-hidden-categories') || '[]',
        customAccountTypes: localStorage.getItem('pennyflow-custom-account-types') || '[]',
        hiddenAccountTypes: localStorage.getItem('pennyflow-hidden-account-types') || '[]',
        dashOrder: localStorage.getItem('pennyflow-dash-order') || '[]',
        overviewOrder: localStorage.getItem('pennyflow-overview-order') || '[]',
        onboardingDone: localStorage.getItem('finance-os-onboarding-done') || '',
      }

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

      localStorage.setItem('pennyflow-last-sync', new Date().toISOString())
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || 'Unknown error' }
    }
  }

  /**
   * Pull data from Supabase and REPLACE local IndexedDB.
   * SAFETY: Only called when local is confirmed EMPTY (new device / fresh install).
   * For merge scenarios, use mergeFromCloud() instead.
   */
  static async pullFromCloud(userId: string): Promise<{ success: boolean; error?: string; isEmpty?: boolean }> {
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
          const prefs = row.data as any
          if (prefs.currency) localStorage.setItem('finance-os-currency', prefs.currency)
          if (prefs.theme) localStorage.setItem('finance-os-theme', prefs.theme)
          if (prefs.notifications) localStorage.setItem('finance-os-notifications', prefs.notifications)
          if (prefs.profile) localStorage.setItem('finance-os-profile', prefs.profile)
          if (prefs.hiddenCategories) localStorage.setItem('pennyflow-hidden-categories', prefs.hiddenCategories)
          if (prefs.customAccountTypes) localStorage.setItem('pennyflow-custom-account-types', prefs.customAccountTypes)
          if (prefs.hiddenAccountTypes) localStorage.setItem('pennyflow-hidden-account-types', prefs.hiddenAccountTypes)
          if (prefs.dashOrder) localStorage.setItem('pennyflow-dash-order', prefs.dashOrder)
          if (prefs.overviewOrder) localStorage.setItem('pennyflow-overview-order', prefs.overviewOrder)
          if (prefs.onboardingDone) localStorage.setItem('finance-os-onboarding-done', prefs.onboardingDone)
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
