/**
 * Phase 0.3: Smart Defaults & Predictive Input
 * Provides intelligent defaults for transaction entry
 */

const STORAGE_KEY_LAST_ACCOUNT = 'pennyflow-last-account-id'

export class SmartDefaultsService {
  /**
   * Get the last-used account ID
   */
  static getLastUsedAccount(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(STORAGE_KEY_LAST_ACCOUNT)
  }

  /**
   * Save the last-used account ID
   */
  static setLastUsedAccount(accountId: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY_LAST_ACCOUNT, accountId)
  }

  /**
   * Predict category based on time of day
   * Morning (6-11): Transport
   * Noon (11-14): Food
   * Afternoon (14-18): Shopping
   * Evening (18-22): Entertainment
   * Night (22-6): Utilities
   */
  static predictCategoryByTime(): string {
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 11) return 'Transport'
    if (hour >= 11 && hour < 14) return 'Food'
    if (hour >= 14 && hour < 18) return 'Shopping'
    if (hour >= 18 && hour < 22) return 'Entertainment'
    return 'Utilities'
  }

  /**
   * Suggest amount based on recent transactions in the same category
   * Returns the median of the last 10 transactions in that category
   */
  static suggestAmount(transactions: Array<{ category: string; amount: number }>, category: string): number | null {
    const categoryTxs = transactions
      .filter(tx => tx.category.toLowerCase() === category.toLowerCase())
      .map(tx => tx.amount)
      .slice(0, 10)

    if (categoryTxs.length < 3) return null // Not enough data

    // Calculate median
    const sorted = [...categoryTxs].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

    return Math.round(median)
  }

  /**
   * Get suggested amounts for quick display (rounded nice numbers)
   */
  static getSuggestedAmounts(transactions: Array<{ category: string; amount: number }>, category: string): number[] {
    const median = SmartDefaultsService.suggestAmount(transactions, category)
    if (!median) return []

    // Return 3 suggestions: lower, median, higher
    const lower = Math.round(median * 0.7 / 10) * 10
    const mid = Math.round(median / 10) * 10
    const higher = Math.round(median * 1.4 / 10) * 10

    return [...new Set([lower, mid, higher].filter(v => v > 0))]
  }
}
