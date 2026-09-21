/**
 * BudgetService
 * 
 * Handles budget calculations and tracking.
 * No UI dependencies. Pure business logic.
 */

import { Transaction, Bill } from '@/db/schema'

export interface BudgetStatus {
  category: string
  budget: number
  spent: number
  remaining: number
  percentUsed: number
  isOverBudget: boolean
}

export interface BudgetRecommendation {
  category: string
  recommendedBudget: number
  currentSpending: number
  reason: string
}

export class BudgetService {
  /**
   * Get budget status for a category
   */
  static calculateBudgetStatus(
    category: string,
    budgetLimit: number,
    transactions: Transaction[]
  ): BudgetStatus {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    let spent = 0

    transactions.forEach(tx => {
      const txDate = new Date(tx.date)
      if (
        tx.type === 'expense' &&
        tx.category.toLowerCase() === category.toLowerCase() &&
        txDate.getMonth() === currentMonth &&
        txDate.getFullYear() === currentYear
      ) {
        spent += tx.amount
      }
    })

    const remaining = budgetLimit - spent
    const percentUsed = budgetLimit > 0 ? (spent / budgetLimit) * 100 : 0
    const isOverBudget = spent > budgetLimit

    return {
      category,
      budget: budgetLimit,
      spent,
      remaining,
      percentUsed: Math.round(percentUsed * 10) / 10,
      isOverBudget
    }
  }

  /**
   * Get all budget statuses for common categories
   */
  static getAllBudgetStatuses(
    transactions: Transaction[],
    budgets: { [category: string]: number }
  ): BudgetStatus[] {
    return Object.entries(budgets).map(([category, budget]) =>
      this.calculateBudgetStatus(category, budget, transactions)
    )
  }

  /**
   * Recommend budgets based on historical spending
   */
  static recommendBudgets(
    transactions: Transaction[],
    monthsOfHistory: number = 3
  ): BudgetRecommendation[] {
    const now = new Date()
    const categorySpending: { [key: string]: number[] } = {}

    // Collect spending by category for each month
    for (let i = 0; i < monthsOfHistory; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const month = date.getMonth()
      const year = date.getFullYear()

      transactions.forEach(tx => {
        if (tx.type === 'expense') {
          const txDate = new Date(tx.date)
          if (txDate.getMonth() === month && txDate.getFullYear() === year) {
            if (!categorySpending[tx.category]) {
              categorySpending[tx.category] = []
            }
            categorySpending[tx.category].push(tx.amount)
          }
        }
      })
    }

    // Calculate recommendations
    const recommendations: BudgetRecommendation[] = []

    Object.entries(categorySpending).forEach(([category, amounts]) => {
      if (amounts.length === 0) return

      const average = amounts.reduce((a, b) => a + b, 0) / amounts.length
      const max = Math.max(...amounts)
      
      // Recommend 20% above max to provide buffer
      const recommendedBudget = Math.round(max * 1.2 * 100) / 100
      const currentSpending = Math.round(amounts[0] * 100) / 100

      let reason = `Based on ${monthsOfHistory} months of history`
      if (max > average * 1.5) {
        reason += ` (including spike month)`
      }

      recommendations.push({
        category,
        recommendedBudget,
        currentSpending,
        reason
      })
    })

    return recommendations.sort((a, b) => b.recommendedBudget - a.recommendedBudget)
  }

  /**
   * Check if spending is on track for the month
   */
  static isOnTrack(
    transactions: Transaction[],
    monthlyIncome: number
  ): boolean {
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysIntoMonth = now.getDate()
    const percentIntoMonth = daysIntoMonth / daysInMonth

    let monthlySpending = 0
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    transactions.forEach(tx => {
      if (tx.type === 'expense') {
        const txDate = new Date(tx.date)
        if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
          monthlySpending += tx.amount
        }
      }
    })

    const expectedSpending = monthlyIncome * 0.8 * percentIntoMonth // Assume 80% burn rate is normal
    return monthlySpending <= expectedSpending
  }

  /**
   * Get projected spending for the month
   */
  static getProjectedMonthlySpending(transactions: Transaction[]): number {
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysIntoMonth = now.getDate()

    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    let monthlySpending = 0

    transactions.forEach(tx => {
      if (tx.type === 'expense') {
        const txDate = new Date(tx.date)
        if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
          monthlySpending += tx.amount
        }
      }
    })

    if (daysIntoMonth === 0) return monthlySpending
    return Math.round((monthlySpending / daysIntoMonth) * daysInMonth * 100) / 100
  }

  /**
   * Get budget warnings (categories overspending or close to limit)
   */
  static getBudgetWarnings(
    transactions: Transaction[],
    budgets: { [category: string]: number },
    warningThreshold: number = 0.8 // 80% of budget
  ): BudgetStatus[] {
    const statuses = this.getAllBudgetStatuses(transactions, budgets)
    return statuses.filter(status => status.percentUsed >= warningThreshold * 100)
  }

  /**
   * Calculate ideal budget allocation based on income
   */
  static getIdealBudgetAllocation(monthlyIncome: number): {
    needs: number
    wants: number
    savings: number
  } {
    // 50/30/20 rule
    return {
      needs: Math.round(monthlyIncome * 0.5 * 100) / 100,
      wants: Math.round(monthlyIncome * 0.3 * 100) / 100,
      savings: Math.round(monthlyIncome * 0.2 * 100) / 100
    }
  }

  /**
   * Check if spending aligns with ideal allocation
   */
  static checkAllocationAlignment(
    transactions: Transaction[],
    monthlyIncome: number,
    categorization: { [category: string]: 'needs' | 'wants' | 'savings' }
  ): {
    needsPercent: number
    wantsPercent: number
    savingsPercent: number
    status: 'good' | 'warning' | 'critical'
  } {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    let needsSpent = 0
    let wantsSpent = 0
    let savingsSpent = 0
    let totalSpent = 0

    transactions.forEach(tx => {
      if (tx.type === 'expense') {
        const txDate = new Date(tx.date)
        if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
          totalSpent += tx.amount
          const category = categorization[tx.category]

          if (category === 'needs') needsSpent += tx.amount
          else if (category === 'wants') wantsSpent += tx.amount
          else if (category === 'savings') savingsSpent += tx.amount
        }
      }
    })

    const needsPercent = totalSpent > 0 ? (needsSpent / monthlyIncome) * 100 : 0
    const wantsPercent = totalSpent > 0 ? (wantsSpent / monthlyIncome) * 100 : 0
    const savingsPercent = totalSpent > 0 ? (savingsSpent / monthlyIncome) * 100 : 0

    let status: 'good' | 'warning' | 'critical' = 'good'
    if (needsPercent > 60 || wantsPercent > 40) status = 'warning'
    if (needsPercent > 70 || wantsPercent > 50) status = 'critical'

    return {
      needsPercent: Math.round(needsPercent * 10) / 10,
      wantsPercent: Math.round(wantsPercent * 10) / 10,
      savingsPercent: Math.round(savingsPercent * 10) / 10,
      status
    }
  }
}
