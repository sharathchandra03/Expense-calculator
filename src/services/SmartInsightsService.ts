/**
 * Phase 2.7: Smart Suggestions / AI Insights
 * Rule-based client-side engine — no external API needed
 * Detects spending spikes, category trends, unusual transactions
 */

import { Transaction, Budget } from '@/db/schema'
import { formatCurrency } from '@/lib/utils'

export interface Insight {
  id: string
  type: 'spike' | 'trend' | 'unusual' | 'suggestion' | 'positive'
  title: string
  message: string
  severity: 'info' | 'warning' | 'positive'
  category?: string
  amount?: number
}

export class SmartInsightsService {
  /**
   * Generate all insights from transaction data
   */
  static generateInsights(
    transactions: Transaction[],
    budgets: Budget[]
  ): Insight[] {
    const insights: Insight[] = []
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // Get this month's and last month's expenses
    const thisMonthTx = transactions.filter(tx => {
      const d = new Date(tx.date)
      return tx.type === 'expense' && d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })

    const lastMonth = new Date(currentYear, currentMonth - 1, 1)
    const lastMonthTx = transactions.filter(tx => {
      const d = new Date(tx.date)
      return tx.type === 'expense' && d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear()
    })

    // This week vs average week
    const dayOfWeek = now.getDay()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - dayOfWeek)
    const weekStartStr = weekStart.toISOString().split('T')[0]

    const thisWeekTx = thisMonthTx.filter(tx => tx.date >= weekStartStr)
    const thisWeekTotal = thisWeekTx.reduce((sum, tx) => sum + tx.amount, 0)

    // 1. Spending Spike Detection (week over week)
    const avgWeeklySpend = lastMonthTx.length > 0
      ? lastMonthTx.reduce((sum, tx) => sum + tx.amount, 0) / 4.3
      : 0

    if (avgWeeklySpend > 0 && thisWeekTotal > avgWeeklySpend * 1.4) {
      const pctOver = Math.round(((thisWeekTotal / avgWeeklySpend) - 1) * 100)
      insights.push({
        id: 'spike-weekly',
        type: 'spike',
        title: 'Spending Spike',
        message: `You've spent ${pctOver}% more this week than your weekly average`,
        severity: 'warning',
        amount: thisWeekTotal,
      })
    }

    // 2. Category Trends (compare this month vs last month per category)
    const categories = [...new Set(thisMonthTx.map(tx => tx.category))]
    for (const cat of categories) {
      const thisMonthCat = thisMonthTx.filter(tx => tx.category === cat).reduce((s, tx) => s + tx.amount, 0)
      const lastMonthCat = lastMonthTx.filter(tx => tx.category === cat).reduce((s, tx) => s + tx.amount, 0)

      if (lastMonthCat > 0 && thisMonthCat > lastMonthCat * 1.4 && thisMonthCat > 500) {
        const pct = Math.round(((thisMonthCat / lastMonthCat) - 1) * 100)
        insights.push({
          id: `trend-${cat}`,
          type: 'trend',
          title: `${cat} spending up`,
          message: `You spent ${pct}% more on ${cat} this month compared to last month`,
          severity: 'warning',
          category: cat,
          amount: thisMonthCat,
        })
      }
    }

    // 3. Unusual Transaction Detection (> 3x median for that category)
    for (const cat of categories) {
      const catTx = transactions.filter(tx => tx.type === 'expense' && tx.category === cat)
      if (catTx.length < 5) continue

      const amounts = catTx.map(tx => tx.amount).sort((a, b) => a - b)
      const median = amounts[Math.floor(amounts.length / 2)]

      const recentUnusual = thisMonthTx.filter(tx => tx.category === cat && tx.amount > median * 3)
      for (const tx of recentUnusual.slice(0, 1)) {
        insights.push({
          id: `unusual-${tx.id}`,
          type: 'unusual',
          title: 'Unusual expense',
          message: `"${tx.description}" (${formatCurrency(tx.amount)}) is ${Math.round(tx.amount / median)}x your typical ${cat} expense`,
          severity: 'warning',
          category: cat,
          amount: tx.amount,
        })
      }
    }

    // 4. Budget Suggestions
    const highSpendCategories = categories
      .map(cat => ({ cat, total: thisMonthTx.filter(tx => tx.category === cat).reduce((s, tx) => s + tx.amount, 0) }))
      .filter(c => c.total > 2000)
      .filter(c => !budgets.some(b => b.category.toLowerCase() === c.cat.toLowerCase() && b.isActive))
      .sort((a, b) => b.total - a.total)

    if (highSpendCategories.length > 0) {
      const top = highSpendCategories[0]
      insights.push({
        id: `suggest-budget-${top.cat}`,
        type: 'suggestion',
        title: 'Budget suggestion',
        message: `You spend ${formatCurrency(top.total)}/mo on ${top.cat}. Consider setting a budget to track it`,
        severity: 'info',
        category: top.cat,
        amount: top.total,
      })
    }

    // 5. Positive reinforcement
    const thisMonthTotal = thisMonthTx.reduce((sum, tx) => sum + tx.amount, 0)
    const lastMonthTotal = lastMonthTx.reduce((sum, tx) => sum + tx.amount, 0)

    if (lastMonthTotal > 0 && thisMonthTotal < lastMonthTotal * 0.85) {
      const saved = Math.round(lastMonthTotal - thisMonthTotal)
      insights.push({
        id: 'positive-savings',
        type: 'positive',
        title: 'Great progress!',
        message: `You're spending ${formatCurrency(saved)} less this month compared to last month`,
        severity: 'positive',
        amount: saved,
      })
    }

    return insights.slice(0, 5) // Max 5 insights at a time
  }
}
