/**
 * HealthScoreService
 * 
 * Calculates comprehensive financial health metrics for PennyFlow.
 * No UI dependencies. Pure business logic for financial analysis.
 */

import { Transaction, Lending, Asset, Bill } from '@/db/schema'

export interface HealthScoreBreakdown {
  score: number // 0-100
  trend: 'improving' | 'declining' | 'stable'
  savingsRate: number // percentage
  debtRatio: number // percentage
  emergencyFundCoverage: number // percentage
  liquidityScore: number // percentage
  insights: string[]
}

export interface FinancialMetrics {
  netWorth: number
  monthlyIncome: number
  monthlyExpenses: number
  totalDebt: number
  liquidAssets: number
  investedAssets: number
  monthlyRecurring: number
  emergencyFundTarget: number
}

export class HealthScoreService {
  /**
   * Calculate comprehensive financial health score (0-100)
   * Factors:
   * - Savings rate (30% weight): >20% excellent, >10% good, positive acceptable
   * - Debt ratio (25% weight): <30% excellent, <50% good, <100% acceptable
   * - Emergency fund coverage (25% weight): >6mo excellent, >3mo good, >1mo acceptable
   * - Liquidity score (20% weight): >50% of net worth is liquid
   */
  static calculateHealthScore(
    transactions: Transaction[],
    lending: Lending[],
    assets: Asset[],
    bills: Bill[]
  ): HealthScoreBreakdown {
    const metrics = this.calculateMetrics(transactions, lending, assets, bills)
    const { netWorth, monthlyIncome, monthlyExpenses, totalDebt, liquidAssets, investedAssets, monthlyRecurring, emergencyFundTarget } = metrics

    // Calculate individual components
    const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0
    const debtRatio = netWorth > 0 ? (totalDebt / netWorth) * 100 : 0
    const emergencyFundCoverage = monthlyExpenses > 0 ? ((liquidAssets - monthlyRecurring) / (monthlyExpenses * emergencyFundTarget)) * 100 : 0
    const liquidityScore = netWorth > 0 ? (liquidAssets / (liquidAssets + investedAssets)) * 100 : 0

    // Score each component (0-100)
    const savingsScore = this.scoreSavingsRate(savingsRate)
    const debtScore = this.scoreDebtRatio(debtRatio)
    const emergencyScore = this.scoreEmergencyFund(emergencyFundCoverage)
    const liquidityComponent = Math.min(100, liquidityScore * 1.5) // Normalize

    // Weighted average: 30% savings, 25% debt, 25% emergency, 20% liquidity
    const score = Math.round(
      savingsScore * 0.3 +
      debtScore * 0.25 +
      emergencyScore * 0.25 +
      liquidityComponent * 0.2
    )

    // Determine trend (simple: if savings > 15%, improving; if debt growing, declining)
    let trend: 'improving' | 'declining' | 'stable' = 'stable'
    if (savingsRate > 15 && debtRatio < 50) {
      trend = 'improving'
    } else if (savingsRate < -5 || debtRatio > 70) {
      trend = 'declining'
    }

    // Generate insights
    const insights = this.generateInsights(savingsRate, debtRatio, emergencyFundCoverage, liquidityScore)

    return {
      score: Math.max(0, Math.min(100, score)),
      trend,
      savingsRate: Math.round(savingsRate * 10) / 10,
      debtRatio: Math.round(debtRatio * 10) / 10,
      emergencyFundCoverage: Math.max(0, Math.round(emergencyFundCoverage * 10) / 10),
      liquidityScore: Math.round(liquidityScore * 10) / 10,
      insights
    }
  }

  /**
   * Calculate all metrics needed for health score
   */
  static calculateMetrics(
    transactions: Transaction[],
    lending: Lending[],
    assets: Asset[],
    bills: Bill[]
  ): FinancialMetrics {
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear

    // Calculate monthly income and expenses
    let monthlyIncome = 0
    let monthlyExpenses = 0

    transactions.forEach(tx => {
      const txDate = new Date(tx.date)
      const isThisMonth = txDate.getMonth() === thisMonth && txDate.getFullYear() === thisYear

      if (isThisMonth) {
        if (tx.type === 'income') {
          monthlyIncome += tx.amount
        } else if (tx.type === 'expense') {
          monthlyExpenses += tx.amount
        }
      }
    })

    // Calculate net worth
    const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0)
    const activeLent = lending
      .filter(l => l.type === 'lent' && l.status === 'active')
      .reduce((sum, l) => sum + l.amount, 0)
    const activeBorrowed = lending
      .filter(l => l.type === 'borrowed' && l.status === 'active')
      .reduce((sum, l) => sum + l.amount, 0)

    const netWorth = totalAssets + activeLent - activeBorrowed

    // Separate liquid and invested assets
    const liquidAssets = assets
      .filter(a => a.type === 'cash' || a.type === 'bank')
      .reduce((sum, a) => sum + a.balance, 0)

    const investedAssets = assets
      .filter(a => a.type !== 'cash' && a.type !== 'bank')
      .reduce((sum, a) => sum + a.balance, 0)

    // Calculate recurring bills this month
    const monthlyRecurring = bills
      .filter(b => !b.isPaid && (
        (new Date(b.dueDate).getMonth() === thisMonth && new Date(b.dueDate).getFullYear() === thisYear) ||
        b.isRecurring
      ))
      .reduce((sum, b) => sum + b.amount, 0)

    // Emergency fund target: 6 months of expenses (or at least $5000)
    const emergencyFundTarget = Math.max(6, monthlyExpenses > 0 ? 6 : 1)

    return {
      netWorth,
      monthlyIncome,
      monthlyExpenses,
      totalDebt: activeBorrowed,
      liquidAssets,
      investedAssets,
      monthlyRecurring,
      emergencyFundTarget
    }
  }

  /**
   * Score savings rate (0-100)
   * >20%: 100, >10%: 80, >0%: 60, <0%: 30
   */
  private static scoreSavingsRate(rate: number): number {
    if (rate >= 20) return 100
    if (rate >= 15) return 90
    if (rate >= 10) return 80
    if (rate >= 5) return 70
    if (rate >= 0) return 60
    if (rate >= -5) return 40
    return 20
  }

  /**
   * Score debt ratio (0-100)
   * <30%: 100, <50%: 80, <75%: 60, <100%: 40, >100%: 10
   */
  private static scoreDebtRatio(ratio: number): number {
    if (ratio <= 20) return 100
    if (ratio <= 30) return 90
    if (ratio <= 50) return 80
    if (ratio <= 75) return 60
    if (ratio <= 100) return 40
    if (ratio <= 150) return 20
    return 10
  }

  /**
   * Score emergency fund coverage (0-100)
   * >6mo: 100, >3mo: 80, >1mo: 60, >0: 40, 0: 10
   */
  private static scoreEmergencyFund(coverage: number): number {
    if (coverage >= 100) return 100
    if (coverage >= 50) return 80
    if (coverage >= 33) return 70
    if (coverage >= 25) return 60
    if (coverage >= 8) return 40
    if (coverage > 0) return 20
    return 5
  }

  /**
   * Generate actionable insights based on metrics
   */
  private static generateInsights(
    savingsRate: number,
    debtRatio: number,
    emergencyFundCoverage: number,
    liquidityScore: number
  ): string[] {
    const insights: string[] = []

    if (savingsRate > 20) {
      insights.push('💚 Excellent savings rate - you\'re building wealth fast')
    } else if (savingsRate > 10) {
      insights.push('👍 Good savings habit - keep it going')
    } else if (savingsRate < 0) {
      insights.push('⚠️ Spending more than earning - consider cutting back')
    }

    if (debtRatio > 75) {
      insights.push('🚨 High debt relative to net worth - prioritize paydown')
    } else if (debtRatio > 50) {
      insights.push('⚠️ Moderate debt - continue gradual payoff')
    } else if (debtRatio < 20) {
      insights.push('✨ Low debt - excellent financial position')
    }

    if (emergencyFundCoverage < 25) {
      insights.push('💡 Build emergency fund - target 6 months expenses')
    } else if (emergencyFundCoverage > 100) {
      insights.push('🎯 Emergency fund complete - consider investments')
    }

    if (liquidityScore > 70) {
      insights.push('💰 Good liquidity - you have flexibility')
    } else if (liquidityScore < 30) {
      insights.push('🔒 Most money is invested - lower flexibility')
    }

    return insights.slice(0, 3) // Return top 3 insights
  }

  /**
   * Get color for health score (for UI)
   */
  static getHealthColor(score: number): string {
    if (score >= 80) return '#10b981' // Emerald - excellent
    if (score >= 60) return '#f59e0b' // Amber - good
    if (score >= 40) return '#ef8a5c' // Orange - fair
    return '#ef4444' // Red - poor
  }

  /**
   * Get emoji for score
   */
  static getHealthEmoji(score: number): string {
    if (score >= 80) return '🌟'
    if (score >= 60) return '👍'
    if (score >= 40) return '⚠️'
    return '🚨'
  }

  /**
   * Calculate spending trend for this month
   */
  static getMonthlySpendingTrend(transactions: Transaction[]): { current: number; previous: number; change: number; changePercent: number } {
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear

    let thisMonthSpending = 0
    let lastMonthSpending = 0

    transactions.forEach(tx => {
      const txDate = new Date(tx.date)
      const isThisMonth = txDate.getMonth() === thisMonth && txDate.getFullYear() === thisYear
      const isLastMonth = txDate.getMonth() === lastMonth && txDate.getFullYear() === lastMonthYear

      if (tx.type === 'expense') {
        if (isThisMonth) thisMonthSpending += tx.amount
        if (isLastMonth) lastMonthSpending += tx.amount
      }
    })

    const change = thisMonthSpending - lastMonthSpending
    const changePercent = lastMonthSpending > 0 ? (change / lastMonthSpending) * 100 : 0

    return {
      current: thisMonthSpending,
      previous: lastMonthSpending,
      change,
      changePercent
    }
  }

  /**
   * Get spending by category for current month
   */
  static getMonthlySpendingByCategory(
    transactions: Transaction[]
  ): Array<{ category: string; amount: number; percentage: number }> {
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()

    const categorySpending: { [key: string]: number } = {}
    let totalExpenses = 0

    transactions.forEach(tx => {
      const txDate = new Date(tx.date)
      const isThisMonth = txDate.getMonth() === thisMonth && txDate.getFullYear() === thisYear

      if (isThisMonth && tx.type === 'expense') {
        categorySpending[tx.category] = (categorySpending[tx.category] || 0) + tx.amount
        totalExpenses += tx.amount
      }
    })

    return Object.entries(categorySpending)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount)
  }

  /**
   * Check if cash is below recommended threshold
   */
  static isLowCash(liquidAssets: number, monthlyExpenses: number): boolean {
    // Warn if cash < 1 month of expenses
    return liquidAssets < monthlyExpenses
  }

  /**
   * Calculate cash available after obligations
   */
  static getAvailableCash(liquidAssets: number, monthlyRecurring: number): number {
    return liquidAssets - monthlyRecurring
  }
}
