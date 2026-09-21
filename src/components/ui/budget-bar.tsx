'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

/**
 * Phase 0.5: Monthly Budget Awareness Bar
 * A thin progress bar visible at the top of every screen
 * Shows spent vs limit, color-coded (green/amber/red)
 * Tap to expand: per-category budget breakdown
 */
export function BudgetBar() {
  const [expanded, setExpanded] = useState(false)

  const budgets = useLiveQuery(() => db.budgets.toArray()) ?? []
  const allTransactions = useLiveQuery(() => db.transactions.toArray()) ?? []

  const safeBudgets = Array.isArray(budgets) ? budgets : []
  const safeTx = Array.isArray(allTransactions) ? allTransactions : []

  // Calculate monthly totals
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const activeBudgets = safeBudgets.filter(b => b.isActive && b.period === 'monthly')
  const totalLimit = activeBudgets.reduce((sum, b) => sum + b.limit, 0)

  if (totalLimit === 0) return null // Don't show if no budgets

  const monthlyExpenses = safeTx.filter(tx => {
    const d = new Date(tx.date)
    return tx.type === 'expense' && d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  const totalSpent = monthlyExpenses.reduce((sum, tx) => sum + tx.amount, 0)
  const percentUsed = Math.min(100, (totalSpent / totalLimit) * 100)
  const remaining = totalLimit - totalSpent

  const status = percentUsed > 90 ? 'critical' : percentUsed > 70 ? 'warning' : 'healthy'

  // Per-category breakdown
  const categoryBreakdown = activeBudgets.map(budget => {
    const spent = monthlyExpenses
      .filter(tx => tx.category.toLowerCase() === budget.category.toLowerCase())
      .reduce((sum, tx) => sum + tx.amount, 0)
    const pct = Math.min(100, (spent / budget.limit) * 100)
    return { ...budget, spent, pct }
  }).sort((a, b) => b.pct - a.pct)

  return (
    <div className="w-full">
      {/* Thin bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-1 py-1 group"
      >
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentUsed}%` }}
            transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
            className={cn(
              "h-full rounded-full",
              status === 'critical' ? 'bg-red-500' :
              status === 'warning' ? 'bg-amber-500' :
              'bg-emerald-500'
            )}
          />
        </div>
        <span className={cn(
          "text-[9px] font-bold whitespace-nowrap",
          status === 'critical' ? 'text-red-500' :
          status === 'warning' ? 'text-amber-500' :
          'text-emerald-500'
        )}>
          {formatCurrency(remaining)} left
        </span>
        <ChevronDown className={cn(
          "w-3 h-3 text-muted-foreground transition-transform duration-200",
          expanded && "rotate-180"
        )} />
      </button>

      {/* Expanded category breakdown */}
      <AnimatePresence>
        {expanded && categoryBreakdown.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2 pb-1 space-y-2 px-1">
              {categoryBreakdown.map(item => (
                <div key={item.id} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-medium text-muted-foreground capitalize">{item.category}</span>
                    <span className="text-[10px] font-bold text-foreground">
                      {formatCurrency(item.spent)} / {formatCurrency(item.limit)}
                    </span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        item.pct > 90 ? 'bg-red-500' :
                        item.pct > 70 ? 'bg-amber-500' :
                        'bg-emerald-500'
                      )}
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
