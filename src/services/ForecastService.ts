/**
 * ForecastService
 * 
 * Provides financial forecasting and projections.
 * No UI dependencies. Pure business logic.
 */

import { Transaction, Lending, Asset, Bill } from '@/db/schema'

export interface CashFlowForecast {
  month: string
  openingBalance: number
  inflows: number
  outflows: number
  closingBalance: number
  surplus: number
}

export interface FinancialProjection {
  currentNetWorth: number
  projectedNetWorth: number
  monthsOut: number
  savingsRate: number
  projection: 'growing' | 'stable' | 'declining'
}

export class ForecastService {
  /**
   * Forecast next 12 months of cash flow
   */
  static getCashFlowForecast(
    transactions: Transaction[],
    bills: Bill[],
    currentBalance: number,
    monthsAhead: number = 12
  ): CashFlowForecast[] {
    const forecast: CashFlowForecast[] = []
    let balance = currentBalance

    const now = new Date()

    for (let i = 0; i < monthsAhead; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const month = date.toISOString().substring(0, 7)

      let inflows = 0
      let outflows = 0

      // Calculate average monthly inflows and outflows from historical data
      transactions.forEach(tx => {
        const txDate = new Date(tx.date)
        if (txDate.getMonth() === date.getMonth() || i === 0) {
          if (tx.type === 'income') inflows += tx.amount
          else if (tx.type === 'expense') outflows += tx.amount
        }
      })

      // Add bills
      bills.forEach(bill => {
        if (bill.isRecurring) {
          outflows += bill.amount
        }
      })

      const surplus = inflows - outflows
      balance += surplus

      forecast.push({
        month,
        openingBalance: balance - surplus,
        inflows,
        outflows,
        closingBalance: balance,
        surplus
      })
    }

    return forecast
  }

  /**
   * Project net worth growth
   */
  static projectNetWorth(
    currentNetWorth: number,
    monthlyIncome: number,
    monthlyExpenses: number,
    investmentReturn: number = 0.07, // 7% annual
    monthsAhead: number = 12
  ): FinancialProjection {
    const monthlySavings = monthlyIncome - monthlyExpenses
    const monthlyReturnRate = Math.pow(1 + investmentReturn, 1 / 12) - 1

    let projectedNetWorth = currentNetWorth
    let totalSavings = 0

    for (let i = 0; i < monthsAhead; i++) {
      projectedNetWorth *= (1 + monthlyReturnRate)
      projectedNetWorth += monthlySavings
      totalSavings += monthlySavings
    }

    const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0

    let projection: 'growing' | 'stable' | 'declining'
    if (monthlySavings > 0) projection = 'growing'
    else if (monthlySavings < 0) projection = 'declining'
    else projection = 'stable'

    return {
      currentNetWorth,
      projectedNetWorth: Math.round(projectedNetWorth * 100) / 100,
      monthsOut: monthsAhead,
      savingsRate: Math.round(savingsRate * 10) / 10,
      projection
    }
  }

  /**
   * Detect cash crises (when balance goes negative)
   */
  static detectCashCrisis(forecast: CashFlowForecast[]): string[] {
    const months: string[] = []
    forecast.forEach(month => {
      if (month.closingBalance < 0) {
        months.push(month.month)
      }
    })
    return months
  }

  /**
   * Get warning if forecast shows overspending
   */
  static getForecastWarning(
    transactions: Transaction[],
    currentBalance: number,
    monthlyIncome: number
  ): string | null {
    // Calculate average spending
    const last90Days = new Date()
    last90Days.setDate(last90Days.getDate() - 90)

    let recentSpending = 0
    let dayCount = 0

    transactions.forEach(tx => {
      if (new Date(tx.date) >= last90Days && tx.type === 'expense') {
        recentSpending += tx.amount
        dayCount++
      }
    })

    if (dayCount === 0) return null

    const avgDailySpending = recentSpending / dayCount
    const projectedMonthlySpending = avgDailySpending * 30

    if (projectedMonthlySpending > monthlyIncome) {
      const excess = Math.round((projectedMonthlySpending - monthlyIncome) * 100) / 100
      return `⚠️ Spending ${excess} more than income monthly at current rate`
    }

    if (currentBalance < projectedMonthlySpending) {
      const months = Math.round(currentBalance / projectedMonthlySpending * 10) / 10
      return `⚠️ Cash runway: ~${months} months at current spending`
    }

    return null
  }

  /**
   * Get time to reach a financial goal
   */
  static timeToGoal(
    currentAssets: number,
    targetAmount: number,
    monthlySavings: number,
    annualReturn: number = 0.07
  ): number {
    if (monthlySavings <= 0) return -1 // Impossible

    const monthlyReturnRate = Math.pow(1 + annualReturn, 1 / 12) - 1
    let balance = currentAssets
    let months = 0

    while (balance < targetAmount && months < 1200) { // 100 years max
      balance *= (1 + monthlyReturnRate)
      balance += monthlySavings
      months++
    }

    return months === 1200 ? -1 : months
  }

  /**
   * Calculate required savings to reach goal
   */
  static savingsNeededForGoal(
    currentAssets: number,
    targetAmount: number,
    monthsAvailable: number,
    annualReturn: number = 0.07
  ): number {
    if (monthsAvailable <= 0) return 0

    const monthlyReturnRate = Math.pow(1 + annualReturn, 1 / 12) - 1
    let balance = currentAssets

    // Apply returns first
    for (let i = 0; i < monthsAvailable; i++) {
      balance *= (1 + monthlyReturnRate)
    }

    // Calculate remaining needed
    const remaining = Math.max(0, targetAmount - balance)

    // Calculate monthly savings needed (simplified)
    return Math.round((remaining / monthsAvailable) * 100) / 100
  }

  /**
   * Get spending prediction for next week
   */
  static getWeekSpendingPrediction(transactions: Transaction[]): {
    predicted: number
    confidence: number
    trend: 'high' | 'normal' | 'low'
  } {
    const last30Days = new Date()
    last30Days.setDate(last30Days.getDate() - 30)

    let weeklySpending: number[] = []
    const now = new Date()

    // Collect weekly spending for past 30 days
    for (let week = 0; week < 4; week++) {
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - (4 - week) * 7)
      weekStart.setHours(0, 0, 0, 0)

      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      let weekTotal = 0
      transactions.forEach(tx => {
        const txDate = new Date(tx.date)
        if (tx.type === 'expense' && txDate >= weekStart && txDate < weekEnd) {
          weekTotal += tx.amount
        }
      })

      if (weekTotal > 0) weeklySpending.push(weekTotal)
    }

    if (weeklySpending.length === 0) {
      return { predicted: 0, confidence: 0, trend: 'normal' }
    }

    const average = weeklySpending.reduce((a, b) => a + b) / weeklySpending.length
    const latestWeek = weeklySpending[weeklySpending.length - 1]
    const variance = Math.sqrt(
      weeklySpending.reduce((sum, w) => sum + Math.pow(w - average, 2), 0) / weeklySpending.length
    )
    const confidence = Math.max(0, Math.min(100, 100 - (variance / average) * 50))

    let trend: 'high' | 'normal' | 'low' = 'normal'
    if (latestWeek > average * 1.2) trend = 'high'
    else if (latestWeek < average * 0.8) trend = 'low'

    return {
      predicted: Math.round(average * 100) / 100,
      confidence: Math.round(confidence * 10) / 10,
      trend
    }
  }

  /**
   * Get best savings opportunity (which category to cut to save most)
   */
  static getBestSavingOpportunity(
    transactions: Transaction[],
    threshold: number = 1.5 // 50% above average
  ): { category: string; potential: number; reason: string } | null {
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()

    const categorySpending: { [key: string]: number } = {}

    transactions.forEach(tx => {
      if (tx.type === 'expense') {
        const txDate = new Date(tx.date)
        if (txDate.getMonth() === thisMonth && txDate.getFullYear() === thisYear) {
          categorySpending[tx.category] = (categorySpending[tx.category] || 0) + tx.amount
        }
      }
    })

    let opportunity: { category: string; potential: number; reason: string } | null = null
    let maxSavings = 0

    Object.entries(categorySpending).forEach(([category, amount]) => {
      // Estimate how much could be saved (assume 20% reduction is achievable)
      const potential = Math.round(amount * 0.2 * 100) / 100

      if (potential > maxSavings) {
        maxSavings = potential
        opportunity = {
          category,
          potential,
          reason: `Reduce ${category} by 20% to save ${Math.round(potential * 100) / 100}`
        }
      }
    })

    return opportunity
  }
}
