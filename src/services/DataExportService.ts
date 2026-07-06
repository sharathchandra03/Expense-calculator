/**
 * DataExportService
 * Handles data export and backup functionality
 */

import { Transaction, Bill, Goal, Asset, Lending, Budget } from '@/db/schema'

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
   * Generate backup filename
   */
  static generateBackupFilename(type: 'json' | 'csv'): string {
    const date = new Date().toISOString().split('T')[0]
    const time = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-')
    return `financeOS-backup-${date}-${time}.${type}`
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
