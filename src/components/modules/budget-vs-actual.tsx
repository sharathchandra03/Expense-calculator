'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp, BarChart3 } from 'lucide-react'

/**
 * Phase 1.6: Monthly Budget vs Actual Comparison
 * Side-by-side bar chart per category, monthly navigation
 */
export function BudgetVsActual() {
  const [monthOffset, setMonthOffset] = useState(0) // 0 = current month, -1 = last month, etc.

  const budgets = useLiveQuery(() => db.budgets.toArray()) ?? []
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []

  const safeBudgets = Array.isArray(budgets) ? budgets : []
  const safeTx = Array.isArray(transactions) ? transactions : []

  // Target month
  const targetDate = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + monthOffset)
    return d
  }, [monthOffset])

  const monthLabel = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Calculate budget vs actual per category
  const comparison = useMemo(() => {
    const month = targetDate.getMonth()
    const year = targetDate.getFullYear()

    const activeBudgets = safeBudgets.filter(b => b.isActive && b.period === 'monthly')

    const monthExpenses = safeTx.filter(tx => {
      const d = new Date(tx.date)
      return tx.type === 'expense' && d.getMonth() === month && d.getFullYear() === year
    })

    const categories = activeBudgets.map(budget => {
      const actual = monthExpenses
        .filter(tx => tx.category.toLowerCase() === budget.category.toLowerCase())
        .reduce((sum, tx) => sum + tx.amount, 0)

      const diff = budget.limit - actual
      const pct = budget.limit > 0 ? Math.min(100, (actual / budget.limit) * 100) : 0
      const isOver = actual > budget.limit

      return {
        category: budget.category,
        budgeted: budget.limit,
        actual,
        diff,
        pct,
        isOver,
      }
    })

    const totalBudgeted = categories.reduce((sum, c) => sum + c.budgeted, 0)
    const totalActual = categories.reduce((sum, c) => sum + c.actual, 0)
    const totalDiff = totalBudgeted - totalActual

    return { categories, totalBudgeted, totalActual, totalDiff }
  }, [safeBudgets, safeTx, targetDate])

  const isCurrentMonth = monthOffset === 0

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Budget vs Actual</h1>
        <p className="text-xs text-muted-foreground">Compare planned spending against reality</p>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between p-2 rounded-2xl bg-secondary/50 border border-border/30">
        <button
          onClick={() => setMonthOffset(monthOffset - 1)}
          className="p-2 rounded-xl hover:bg-secondary transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <p className="text-sm font-bold text-foreground">{monthLabel}</p>
        <button
          onClick={() => setMonthOffset(monthOffset + 1)}
          disabled={isCurrentMonth}
          className="p-2 rounded-xl hover:bg-secondary transition-colors disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Summary Card */}
      <motion.div
        key={monthOffset}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        className={cn(
          "p-4 rounded-2xl border",
          comparison.totalDiff >= 0
            ? "bg-emerald-500/5 border-emerald-500/20"
            : "bg-red-500/5 border-red-500/20"
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          {comparison.totalDiff >= 0 ? (
            <TrendingDown className="w-5 h-5 text-emerald-500" />
          ) : (
            <TrendingUp className="w-5 h-5 text-red-500" />
          )}
          <p className={cn("text-lg font-bold", comparison.totalDiff >= 0 ? "text-emerald-500" : "text-red-500")}>
            {comparison.totalDiff >= 0
              ? `Saved ${formatCurrency(comparison.totalDiff)}`
              : `Over by ${formatCurrency(Math.abs(comparison.totalDiff))}`}
          </p>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Budgeted: {formatCurrency(comparison.totalBudgeted)}</span>
          <span>Actual: {formatCurrency(comparison.totalActual)}</span>
        </div>
      </motion.div>

      {/* Per-Category Bars */}
      {comparison.categories.length > 0 ? (
        <div className="space-y-4">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Category Breakdown</p>
          {comparison.categories.map((cat, i) => (
            <motion.div
              key={cat.category}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="space-y-2"
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-foreground capitalize">{cat.category}</span>
                <span className={cn("text-[10px] font-bold", cat.isOver ? "text-red-500" : "text-emerald-500")}>
                  {cat.isOver ? `+${formatCurrency(Math.abs(cat.diff))} over` : `${formatCurrency(cat.diff)} under`}
                </span>
              </div>

              {/* Double bar */}
              <div className="space-y-1">
                {/* Budget bar (reference) */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground w-14">Budget</span>
                  <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-muted-foreground/30" style={{ width: '100%' }} />
                  </div>
                  <span className="text-[9px] font-bold text-muted-foreground w-16 text-right">{formatCurrency(cat.budgeted)}</span>
                </div>
                {/* Actual bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground w-14">Actual</span>
                  <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, cat.pct)}%` }}
                      transition={{ duration: 0.5, delay: i * 0.05 }}
                      className={cn("h-full rounded-full", cat.isOver ? "bg-red-500" : "bg-emerald-500")}
                    />
                  </div>
                  <span className={cn("text-[9px] font-bold w-16 text-right", cat.isOver ? "text-red-500" : "text-foreground")}>
                    {formatCurrency(cat.actual)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 rounded-2xl bg-secondary/20 border border-dashed border-border/50">
          <BarChart3 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs font-semibold text-muted-foreground">No budgets set</p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">Create budgets to see the comparison</p>
        </div>
      )}
    </div>
  )
}
