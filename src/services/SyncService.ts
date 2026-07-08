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
] as const

type SyncTable = typeof SYNC_TABLES[number]

export class SyncService {
  /**
   * Push all local IndexedDB data to Supabase
   * Called after user makes changes while logged in
   */
  static async pushToCloud(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
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
          console.error(`Sync push failed for ${tableName}:`, error)
          return { success: false, error: `Failed to sync ${tableName}: ${error.message}` }
        }
      }

      // Also sync localStorage preferences
      const preferences = {
        currency: localStorage.getItem('finance-os-currency') || 'INR',
        theme: localStorage.getItem('finance-os-theme') || 'dark',
        notifications: localStorage.getItem('finance-os-notifications') || 'true',
        profile: localStorage.getItem('finance-os-profile') || '{}',
        hiddenCategories: localStorage.getItem('pennyflow-hidden-categories') || '[]',
        customAccountTypes: localStorage.getItem('pennyflow-custom-account-types') || '[]',
        hiddenAccountTypes: localStorage.getItem('pennyflow-hidden-account-types') || '[]',
        dashOrder: localStorage.getItem('pennyflow-dash-order') || '[]',
        overviewOrder: localStorage.getItem('pennyflow-overview-order') || '[]',
      }

      const { error: prefError } = await supabase
        .from('user_data')
        .upsert({
          user_id: userId,
          table_name: '_preferences',
          data: preferences,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,table_name',
        })

      if (prefError) {
        console.error('Sync preferences failed:', prefError)
      }

      localStorage.setItem('pennyflow-last-sync', new Date().toISOString())
      return { success: true }
    } catch (err: any) {
      console.error('Push to cloud failed:', err)
      return { success: false, error: err.message || 'Unknown error' }
    }
  }

  /**
   * Pull data from Supabase and replace local IndexedDB
   * Called when user logs in on a new device
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

      // Restore each table
      for (const row of rows) {
        if (row.table_name === '_preferences') {
          // Restore preferences to localStorage
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
          continue
        }

        const table = (db as any)[row.table_name]
        if (!table) continue

        const cloudData = row.data as any[]
        if (!Array.isArray(cloudData)) continue

        // Clear local and replace with cloud data
        await table.clear()
        if (cloudData.length > 0) {
          await table.bulkAdd(cloudData)
        }
      }

      localStorage.setItem('pennyflow-last-sync', new Date().toISOString())
      return { success: true }
    } catch (err: any) {
      console.error('Pull from cloud failed:', err)
      return { success: false, error: err.message || 'Unknown error' }
    }
  }

  /**
   * Get last sync timestamp
   */
  static getLastSync(): string | null {
    return localStorage.getItem('pennyflow-last-sync')
  }
}
