/**
 * SearchService
 * 
 * Global search across transactions, goals, bills, contacts.
 * No UI dependencies. Pure business logic.
 */

import { Transaction, Goal, Bill } from '@/db/schema'

export interface SearchResult {
  id: string
  type: 'transaction' | 'goal' | 'bill'
  title: string
  subtitle: string
  amount?: number
  date?: string
  icon: string
}

export class SearchService {
  /**
   * Global search across all financial items
   */
  static search(
    query: string,
    transactions: Transaction[] = [],
    goals: Goal[] = [],
    bills: Bill[] = [],
    limit: number = 20
  ): SearchResult[] {
    const lowerQuery = query.toLowerCase().trim()
    if (!lowerQuery) return []

    const results: SearchResult[] = []

    // Search transactions
    transactions.forEach(tx => {
      if (
        tx.description.toLowerCase().includes(lowerQuery) ||
        tx.category.toLowerCase().includes(lowerQuery) ||
        formatCurrency(tx.amount).includes(lowerQuery)
      ) {
        results.push({
          id: tx.id,
          type: 'transaction',
          title: tx.description,
          subtitle: `${tx.category} • ${tx.date}`,
          amount: tx.type === 'income' ? tx.amount : -tx.amount,
          date: tx.date,
          icon: tx.type === 'income' ? '➕' : '➖'
        })
      }
    })

    // Search goals
    goals.forEach(goal => {
      if (
        goal.title.toLowerCase().includes(lowerQuery) ||
        goal.category.toLowerCase().includes(lowerQuery)
      ) {
        results.push({
          id: goal.id,
          type: 'goal',
          title: goal.title,
          subtitle: `Goal • ${Math.round((goal.currentAmount / goal.targetAmount) * 100)}% complete`,
          amount: goal.targetAmount,
          icon: '🎯'
        })
      }
    })

    // Search bills
    bills.forEach(bill => {
      if (
        bill.title.toLowerCase().includes(lowerQuery) ||
        bill.category.toLowerCase().includes(lowerQuery) ||
        bill.dueDate.includes(lowerQuery)
      ) {
        results.push({
          id: bill.id,
          type: 'bill',
          title: bill.title,
          subtitle: `Bill • Due ${bill.dueDate}${bill.isPaid ? ' (Paid)' : ''}`,
          amount: bill.amount,
          date: bill.dueDate,
          icon: bill.isPaid ? '✅' : '📅'
        })
      }
    })

    return results.slice(0, limit)
  }

  /**
   * Search only transactions
   */
  static searchTransactions(
    query: string,
    transactions: Transaction[],
    limit: number = 50
  ): SearchResult[] {
    const lowerQuery = query.toLowerCase().trim()
    if (!lowerQuery) return []

    return transactions
      .filter(tx =>
        tx.description.toLowerCase().includes(lowerQuery) ||
        tx.category.toLowerCase().includes(lowerQuery)
      )
      .map(tx => ({
        id: tx.id,
        type: 'transaction' as const,
        title: tx.description,
        subtitle: `${tx.category} • ${tx.date}`,
        amount: tx.type === 'income' ? tx.amount : -tx.amount,
        date: tx.date,
        icon: tx.type === 'income' ? '➕' : '➖'
      }))
      .slice(0, limit)
  }

  /**
   * Search by amount range
   */
  static searchByAmount(
    minAmount: number,
    maxAmount: number,
    transactions: Transaction[],
    limit: number = 50
  ): SearchResult[] {
    return transactions
      .filter(tx => tx.amount >= minAmount && tx.amount <= maxAmount)
      .map(tx => ({
        id: tx.id,
        type: 'transaction' as const,
        title: tx.description,
        subtitle: `${tx.category} • ${tx.date}`,
        amount: tx.type === 'income' ? tx.amount : -tx.amount,
        date: tx.date,
        icon: tx.type === 'income' ? '➕' : '➖'
      }))
      .slice(0, limit)
  }

  /**
   * Search by category
   */
  static searchByCategory(
    category: string,
    transactions: Transaction[],
    limit: number = 50
  ): SearchResult[] {
    return transactions
      .filter(tx => tx.category.toLowerCase() === category.toLowerCase())
      .map(tx => ({
        id: tx.id,
        type: 'transaction' as const,
        title: tx.description,
        subtitle: `${tx.category} • ${tx.date}`,
        amount: tx.type === 'income' ? tx.amount : -tx.amount,
        date: tx.date,
        icon: tx.type === 'income' ? '➕' : '➖'
      }))
      .slice(0, limit)
  }

  /**
   * Search by date range
   */
  static searchByDateRange(
    startDate: string,
    endDate: string,
    transactions: Transaction[],
    limit: number = 50
  ): SearchResult[] {
    return transactions
      .filter(tx => tx.date >= startDate && tx.date <= endDate)
      .map(tx => ({
        id: tx.id,
        type: 'transaction' as const,
        title: tx.description,
        subtitle: `${tx.category} • ${tx.date}`,
        amount: tx.type === 'income' ? tx.amount : -tx.amount,
        date: tx.date,
        icon: tx.type === 'income' ? '➕' : '➖'
      }))
      .slice(0, limit)
  }

  /**
   * Get recent searches (from localStorage)
   */
  static getRecentSearches(limit: number = 5): string[] {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem('finance-os-recent-searches')
    if (!stored) return []
    return JSON.parse(stored).slice(0, limit)
  }

  /**
   * Save search to recent (in localStorage)
   */
  static saveSearch(query: string): void {
    if (typeof window === 'undefined') return
    const recent = this.getRecentSearches(10)
    const filtered = recent.filter(s => s !== query)
    localStorage.setItem('finance-os-recent-searches', JSON.stringify([query, ...filtered]))
  }

  /**
   * Clear recent searches
   */
  static clearRecentSearches(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem('finance-os-recent-searches')
  }

  /**
   * Get suggestions based on partial query
   */
  static getSuggestions(
    query: string,
    transactions: Transaction[] = [],
    goals: Goal[] = [],
    bills: Bill[] = [],
    limit: number = 10
  ): string[] {
    const lowerQuery = query.toLowerCase().trim()
    if (!lowerQuery) {
      return this.getRecentSearches(limit)
    }

    const suggestions = new Set<string>()

    // Suggest from descriptions
    transactions.forEach(tx => {
      if (tx.description.toLowerCase().includes(lowerQuery)) {
        suggestions.add(tx.description)
      }
    })

    // Suggest from categories
    transactions.forEach(tx => {
      if (tx.category.toLowerCase().includes(lowerQuery)) {
        suggestions.add(tx.category)
      }
    })

    // Suggest from goal titles
    goals.forEach(goal => {
      if (goal.title.toLowerCase().includes(lowerQuery)) {
        suggestions.add(goal.title)
      }
    })

    // Suggest from bill titles
    bills.forEach(bill => {
      if (bill.title.toLowerCase().includes(lowerQuery)) {
        suggestions.add(bill.title)
      }
    })

    return Array.from(suggestions).slice(0, limit)
  }

  /**
   * Fuzzy search (more lenient matching)
   */
  static fuzzySearch(
    query: string,
    transactions: Transaction[],
    limit: number = 20
  ): SearchResult[] {
    const lowerQuery = query.toLowerCase().replace(/\s+/g, '')
    if (!lowerQuery) return []

    const scored = transactions
      .map(tx => ({
        tx,
        score: this.calculateFuzzyScore(lowerQuery, tx.description.toLowerCase())
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)

    return scored.slice(0, limit).map(item => ({
      id: item.tx.id,
      type: 'transaction' as const,
      title: item.tx.description,
      subtitle: `${item.tx.category} • ${item.tx.date}`,
      amount: item.tx.type === 'income' ? item.tx.amount : -item.tx.amount,
      date: item.tx.date,
      icon: item.tx.type === 'income' ? '➕' : '➖'
    }))
  }

  /**
   * Calculate fuzzy match score
   */
  private static calculateFuzzyScore(query: string, text: string): number {
    let score = 0
    let queryIdx = 0

    for (let i = 0; i < text.length && queryIdx < query.length; i++) {
      if (text[i] === query[queryIdx]) {
        score += 1
        queryIdx++
      }
    }

    return queryIdx === query.length ? score : 0
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount)
}
