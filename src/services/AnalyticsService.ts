/**
 * AnalyticsService
 * 
 * Provides spending analysis and insights.
 * No UI dependencies. Pure business logic.
 */

import { Transaction } from '@/db/schema'

export interface CategorySpending {
  category: string
  amount: number
  percentage: number
  trend: 'up' | 'down' | 'stable'
}

export interface SpendingAnomaly {
  category: string
  amount: number
  averageAmount: number
  deviation: number
  severity: 'mild' | 'moderate' | 'severe'
}

export interface DailySpending {
  date: string
  amount: number
}

export class AnalyticsService {
  /**
   * Get spending breakdown by category for a given month
   */
  static getSpendingByCategory(
    transactions: Transaction[],
    month?: number,
    year?: number
  ): CategorySpending[] {
    const now = new Date()
    const targetMonth = month ?? now.getMonth()
    const targetYear = year ?? now.getFullYear()

    const categoryTotals: { [key: string]: number } = {}
    let totalExpenses = 0

    transactions.forEach(tx => {
      const txDate = new Date(tx.date)
      const isTargetMonth = txDate.getMonth() === targetMonth && txDate.getFullYear() === targetYear

      if (isTargetMonth && tx.type === 'expense') {
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount
        totalExpenses += tx.amount
      }
    })

    return Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
        trend: 'stable' as const, // TODO: Compare with previous month
      }))
      .sort((a, b) => b.amount - a.amount)
  }

  /**
   * Get spending trend for a specific category
   */
  static getSpendingTrend(
    transactions: Transaction[],
    category: string,
    monthsBack: number = 6
  ): { month: string; amount: number }[] {
    const trend: { [key: string]: number } = {}
    const now = new Date()

    // Initialize last N months
    for (let i = monthsBack - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = date.toISOString().substring(0, 7) // YYYY-MM
      trend[key] = 0
    }

    // Aggregate spending
    transactions.forEach(tx => {
      if (tx.type === 'expense' && tx.category.toLowerCase() === category.toLowerCase()) {
        const key = tx.date.substring(0, 7) // YYYY-MM
        if (key in trend) {
          trend[key] += tx.amount
        }
      }
    })

    return Object.entries(trend).map(([month, amount]) => ({
      month,
      amount
    }))
  }

  /**
   * Detect spending anomalies (unusual spending in a category)
   */
  static detectAnomalies(
    transactions: Transaction[],
    threshold: number = 1.5 // 50% above average
  ): SpendingAnomaly[] {
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear

    // Get this month's spending by category
    const thisMonthSpending: { [key: string]: number } = {}
    const lastMonthSpending: { [key: string]: number } = {}

    transactions.forEach(tx => {
      if (tx.type === 'expense') {
        const txDate = new Date(tx.date)
        
        if (txDate.getMonth() === thisMonth && txDate.getFullYear() === thisYear) {
          thisMonthSpending[tx.category] = (thisMonthSpending[tx.category] || 0) + tx.amount
        }
        
        if (txDate.getMonth() === lastMonth && txDate.getFullYear() === lastMonthYear) {
          lastMonthSpending[tx.category] = (lastMonthSpending[tx.category] || 0) + tx.amount
        }
      }
    })

    // Find anomalies
    const anomalies: SpendingAnomaly[] = []

    Object.entries(thisMonthSpending).forEach(([category, amount]) => {
      const average = lastMonthSpending[category] || amount * 0.8
      const deviation = (amount - average) / average

      if (deviation > (threshold - 1)) {
        let severity: 'mild' | 'moderate' | 'severe' = 'mild'
        if (deviation > 1) severity = 'moderate'
        if (deviation > 2) severity = 'severe'

        anomalies.push({
          category,
          amount,
          averageAmount: average,
          deviation: Math.round(deviation * 100),
          severity
        })
      }
    })

    return anomalies.sort((a, b) => b.deviation - a.deviation)
  }

  /**
   * Get daily spending for a month
   */
  static getDailySpending(
    transactions: Transaction[],
    month?: number,
    year?: number
  ): DailySpending[] {
    const now = new Date()
    const targetMonth = month ?? now.getMonth()
    const targetYear = year ?? now.getFullYear()

    const dailyTotals: { [key: string]: number } = {}

    transactions.forEach(tx => {
      const txDate = new Date(tx.date)
      const isTargetMonth = txDate.getMonth() === targetMonth && txDate.getFullYear() === targetYear

      if (isTargetMonth && tx.type === 'expense') {
        const dateKey = tx.date
        dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + tx.amount
      }
    })

    return Object.entries(dailyTotals)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /**
   * Calculate average daily spending
   */
  static getAverageDailySpending(
    transactions: Transaction[],
    month?: number,
    year?: number
  ): number {
    const daily = this.getDailySpending(transactions, month, year)
    if (daily.length === 0) return 0
    const total = daily.reduce((sum, d) => sum + d.amount, 0)
    return Math.round((total / daily.length) * 100) / 100
  }

  /**
   * Get spending velocity (rate of daily spending)
   */
  static getSpendingVelocity(transactions: Transaction[]): 'high' | 'normal' | 'low' {
    const now = new Date()
    const daysIntoMonth = now.getDate()
    const avgDaily = this.getAverageDailySpending(transactions)

    const expectedMonthlyAtCurrentRate = avgDaily * 30
    const historicalAverage = 3000 // TODO: Calculate from historical data

    if (expectedMonthlyAtCurrentRate > historicalAverage * 1.3) return 'high'
    if (expectedMonthlyAtCurrentRate < historicalAverage * 0.7) return 'low'
    return 'normal'
  }

  /**
   * Get top spending categories for this month
   */
  static getTopCategories(
    transactions: Transaction[],
    limit: number = 5
  ): CategorySpending[] {
    const spending = this.getSpendingByCategory(transactions)
    return spending.slice(0, limit)
  }

  /**
   * Get monthly comparison (current month vs previous month)
   */
  static getMonthlyComparison(transactions: Transaction[]): {
    currentMonth: number
    previousMonth: number
    change: number
    changePercent: number
  } {
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear

    let thisMonthSpending = 0
    let lastMonthSpending = 0

    transactions.forEach(tx => {
      if (tx.type === 'expense') {
        const txDate = new Date(tx.date)
        
        if (txDate.getMonth() === thisMonth && txDate.getFullYear() === thisYear) {
          thisMonthSpending += tx.amount
        }
        
        if (txDate.getMonth() === lastMonth && txDate.getFullYear() === lastMonthYear) {
          lastMonthSpending += tx.amount
        }
      }
    })

    const change = thisMonthSpending - lastMonthSpending
    const changePercent = lastMonthSpending > 0 ? (change / lastMonthSpending) * 100 : 0

    return {
      currentMonth: Math.round(thisMonthSpending * 100) / 100,
      previousMonth: Math.round(lastMonthSpending * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 10) / 10
    }
  }

  /**
   * Detect recurring transactions
   */
  static detectRecurringTransactions(
    transactions: Transaction[],
    minOccurrences: number = 3
  ): Array<{
    description: string
    amount: number
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
    occurrences: number
  }> {
    const similar: { [key: string]: Date[] } = {}

    transactions.forEach(tx => {
      const key = `${tx.description}-${tx.amount}`
      if (!similar[key]) similar[key] = []
      similar[key].push(new Date(tx.date))
    })

    const recurring: Array<any> = []

    Object.entries(similar).forEach(([key, dates]) => {
      if (dates.length < minOccurrences) return

      const sorted = dates.sort((a, b) => a.getTime() - b.getTime())
      const intervals: number[] = []

      for (let i = 1; i < sorted.length; i++) {
        const daysDiff = Math.floor((sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24))
        intervals.push(daysDiff)
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
      let frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'monthly'

      if (avgInterval < 2) frequency = 'daily'
      else if (avgInterval < 14) frequency = 'weekly'
      else if (avgInterval < 45) frequency = 'monthly'
      else frequency = 'yearly'

      const [description, amount] = key.split('-')
      recurring.push({
        description,
        amount: parseFloat(amount),
        frequency,
        occurrences: dates.length
      })
    })

    return recurring
  }
}
