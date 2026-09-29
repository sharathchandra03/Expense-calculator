/**
 * BudgetManagementService
 * Handles budget creation, tracking, and alert management
 */

import { Transaction, Budget } from '@/db/schema'

export interface BudgetStatus {
  budgetId: string
  budgetName: string
  category: string
  limit: number
  spent: number
  remaining: number
  percentUsed: number
  status: 'under' | 'warning' | 'exceeded' // green, yellow, red
  daysLeftInPeriod: number
  averageDailySpend: number
}

export class BudgetManagementService {
  /**
   * Calculate spent amount for a category in current period
   */
  static calculateCategorySpend(
    transactions: Transaction[],
    category: string,
    startDate: string,
    endDate: string
  ): number {
    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')

    return transactions
      .filter(tx => {
        const txDate = new Date(tx.date + 'T00:00:00')
        return (
          tx.type === 'expense' &&
          tx.category === category &&
          txDate >= start &&
          // end is exclusive (it's the start of the next period) so a
          // transaction on the boundary counts toward the new period only.
          txDate < end
        )
      })
      .reduce((sum, tx) => sum + tx.amount, 0)
  }

  /**
   * Get budget status with visual indicators.
   * The window (start/end) passed in is the CURRENT period the budget applies
   * to — see getCurrentPeriod — so `spent` and `daysLeft` reflect the active
   * period, not the original creation window.
   */
  static getBudgetStatus(budget: Budget, spent: number, periodEnd: string): BudgetStatus {
    const remaining = Math.max(0, budget.limit - spent)
    const percentUsed = budget.limit > 0 ? (spent / budget.limit) * 100 : 0

    // Determine status based on threshold
    let status: 'under' | 'warning' | 'exceeded' = 'under'
    if (percentUsed >= 100) {
      status = 'exceeded'
    } else if (percentUsed >= budget.alertThreshold) {
      status = 'warning'
    }

    // Days left until the current period ends
    const daysLeft = Math.max(0, Math.ceil((new Date(periodEnd).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    const averageDailySpend = daysLeft > 0 ? spent / daysLeft : spent

    return {
      budgetId: budget.id,
      budgetName: budget.name,
      category: budget.category,
      limit: budget.limit,
      spent,
      remaining,
      percentUsed: Math.round(percentUsed * 10) / 10,
      status,
      daysLeftInPeriod: daysLeft,
      averageDailySpend: Math.round(averageDailySpend * 100) / 100,
    }
  }

  /**
   * Get all budget statuses, each evaluated against its CURRENT period window
   * (rolled forward from the original start date) so recurring budgets keep
   * tracking spend after their first period elapses.
   */
  static getAllBudgetStatuses(budgets: Budget[], transactions: Transaction[]): BudgetStatus[] {
    return budgets
      .filter(b => b.isActive)
      .map(budget => {
        const { start, end } = this.getCurrentPeriod(budget)
        const spent = this.calculateCategorySpend(transactions, budget.category, start, end)
        return this.getBudgetStatus(budget, spent, end)
      })
  }

  /**
   * Compute the active period window for a budget.
   *
   * - If the budget has an explicit `endDate`, it's a fixed-term budget and is
   *   NOT rolled — the window is [startDate, endDate].
   * - Otherwise the window rolls forward by `period` until it contains today,
   *   so a monthly budget created on Jan 1 tracks Feb 1–Mar 1 during February,
   *   and so on. Budgets whose start date is in the future use their first
   *   upcoming period.
   *
   * Returns YYYY-MM-DD start (inclusive) and end (exclusive-ish) strings.
   */
  static getCurrentPeriod(budget: Budget): { start: string; end: string } {
    // Fixed-term budget: honor the explicit window, no rollover.
    if (budget.endDate) {
      return { start: budget.startDate, end: budget.endDate }
    }

    const now = new Date()
    now.setHours(0, 0, 0, 0)

    let start = new Date(budget.startDate + 'T00:00:00')
    // Guard against malformed dates.
    if (isNaN(start.getTime())) {
      start = new Date(now)
    }

    const advance = (d: Date): Date => {
      const next = new Date(d)
      switch (budget.period) {
        case 'weekly':
          next.setDate(next.getDate() + 7)
          break
        case 'monthly':
          next.setMonth(next.getMonth() + 1)
          break
        case 'yearly':
          next.setFullYear(next.getFullYear() + 1)
          break
      }
      return next
    }

    let end = advance(start)

    // Roll forward until `now` falls within [start, end). Cap iterations to
    // avoid any chance of an infinite loop on bad data.
    let guard = 0
    while (end.getTime() <= now.getTime() && guard < 10000) {
      start = end
      end = advance(start)
      guard++
    }

    const toStr = (d: Date) => d.toISOString().split('T')[0]
    return { start: toStr(start), end: toStr(end) }
  }

  /**
   * Check if any budget needs alert
   */
  static getBudgetAlerts(budgets: Budget[], transactions: Transaction[]): BudgetStatus[] {
    return this.getAllBudgetStatuses(budgets, transactions)
      .filter(status => status.status === 'warning' || status.status === 'exceeded')
  }

  /**
   * Get end date for budget period
   */
  static getEndDateForPeriod(startDate: string, period: 'weekly' | 'monthly' | 'yearly'): string {
    const start = new Date(startDate)
    const end = new Date(start)

    switch (period) {
      case 'weekly':
        end.setDate(end.getDate() + 7)
        break
      case 'monthly':
        end.setMonth(end.getMonth() + 1)
        break
      case 'yearly':
        end.setFullYear(end.getFullYear() + 1)
        break
    }

    return end.toISOString().split('T')[0]
  }

  /**
   * Forecast if budget will be exceeded
   */
  static forecastBudgetExceeded(
    currentSpend: number,
    limit: number,
    daysLeft: number,
    daysSinceStart: number
  ): boolean {
    if (daysLeft <= 0) return currentSpend > limit
    
    const averageDailySpend = currentSpend / Math.max(daysSinceStart, 1)
    const projectedSpend = currentSpend + (averageDailySpend * daysLeft)
    
    return projectedSpend > limit
  }

  /**
   * Get budget recommendations
   */
  static getBudgetRecommendations(
    categorySpends: { category: string; amount: number }[],
    historicalMonths: number = 3
  ): Array<{ category: string; recommendedBudget: number; averageSpend: number }> {
    return categorySpends
      .map(spend => ({
        category: spend.category,
        averageSpend: spend.amount,
        recommendedBudget: Math.ceil(spend.amount * 1.1), // 10% buffer
      }))
      .sort((a, b) => b.averageSpend - a.averageSpend)
  }

  /**
   * Generate budget summary
   */
  static generateBudgetSummary(budgetStatuses: BudgetStatus[]): {
    totalBudgetLimit: number
    totalSpent: number
    totalRemaining: number
    overallPercentUsed: number
    budgetsOnTrack: number
    budgetsWarning: number
    budgetsExceeded: number
  } {
    const summary = {
      totalBudgetLimit: 0,
      totalSpent: 0,
      totalRemaining: 0,
      overallPercentUsed: 0,
      budgetsOnTrack: 0,
      budgetsWarning: 0,
      budgetsExceeded: 0,
    }

    budgetStatuses.forEach(status => {
      summary.totalBudgetLimit += status.limit
      summary.totalSpent += status.spent
      summary.totalRemaining += status.remaining

      if (status.status === 'under') {
        summary.budgetsOnTrack++
      } else if (status.status === 'warning') {
        summary.budgetsWarning++
      } else {
        summary.budgetsExceeded++
      }
    })

    summary.overallPercentUsed = summary.totalBudgetLimit > 0 
      ? Math.round((summary.totalSpent / summary.totalBudgetLimit) * 100)
      : 0

    return summary
  }
}
