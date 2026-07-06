'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, PiggyBank, Sparkles, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

type Period = 'week' | 'month'

function getRangeStart(period: Period): Date {
  const now = new Date()
  if (period === 'week') {
    const d = new Date(now)
    const day = d.getDay() // 0 = Sunday
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d
  }
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export function WeeklyBrief() {
  const [period, setPeriod] = useState<Period>('week')

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const bills = useLiveQuery(() => db.bills.toArray()) ?? []
  const goals = useLiveQuery(() => db.goals.toArray()) ?? []

  const safeTransactions = Array.isArray(transactions) ? transactions : []
  const safeBills = Array.isArray(bills) ? bills : []
  const safeGoals = Array.isArray(goals) ? goals : []

  const brief = React.useMemo(() => {
    const start = getRangeStart(period)
    const startTime = start.getTime()

    const inRange = safeTransactions.filter((tx) => {
      const t = new Date(tx.date).getTime()
      return !isNaN(t) && t >= startTime
    })

    const income = inRange.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = inRange.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const savings = income - expense
    const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0

    // Top expense categories
    const catMap: Record<string, number> = {}
    inRange.filter((t) => t.type === 'expense').forEach((t) => {
      catMap[t.category] = (catMap[t.category] || 0) + t.amount
    })
    const topCategories = Object.entries(catMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)

    // Insights
    const insights: string[] = []
    if (income === 0 && expense === 0) {
      insights.push(`No activity recorded ${period === 'week' ? 'this week' : 'this month'} yet.`)
    } else {
      if (savings > 0) {
        insights.push(`You saved ${formatCurrency(savings)} — ${savingsRate}% of your income. Nice work.`)
      } else if (savings < 0) {
        insights.push(`You spent ${formatCurrency(Math.abs(savings))} more than you earned. Time to ease off.`)
      }
      if (topCategories[0]) {
        const share = expense > 0 ? Math.round((topCategories[0].amount / expense) * 100) : 0
        insights.push(`${topCategories[0].category} was your biggest spend at ${share}% of expenses.`)
      }
      if (savingsRate >= 30) {
        insights.push('Your savings rate is excellent. Consider moving surplus into a goal.')
      }
    }

    // Upcoming unpaid bills
    const upcoming = safeBills
      .filter((b) => !b.isPaid)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 4)

    return { income, expense, savings, savingsRate, topCategories, insights, upcoming, count: inRange.length }
  }, [safeTransactions, safeBills, period])

  const maxCat = brief.topCategories[0]?.amount || 1

  return (
    <div className="flex flex-col space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Financial Brief</h1>
        <p className="text-xs text-muted-foreground">Your money at a glance, {period === 'week' ? 'this week' : 'this month'}.</p>
      </div>

      {/* Period toggle */}
      <div className="flex gap-1 p-1 rounded-full bg-secondary/60 w-fit">
        {(['week', 'month'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-5 py-1.5 rounded-full text-xs font-semibold capitalize transition-all',
              period === p ? 'bg-foreground text-background' : 'text-muted-foreground'
            )}
          >
            {p === 'week' ? 'This Week' : 'This Month'}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3">
          <ArrowUpRight className="w-4 h-4 text-emerald-500 mb-1.5" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Income</p>
          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatCurrency(brief.income)}</p>
        </div>
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-3">
          <ArrowDownRight className="w-4 h-4 text-red-500 mb-1.5" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Spent</p>
          <p className="text-sm font-bold text-red-600 dark:text-red-400 mt-0.5">{formatCurrency(brief.expense)}</p>
        </div>
        <div className="rounded-2xl bg-primary/10 border border-primary/20 p-3">
          <PiggyBank className="w-4 h-4 text-primary mb-1.5" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Saved</p>
          <p className={cn('text-sm font-bold mt-0.5', brief.savings >= 0 ? 'text-primary' : 'text-red-500')}>
            {formatCurrency(brief.savings)}
          </p>
        </div>
      </div>

      {/* Insights */}
      <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Insights</h3>
        </div>
        <div className="space-y-2">
          {brief.insights.map((insight, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-2"
            >
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">{insight}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Top categories */}
      {brief.topCategories.length > 0 && (
        <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold">Top Spending</h3>
          </div>
          <div className="space-y-3">
            {brief.topCategories.map((cat) => (
              <div key={cat.category}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{cat.category}</span>
                  <span className="text-xs font-semibold">{formatCurrency(cat.amount)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.max(6, (cat.amount / maxCat) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming bills */}
      {brief.upcoming.length > 0 && (
        <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold">Upcoming Bills</h3>
          </div>
          <div className="space-y-2">
            {brief.upcoming.map((bill) => (
              <div key={bill.id} className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">{bill.title}</p>
                  <p className="text-[10px] text-muted-foreground">Due {bill.dueDate}</p>
                </div>
                <span className="text-xs font-semibold">{formatCurrency(bill.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Goals snapshot */}
      {safeGoals.length > 0 && (
        <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold">Goal Progress</h3>
          </div>
          <div className="space-y-3">
            {safeGoals.slice(0, 3).map((goal) => {
              const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0
              return (
                <div key={goal.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{goal.title}</span>
                    <span className="text-xs font-semibold">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
