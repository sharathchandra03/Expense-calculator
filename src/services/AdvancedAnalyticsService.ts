/**
 * AdvancedAnalyticsService
 * Advanced analytics, trends, and predictions
 */

import { Transaction } from '@/db/schema'

export interface AnalyticsTrend {
  period: string
  income: number
  expense: number
  savings: number
  trend: 'up' | 'down' | 'stable'
}

export interface SpendingPattern {
  dayOfWeek: string
  averageSpend: number
  frequency: number
  topCategories: string[]
}

export class AdvancedAnalyticsService {
  /**
   * Calculate income vs expense trends
   */
  static calculateTrends(transactions: Transaction[], months: number = 6): AnalyticsTrend[] {
    const trends: AnalyticsTrend[] = []
    const now = new Date()

    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)

      const monthTransactions = transactions.filter(tx => {
        const txDate = new Date(tx.date)
        return txDate >= monthStart && txDate <= monthEnd
      })

      const income = monthTransactions
        .filter(tx => tx.type === 'income')
        .reduce((sum, tx) => sum + tx.amount, 0)

      const expense = monthTransactions
        .filter(tx => tx.type === 'expense')
        .reduce((sum, tx) => sum + tx.amount, 0)

      const savings = income - expense
      const period = monthStart.toLocaleString('default', { month: 'short' })

      trends.push({
        period,
        income,
        expense,
        savings,
        trend: savings > 0 ? 'up' : savings < 0 ? 'down' : 'stable',
      })
    }

    return trends
  }

  /**
   * Identify spending patterns by day of week
   */
  static analyzeSpendingPatterns(transactions: Transaction[]): SpendingPattern[] {
    const patterns: { [key: string]: { amount: number; count: number; categories: Set<string> } } = {}
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    transactions
      .filter(tx => tx.type === 'expense')
      .forEach(tx => {
        const dayOfWeek = daysOfWeek[new Date(tx.date).getDay()]
        if (!patterns[dayOfWeek]) {
          patterns[dayOfWeek] = { amount: 0, count: 0, categories: new Set() }
        }
        patterns[dayOfWeek].amount += tx.amount
        patterns[dayOfWeek].count++
        patterns[dayOfWeek].categories.add(tx.category)
      })

    return daysOfWeek.map(day => ({
      dayOfWeek: day,
      averageSpend: patterns[day] ? patterns[day].amount / Math.max(1, patterns[day].count) : 0,
      frequency: patterns[day]?.count || 0,
      topCategories: patterns[day] ? Array.from(patterns[day].categories).slice(0, 3) : [],
    }))
  }

  /**
   * Predict next month expenses
   */
  static predictNextMonthExpense(transactions: Transaction[], months: number = 3): number {
    const now = new Date()
    const monthTransactions: { [key: number]: number } = {}

    transactions
      .filter(tx => tx.type === 'expense')
      .forEach(tx => {
        const txDate = new Date(tx.date)
        const monthKey = txDate.getFullYear() * 12 + txDate.getMonth()
        monthTransactions[monthKey] = (monthTransactions[monthKey] || 0) + tx.amount
      })

    const recentMonths = Object.values(monthTransactions).slice(-months)
    const average = recentMonths.length > 0
      ? recentMonths.reduce((a, b) => a + b, 0) / recentMonths.length
      : 0

    // Add 10% buffer for uncertainty
    return Math.round(average * 1.1 * 100) / 100
  }

  /**
   * Identify unusual spending
   */
  static identifyAnomalies(transactions: Transaction[], threshold: number = 1.5): Transaction[] {
    const categoryStats: { [key: string]: number[] } = {}

    transactions
      .filter(tx => tx.type === 'expense')
      .forEach(tx => {
        if (!categoryStats[tx.category]) categoryStats[tx.category] = []
        categoryStats[tx.category].push(tx.amount)
      })

    // Calculate average and std dev for each category
    const anomalies: Transaction[] = []

    transactions
      .filter(tx => tx.type === 'expense')
      .forEach(tx => {
        const amounts = categoryStats[tx.category]
        if (amounts.length > 2) {
          const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length
          const stdDev = Math.sqrt(
            amounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / amounts.length
          )

          if (Math.abs(tx.amount - avg) > threshold * stdDev) {
            anomalies.push(tx)
          }
        }
      })

    return anomalies
  }

  /**
   * Calculate category trends
   */
  static analyzeCategoryTrends(
    transactions: Transaction[],
    category: string,
    months: number = 6
  ): AnalyticsTrend[] {
    const trends: AnalyticsTrend[] = []
    const now = new Date()

    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)

      const categoryTransactions = transactions.filter(tx => {
        const txDate = new Date(tx.date)
        return (
          tx.category === category &&
          txDate >= monthStart &&
          txDate <= monthEnd
        )
      })

      const expense = categoryTransactions
        .filter(tx => tx.type === 'expense')
        .reduce((sum, tx) => sum + tx.amount, 0)

      const period = monthStart.toLocaleString('default', { month: 'short' })

      trends.push({
        period,
        income: 0,
        expense,
        savings: -expense,
        trend: expense > 0 ? 'up' : 'stable',
      })
    }

    return trends
  }

  /**
   * Generate financial insights
   */
  static generateInsights(transactions: Transaction[]): string[] {
    const insights: string[] = []

    // Calculate metrics
    const totalIncome = transactions
      .filter(tx => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0)

    const totalExpense = transactions
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0)

    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0

    if (savingsRate > 30) {
      insights.push('💚 Excellent savings rate! You\'re saving more than 30% of income.')
    } else if (savingsRate < 0) {
      insights.push('⚠️ Negative savings - you\'re spending more than earning.')
    }

    // Top categories
    const categorySpend: { [key: string]: number } = {}
    transactions
      .filter(tx => tx.type === 'expense')
      .forEach(tx => {
        categorySpend[tx.category] = (categorySpend[tx.category] || 0) + tx.amount
      })

    const topCategory = Object.entries(categorySpend).sort((a, b) => b[1] - a[1])[0]
    if (topCategory && topCategory[1] > totalExpense * 0.3) {
      insights.push(`📊 ${topCategory[0]} is your biggest expense (${((topCategory[1] / totalExpense) * 100).toFixed(0)}% of spending).`)
    }

    // Recurring detection
    const recurring = transactions.filter(tx => tx.isRecurring).length
    if (recurring > 0) {
      const recurringTotal = transactions
        .filter(tx => tx.isRecurring)
        .reduce((sum, tx) => sum + tx.amount, 0)
      insights.push(`🔄 ${recurring} recurring transactions totaling ${recurring} entries per month.`)
    }

    return insights
  }
}
