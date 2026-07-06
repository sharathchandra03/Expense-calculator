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
    const start = new Date(startDate)
    const end = new Date(endDate)

    return transactions
      .filter(tx => {
        const txDate = new Date(tx.date)
        return (
          tx.type === 'expense' &&
          tx.category === category &&
          txDate >= start &&
          txDate <= end
        )
      })
      .reduce((sum, tx) => sum + tx.amount, 0)
  }

  /**
   * Get budget status with visual indicators
   */
  static getBudgetStatus(budget: Budget, spent: number): BudgetStatus {
    const remaining = Math.max(0, budget.limit - spent)
    const percentUsed = (spent / budget.limit) * 100
    
    // Determine status based on threshold
    let status: 'under' | 'warning' | 'exceeded' = 'under'
    if (percentUsed >= 100) {
      status = 'exceeded'
    } else if (percentUsed >= budget.alertThreshold) {
      status = 'warning'
    }

    // Calculate days left in period
    const endDate = budget.endDate || this.getEndDateForPeriod(budget.startDate, budget.period)
    const daysLeft = Math.max(0, Math.ceil((new Date(endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    const averageDailySpend = daysLeft > 0 ? spent / (daysLeft || 1) : 0

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
   * Get all budget statuses
   */
  static getAllBudgetStatuses(budgets: Budget[], transactions: Transaction[]): BudgetStatus[] {
    return budgets
      .filter(b => b.isActive)
      .map(budget => {
        const endDate = budget.endDate || this.getEndDateForPeriod(budget.startDate, budget.period)
        const spent = this.calculateCategorySpend(transactions, budget.category, budget.startDate, endDate)
        return this.getBudgetStatus(budget, spent)
      })
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
