/**
 * ReportingService
 * Generates comprehensive financial reports and analytics
 */

import { Transaction, Goal, Bill } from '@/db/schema'

export interface FinancialReport {
  period: 'month' | 'year' | 'quarter' | 'custom'
  startDate: string
  endDate: string
  totalIncome: number
  totalExpense: number
  netSavings: number
  savingsRate: number
  incomeByCategory: Array<{ category: string; amount: number; percentage: number }>
  expenseByCategory: Array<{ category: string; amount: number; percentage: number }>
  topExpenses: Array<{ description: string; category: string; amount: number; date: string }>
  topIncomes: Array<{ description: string; category: string; amount: number; date: string }>
  averageDailySpend: number
  averageDailyIncome: number
  trends: {
    weekOverWeek: number // percentage change
    monthOverMonth: number // percentage change
    yearOverYear?: number // percentage change
  }
}

export class ReportingService {
  /**
   * Generate comprehensive financial report
   */
  static generateReport(
    transactions: Transaction[],
    startDate: string,
    endDate: string,
    period: 'month' | 'year' | 'quarter' | 'custom' = 'month'
  ): FinancialReport {
    const start = new Date(startDate)
    const end = new Date(endDate)

    // Filter transactions in date range
    const periodTransactions = transactions.filter(tx => {
      const txDate = new Date(tx.date)
      return txDate >= start && txDate <= end
    })

    // Calculate totals
    let totalIncome = 0
    let totalExpense = 0

    const incomeByCategory: { [key: string]: number } = {}
    const expenseByCategory: { [key: string]: number } = {}

    periodTransactions.forEach(tx => {
      if (tx.type === 'income') {
        totalIncome += tx.amount
        incomeByCategory[tx.category] = (incomeByCategory[tx.category] || 0) + tx.amount
      } else {
        totalExpense += tx.amount
        expenseByCategory[tx.category] = (expenseByCategory[tx.category] || 0) + tx.amount
      }
    })

    // Calculate derived metrics
    const netSavings = totalIncome - totalExpense
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

    const daysInPeriod = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const averageDailySpend = daysInPeriod > 0 ? totalExpense / daysInPeriod : 0
    const averageDailyIncome = daysInPeriod > 0 ? totalIncome / daysInPeriod : 0

    // Format category breakdowns
    const incomeByCategories = Object.entries(incomeByCategory)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalIncome > 0 ? (amount / totalIncome) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)

    const expenseByCategories = Object.entries(expenseByCategory)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)

    // Get top transactions
    const topExpenses = periodTransactions
      .filter(tx => tx.type === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map(tx => ({
        description: tx.description,
        category: tx.category,
        amount: tx.amount,
        date: tx.date,
      }))

    const topIncomes = periodTransactions
      .filter(tx => tx.type === 'income')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map(tx => ({
        description: tx.description,
        category: tx.category,
        amount: tx.amount,
        date: tx.date,
      }))

    // Calculate trends (simple calculation)
    const trends = this.calculateTrends(transactions, startDate, endDate, period)

    return {
      period,
      startDate,
      endDate,
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate: Math.round(savingsRate * 10) / 10,
      incomeByCategory: incomeByCategories,
      expenseByCategory: expenseByCategories,
      topExpenses,
      topIncomes,
      averageDailySpend: Math.round(averageDailySpend * 100) / 100,
      averageDailyIncome: Math.round(averageDailyIncome * 100) / 100,
      trends,
    }
  }

  /**
   * Calculate trend percentages
   */
  private static calculateTrends(
    transactions: Transaction[],
    startDate: string,
    endDate: string,
    period: string
  ): { weekOverWeek: number; monthOverMonth: number; yearOverYear?: number } {
    const end = new Date(endDate)
    const periodDays = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))

    // Calculate previous period
    const prevStart = new Date(end)
    prevStart.setDate(prevStart.getDate() - periodDays * 2)
    const prevEnd = new Date(startDate)

    const currentExpenses = transactions
      .filter(tx => {
        const txDate = new Date(tx.date)
        return tx.type === 'expense' && txDate >= new Date(startDate) && txDate <= end
      })
      .reduce((sum, tx) => sum + tx.amount, 0)

    const previousExpenses = transactions
      .filter(tx => {
        const txDate = new Date(tx.date)
        return tx.type === 'expense' && txDate >= prevStart && txDate <= prevEnd
      })
      .reduce((sum, tx) => sum + tx.amount, 0)

    const weekOverWeek = previousExpenses > 0 
      ? Math.round(((currentExpenses - previousExpenses) / previousExpenses) * 100)
      : 0

    return {
      weekOverWeek,
      monthOverMonth: weekOverWeek, // Simplified - would calculate actual month
    }
  }

  /**
   * Generate CSV export
   */
  static generateCSV(report: FinancialReport): string {
    const lines: string[] = []

    // Header
    lines.push(`Financial Report - ${report.period.toUpperCase()}`)
    lines.push(`Period,${report.startDate} to ${report.endDate}`)
    lines.push('')

    // Summary
    lines.push('SUMMARY')
    lines.push(`Total Income,${report.totalIncome}`)
    lines.push(`Total Expense,${report.totalExpense}`)
    lines.push(`Net Savings,${report.netSavings}`)
    lines.push(`Savings Rate,${report.savingsRate}%`)
    lines.push('')

    // Income by category
    lines.push('INCOME BY CATEGORY')
    lines.push('Category,Amount,Percentage')
    report.incomeByCategory.forEach(item => {
      lines.push(`${item.category},${item.amount},${item.percentage.toFixed(2)}%`)
    })
    lines.push('')

    // Expense by category
    lines.push('EXPENSE BY CATEGORY')
    lines.push('Category,Amount,Percentage')
    report.expenseByCategory.forEach(item => {
      lines.push(`${item.category},${item.amount},${item.percentage.toFixed(2)}%`)
    })
    lines.push('')

    // Top transactions
    lines.push('TOP EXPENSES')
    lines.push('Description,Category,Amount,Date')
    report.topExpenses.forEach(item => {
      lines.push(`${item.description},${item.category},${item.amount},${item.date}`)
    })

    return lines.join('\n')
  }

  /**
   * Generate summary string
   */
  static generateSummaryText(report: FinancialReport): string {
    return `
Financial Summary (${report.startDate} to ${report.endDate})

💰 Income: ₹${report.totalIncome.toFixed(2)}
💸 Expense: ₹${report.totalExpense.toFixed(2)}
📈 Savings: ₹${report.netSavings.toFixed(2)}
📊 Savings Rate: ${report.savingsRate}%

Top Expense Categories:
${report.expenseByCategory.slice(0, 3).map(cat => `  • ${cat.category}: ₹${cat.amount.toFixed(2)} (${cat.percentage.toFixed(1)}%)`).join('\n')}

Trend: ${report.trends.monthOverMonth > 0 ? '📈 Up' : '📉 Down'} ${Math.abs(report.trends.monthOverMonth)}% vs previous period
    `.trim()
  }
}
