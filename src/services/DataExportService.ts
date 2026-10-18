/**
 * DataExportService
 * Handles data export and backup functionality
 */

import { Transaction, Bill, Goal, Asset, Lending, Budget, db } from '@/db/schema'

/** All IndexedDB tables included in a full local backup. */
const BACKUP_TABLES = [
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
  'financialBriefs',
  'systemLogs',
  'userProfile',
  'debts',
  'subscriptions',
  'templates',
  'splits',
  'sharedWallets',
] as const

/** localStorage preference keys included in a full local backup. */
const BACKUP_PREF_KEYS = [
  'finance-os-currency',
  'finance-os-theme',
  'finance-os-notifications',
  'finance-os-profile',
  'finance-os-onboarding-done',
  'pennyflow-hidden-categories',
  'pennyflow-category-order',
  'pennyflow-custom-account-types',
  'pennyflow-hidden-account-types',
  'pennyflow-dash-order',
  'pennyflow-overview-order',
] as const

/** Shape of the local backup file this app produces. */
export interface FullBackupFile {
  app: 'pennyflow'
  type: 'full-backup'
  version: number
  exportDate: string
  tables: Record<string, unknown[]>
  preferences: Record<string, string>
}

/** localStorage key that records the most recent backup (any destination). */
export const LAST_BACKUP_KEY = 'pennyflow-last-backup'

export interface LastBackupInfo {
  at: string // ISO timestamp
  destination: 'local' | 'cloud'
}

/** Record that a backup just completed, for the profile card's "Last backup" line. */
export function recordBackup(destination: 'local' | 'cloud'): LastBackupInfo {
  const info: LastBackupInfo = { at: new Date().toISOString(), destination }
  try {
    localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(info))
  } catch {
    // Non-fatal — the timestamp is cosmetic.
  }
  return info
}

/** Read the last backup info, or null if the user has never backed up. */
export function getLastBackup(): LastBackupInfo | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.at === 'string') return parsed as LastBackupInfo
    return null
  } catch {
    return null
  }
}

export class DataExportService {
  /**
   * Export all data as JSON
   */
  static exportAsJSON(
    transactions: Transaction[],
    bills: Bill[],
    goals: Goal[],
    assets: Asset[],
    lending: Lending[],
    budgets: Budget[]
  ): string {
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      data: {
        transactions,
        bills,
        goals,
        assets,
        lending,
        budgets,
      },
    }
    return JSON.stringify(exportData, null, 2)
  }

  /**
   * Export as CSV (transactions)
   */
  static exportTransactionsAsCSV(transactions: Transaction[]): string {
    const headers = ['Date', 'Type', 'Category', 'Amount', 'Description', 'Account']
    const rows = transactions.map(tx => [
      tx.date,
      tx.type,
      tx.category,
      tx.amount,
      tx.description,
      tx.accountId,
    ])

    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }

  /**
   * Build a complete backup of every IndexedDB table + user preferences.
   * This is the payload written to the local backup file.
   */
  static async buildFullBackup(): Promise<FullBackupFile> {
    const tables: Record<string, unknown[]> = {}
    for (const name of BACKUP_TABLES) {
      const table = (db as unknown as Record<string, { toArray?: () => Promise<unknown[]> }>)[name]
      if (table && typeof table.toArray === 'function') {
        try {
          tables[name] = await table.toArray()
        } catch {
          tables[name] = []
        }
      }
    }

    const preferences: Record<string, string> = {}
    if (typeof window !== 'undefined') {
      for (const key of BACKUP_PREF_KEYS) {
        const val = localStorage.getItem(key)
        if (val !== null) preferences[key] = val
      }
    }

    return {
      app: 'pennyflow',
      type: 'full-backup',
      version: 1,
      exportDate: new Date().toISOString(),
      tables,
      preferences,
    }
  }

  /**
   * Create a full local backup and trigger a download to the device's
   * Downloads folder. Returns the generated filename.
   */
  static async downloadFullBackup(): Promise<{ success: boolean; filename?: string; error?: string }> {
    try {
      const backup = await this.buildFullBackup()
      const date = new Date().toISOString().split('T')[0]
      const filename = `pennyflow-backup-${date}.json`
      const content = JSON.stringify(backup, null, 2)
      const blob = new Blob([content], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      recordBackup('local')
      return { success: true, filename }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Backup failed' }
    }
  }

  /**
   * Generate backup filename
   */
  static generateBackupFilename(type: 'json' | 'csv'): string {
    const date = new Date().toISOString().split('T')[0]
    const time = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-')
    return `pennyflow-backup-${date}-${time}.${type}`
  }

  /**
   * Create downloadable backup
   */
  static triggerDownload(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.URL.revokeObjectURL(url)
  }

  /**
   * Import from JSON
   */
  static parseJSONImport(jsonString: string): any {
    try {
      const data = JSON.parse(jsonString)
      return data.data || data
    } catch (err) {
      throw new Error('Invalid JSON format')
    }
  }

  /**
   * Generate backup summary
   */
  static generateBackupSummary(
    transactionCount: number,
    billCount: number,
    goalCount: number,
    assetCount: number,
    budgetCount: number
  ): string {
    return `
📦 Backup Summary

📝 Transactions: ${transactionCount}
📋 Bills: ${billCount}
🎯 Goals: ${goalCount}
💰 Assets: ${assetCount}
📊 Budgets: ${budgetCount}

Backed up: ${new Date().toLocaleString()}
    `.trim()
  }
}
