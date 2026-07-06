'use client'

import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import {
  BarChart3, TrendingUp, TrendingDown, PieChart, Calendar,
  Zap, AlertCircle, Target, Repeat2, ArrowUpRight, ArrowDownRight
} from 'lucide-react'

interface CategoryBreakdown {
  category: string
  amount: number
  percentage: number
  trend: 'up' | 'down' | 'neutral'
}

interface MonthlyData {
  month: string
  income: number
  expenses: number
}

export function SpendingIntelligence() {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Fetch transactions
  const transactions = useLiveQuery(() => db.transactions.toArray()) || []

  // Calculate spending metrics
  const metrics = useMemo(() => {
    const now = new Date()
    let startDate = new Date()

    if (timeRange === 'week') {
      startDate.setDate(now.getDate() - 7)
    } else if (timeRange === 'month') {
      startDate.setMonth(now.getMonth() - 1)
    } else {
      startDate.setFullYear(now.getFullYear() - 1)
    }

    const relevantTxs = transactions.filter(
      (tx) => new Date(tx.date) >= startDate && new Date(tx.date) <= now
    )

    const income = relevantTxs
      .filter((tx) => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0)

    const expenses = relevantTxs
      .filter((tx) => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0)

    const savings = income - expenses

    return { income, expenses, savings, txCount: relevantTxs.length }
  }, [transactions, timeRange])

  // Category breakdown
  const categoryData = useMemo(() => {
    const now = new Date()
    let startDate = new Date()

    if (timeRange === 'week') {
      startDate.setDate(now.getDate() - 7)
    } else if (timeRange === 'month') {
      startDate.setMonth(now.getMonth() - 1)
    } else {
      startDate.setFullYear(now.getFullYear() - 1)
    }

    const expenses = transactions
      .filter((tx) => tx.type === 'expense' && new Date(tx.date) >= startDate && new Date(tx.date) <= now)

    const categoryMap: { [key: string]: number } = {}
    expenses.forEach((tx) => {
      categoryMap[tx.category] = (categoryMap[tx.category] || 0) + tx.amount
    })

    const totalExpenses = Object.values(categoryMap).reduce((a, b) => a + b, 0)

    return Object.entries(categoryMap)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
        trend: 'neutral' as const,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [transactions, timeRange])

  // Recurring transactions detection
  const recurringTransactions = useMemo(() => {
    const categoryFrequency: { [key: string]: string[] } = {}

    transactions
      .filter((tx) => tx.type === 'expense')
      .forEach((tx) => {
        if (!categoryFrequency[tx.category]) {
          categoryFrequency[tx.category] = []
        }
        categoryFrequency[tx.category].push(tx.date)
      })

    const recurring: Array<{ category: string; frequency: string; monthlyAvg: number }> = []

    Object.entries(categoryFrequency).forEach(([category, dates]) => {
      if (dates.length >= 2) {
        const amounts = transactions
          .filter((tx) => tx.category === category && tx.type === 'expense')
          .map((tx) => tx.amount)

        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length

        // Simple frequency detection
        let frequency = 'irregular'
        if (dates.length > 5) frequency = 'frequent'
        if (dates.length > 2 && dates.length <= 5) frequency = 'occasional'

        recurring.push({
          category,
          frequency,
          monthlyAvg: avgAmount,
        })
      }
    })

    return recurring.sort((a, b) => b.monthlyAvg - a.monthlyAvg)
  }, [transactions])

  // Top spending days
  const topSpendingDays = useMemo(() => {
    const dayMap: { [key: string]: number } = {}

    transactions
      .filter((tx) => tx.type === 'expense')
      .forEach((tx) => {
        dayMap[tx.date] = (dayMap[tx.date] || 0) + tx.amount
      })

    return Object.entries(dayMap)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [transactions])

  // Spending insights
  const insights = useMemo(() => {
    const insight: string[] = []

    if (metrics.savings < 0) {
      insight.push('⚠️ You spent more than you earned this period')
    } else if (metrics.savings > metrics.income * 0.2) {
      insight.push('✅ Great savings rate! You saved over 20% of income')
    }

    if (categoryData.length > 0 && categoryData[0].percentage > 40) {
      insight.push(
        `📊 ${categoryData[0].category} is your largest expense (${Math.round(categoryData[0].percentage)}%)`
      )
    }

    if (recurringTransactions.length > 0) {
      const totalRecurring = recurringTransactions.reduce((sum, r) => sum + r.monthlyAvg, 0)
      insight.push(`🔄 You have ${recurringTransactions.length} recurring expenses (~${formatCurrency(totalRecurring)}/month)`)
    }

    return insight
  }, [metrics, categoryData, recurringTransactions])

  const savingsRate = metrics.income > 0 ? Math.round((metrics.savings / metrics.income) * 100) : 0

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-28">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 bg-background/80 backdrop-blur-md z-10 py-4 -mx-4 px-4"
      >
        <h1 className="text-3xl font-bold text-foreground">Spending Intelligence</h1>
        <p className="text-xs text-muted-foreground mt-1">Analyze your financial patterns and trends</p>
      </motion.div>

      {/* Time Range Selector */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2 p-1 bg-secondary rounded-xl w-fit"
      >
        {(['week', 'month', 'year'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-semibold uppercase transition-all',
              timeRange === range
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {range === 'week' ? 'Last 7 Days' : range === 'month' ? 'Last Month' : 'Last Year'}
          </button>
        ))}
      </motion.div>

      {/* Key Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3"
      >
        {[
          {
            label: 'Income',
            value: formatCurrency(metrics.income),
            icon: ArrowUpRight,
            color: 'text-emerald-500',
            bg: 'bg-emerald-500/10',
          },
          {
            label: 'Expenses',
            value: formatCurrency(metrics.expenses),
            icon: ArrowDownRight,
            color: 'text-red-500',
            bg: 'bg-red-500/10',
          },
          {
            label: 'Savings',
            value: formatCurrency(metrics.savings),
            icon: TrendingUp,
            color: metrics.savings >= 0 ? 'text-blue-500' : 'text-red-500',
            bg: metrics.savings >= 0 ? 'bg-blue-500/10' : 'bg-red-500/10',
          },
          {
            label: 'Savings Rate',
            value: `${savingsRate}%`,
            icon: Target,
            color: 'text-indigo-500',
            bg: 'bg-indigo-500/10',
          },
        ].map((metric, i) => {
          const Icon = metric.icon
          return (
            <motion.div
              key={i}
              whileHover={{ scale: 1.02 }}
              className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-secondary to-secondary/50 border border-border/50 space-y-2"
            >
              <div className={cn('w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center', metric.bg)}>
                <Icon className={cn('w-4 sm:w-5 h-4 sm:h-5', metric.color)} />
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase font-semibold">{metric.label}</p>
              <p className="text-xs sm:text-sm md:text-base font-bold text-foreground leading-tight">{metric.value}</p>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Insights */}
      {insights.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2"
        >
          {insights.map((insight, i) => (
            <div
              key={i}
              className="p-3 bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-lg text-xs text-foreground"
            >
              {insight}
            </div>
          ))}
        </motion.div>
      )}

      {/* Category Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="space-y-3"
      >
        <div className="flex items-center gap-2">
          <PieChart className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Category Breakdown</h2>
        </div>

        {categoryData.length > 0 ? (
          <div className="space-y-2">
            {categoryData.map((cat, i) => (
              <motion.button
                key={i}
                whileHover={{ scale: 1.01 }}
                onClick={() => setSelectedCategory(selectedCategory === cat.category ? null : cat.category)}
                className={cn(
                  'w-full p-4 rounded-lg border transition-all text-left',
                  selectedCategory === cat.category
                    ? 'bg-primary/10 border-primary/50'
                    : 'bg-secondary/50 border-border/50 hover:border-primary/30'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-foreground">{cat.category}</p>
                  <p className="text-sm font-bold text-foreground">{formatCurrency(cat.amount)}</p>
                </div>
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${cat.percentage}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05 }}
                    className="h-full bg-gradient-to-r from-primary to-primary/60"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{Math.round(cat.percentage)}% of total</p>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-secondary/20 rounded-lg text-muted-foreground text-xs">
            No expense data available
          </div>
        )}
      </motion.div>

      {/* Recurring Transactions */}
      {recurringTransactions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <Repeat2 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Recurring Expenses</h2>
          </div>

          <div className="space-y-2">
            {recurringTransactions.map((recurring, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-4 bg-secondary/50 border border-border/50 rounded-lg flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-foreground">{recurring.category}</p>
                  <p className="text-xs text-muted-foreground capitalize">{recurring.frequency}</p>
                </div>
                <p className="text-sm font-bold text-foreground">{formatCurrency(recurring.monthlyAvg)}/mo</p>
              </motion.div>
            ))}
          </div>

          {recurringTransactions.length > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                💡 Your recurring expenses average {formatCurrency(
                  recurringTransactions.reduce((sum, r) => sum + r.monthlyAvg, 0)
                )}/month
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Top Spending Days */}
      {topSpendingDays.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Top Spending Days</h2>
          </div>

          <div className="space-y-2">
            {topSpendingDays.map((day, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="p-3 bg-secondary/50 border border-border/50 rounded-lg flex items-center justify-between"
              >
                <p className="text-sm font-medium text-foreground">
                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                <p className="text-sm font-bold text-foreground">{formatCurrency(day.amount)}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {transactions.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16 bg-secondary/20 rounded-2xl border border-dashed border-border"
        >
          <BarChart3 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-bold text-muted-foreground">No spending data yet</p>
          <p className="text-xs text-muted-foreground/75 mt-1">Start recording transactions to see insights</p>
        </motion.div>
      )}
    </div>
  )
}
