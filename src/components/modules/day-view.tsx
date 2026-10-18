'use client'

import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, ArrowLeft, Plus } from 'lucide-react'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { getCategoryConfig } from '@/lib/category-icons'
import type { TabType } from '@/components/layout/bottom-nav'

interface DayViewProps {
  onNavigateToTab?: (tab: TabType) => void
  onQuickAddClick?: () => void
}

/** Format a Date to a local YYYY-MM-DD string (avoids UTC shift from toISOString). */
function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function DayView({ onNavigateToTab, onQuickAddClick }: DayViewProps) {
  const [selected, setSelected] = useState<Date>(() => new Date())

  const rawTransactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const safeTransactions = useMemo(
    () => (Array.isArray(rawTransactions) ? rawTransactions : []),
    [rawTransactions]
  )
  const safeAccounts = Array.isArray(accounts) ? accounts : []

  const dateKey = toDateKey(selected)

  const dayTransactions = useMemo(() => {
    return safeTransactions
      .filter((tx) => tx.date === dateKey)
      .sort((a, b) => {
        const timeA = a.time || '00:00'
        const timeB = b.time || '00:00'
        return timeB.localeCompare(timeA)
      })
  }, [safeTransactions, dateKey])

  const dayIncome = dayTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const dayExpense = dayTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  const goToPrevDay = () => setSelected(prev => {
    const d = new Date(prev)
    d.setDate(d.getDate() - 1)
    return d
  })
  const goToNextDay = () => setSelected(prev => {
    const d = new Date(prev)
    d.setDate(d.getDate() + 1)
    return d
  })

  const headerLabel = selected.toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

  const count = dayTransactions.length

  return (
    <div className="flex flex-col pb-6 -mx-5 -mt-4 min-h-[calc(100dvh-72px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={() => onNavigateToTab?.('more')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-accent transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-[18px] font-bold text-foreground">Day View</h1>
      </div>

      {/* Date navigator pill */}
      <div className="px-4">
        <div className="flex items-center justify-between rounded-3xl bg-secondary/70 border border-border/60 px-4 py-3">
          <button onClick={goToPrevDay} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="Previous day">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <p className="text-[15px] font-semibold text-foreground">{headerLabel}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">
              {count} {count === 1 ? 'Transaction' : 'Transactions'}
            </p>
          </div>
          <button onClick={goToNextDay} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="Next day">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Day summary (only when there are transactions) */}
      {count > 0 && (
        <div className="grid grid-cols-2 gap-3 px-4 pt-3">
          <div className="rounded-2xl bg-card border border-border/60 px-4 py-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">Income</p>
            <p className="text-[14px] font-bold text-emerald-500">{formatCurrency(dayIncome)}</p>
          </div>
          <div className="rounded-2xl bg-card border border-border/60 px-4 py-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">Expenses</p>
            <p className="text-[14px] font-bold text-foreground">{formatCurrency(dayExpense)}</p>
          </div>
        </div>
      )}

      {/* Transaction list / empty state */}
      <div className="flex-1 flex flex-col mt-3">
        <AnimatePresence mode="wait">
          {count > 0 ? (
            <motion.div
              key={dateKey}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col"
            >
              {dayTransactions.map((tx) => {
                const account = safeAccounts.find((a) => a.id === tx.accountId)
                const catConfig = getCategoryConfig(tx.category)
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-border/40">
                    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0', catConfig.bg)}>
                      {catConfig.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-foreground truncate">{tx.description || tx.category}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[11px] text-muted-foreground capitalize truncate">{catConfig.label}</span>
                        {tx.time && (
                          <>
                            <span className="text-[11px] text-muted-foreground/50">·</span>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{tx.time}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className={cn('text-[14px] font-bold', tx.type === 'income' ? 'text-positive' : 'text-negative')}>
                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </span>
                      {account && <p className="text-[11px] text-muted-foreground mt-0.5">{account.name}</p>}
                    </div>
                  </div>
                )
              })}
            </motion.div>
          ) : (
            <motion.div
              key={`empty-${dateKey}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col items-center justify-center py-24 px-5 text-center"
            >
              <div className="text-5xl mb-4">🧾</div>
              <p className="text-[16px] font-semibold text-foreground">No transactions!</p>
              <p className="text-[13px] text-muted-foreground mt-1">Tap + to add one.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating add button */}
      <button
        onClick={onQuickAddClick}
        className="fixed bottom-[88px] right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#7c6ffd] to-[#5b3df5] text-white shadow-fab md:absolute md:bottom-6"
        aria-label="Add transaction"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </div>
  )
}
