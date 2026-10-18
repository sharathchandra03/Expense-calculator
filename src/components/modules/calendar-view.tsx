'use client'

import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import { db } from '@/db/schema'
import { getCurrencySymbol, cn } from '@/lib/utils'
import type { TabType } from '@/components/layout/bottom-nav'

interface CalendarViewPageProps {
  onNavigateToTab?: (tab: TabType) => void
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/**
 * Compact currency for the tiny day pills. Large values are abbreviated
 * (1.2k, 3.5L) so the amount always fits inside a narrow calendar cell.
 */
function compactAmount(n: number): string {
  const symbol = getCurrencySymbol()
  const abs = Math.abs(n)
  if (abs >= 10000000) return `${symbol}${(n / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`
  if (abs >= 100000) return `${symbol}${(n / 100000).toFixed(1).replace(/\.0$/, '')}L`
  if (abs >= 1000) return `${symbol}${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${symbol}${Number.isInteger(n) ? n : n.toFixed(2)}`
}

export function CalendarViewPage({ onNavigateToTab }: CalendarViewPageProps) {
  const [current, setCurrent] = useState(() => {
    const now = new Date()
    return { month: now.getMonth(), year: now.getFullYear() }
  })

  const rawTransactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const safeTransactions = useMemo(
    () => (Array.isArray(rawTransactions) ? rawTransactions : []),
    [rawTransactions]
  )

  const monthTransactions = useMemo(() => {
    return safeTransactions.filter((tx) => {
      const d = new Date(tx.date + 'T00:00:00')
      return d.getMonth() === current.month && d.getFullYear() === current.year
    })
  }, [safeTransactions, current])

  // Group totals by day-of-month
  const dayTotals = useMemo(() => {
    const map: Record<number, { income: number; expense: number }> = {}
    monthTransactions.forEach((tx) => {
      const day = new Date(tx.date + 'T00:00:00').getDate()
      if (!map[day]) map[day] = { income: 0, expense: 0 }
      if (tx.type === 'income') map[day].income += tx.amount
      else map[day].expense += tx.amount
    })
    return map
  }, [monthTransactions])

  const firstDay = new Date(current.year, current.month, 1)
  const daysInMonth = new Date(current.year, current.month + 1, 0).getDate()
  // Convert JS Sunday-first (0) to Monday-first index
  const startOffset = (firstDay.getDay() + 6) % 7

  const cells: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const monthLabel = new Date(current.year, current.month).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })

  const goToPrevMonth = () => setCurrent(prev => prev.month === 0
    ? { month: 11, year: prev.year - 1 }
    : { month: prev.month - 1, year: prev.year })
  const goToNextMonth = () => setCurrent(prev => prev.month === 11
    ? { month: 0, year: prev.year + 1 }
    : { month: prev.month + 1, year: prev.year })

  const today = new Date()
  const isToday = (d: number) =>
    today.getDate() === d && today.getMonth() === current.month && today.getFullYear() === current.year

  const count = monthTransactions.length

  // Number of week rows in the grid (5 or 6) — used to divide the grid height evenly.
  const weekRows = cells.length / 7

  return (
    <div className="flex flex-col -mx-5 -mt-4 min-h-[calc(100dvh-72px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={() => onNavigateToTab?.('more')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-accent transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-[18px] font-bold text-foreground">Calendar View</h1>
      </div>

      {/* Month navigator pill */}
      <div className="px-4">
        <div className="flex items-center justify-between rounded-3xl bg-secondary/70 border border-border/60 px-4 py-3">
          <button onClick={goToPrevMonth} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="Previous month">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <p className="text-[15px] font-semibold text-foreground">{monthLabel}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">
              {count} {count === 1 ? 'Transaction' : 'Transactions'}
            </p>
          </div>
          <button onClick={goToNextMonth} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="Next month">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Weekday header — sits on the same grid lines as the cells below */}
      <div className="grid grid-cols-7 mx-3 mt-4 border-t border-l border-r border-zinc-300 dark:border-white/70 rounded-t-md overflow-hidden">
        {WEEKDAYS.map((w, i) => (
          <div
            key={i}
            className="border-r last:border-r-0 border-zinc-300 dark:border-white/70 py-2 text-center text-[11px] font-semibold text-muted-foreground"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Calendar grid — fills remaining screen height with evenly sized cells.
          A solid outer border + per-cell borders draw bold calendar grid lines. */}
      <motion.div
        key={`${current.year}-${current.month}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid grid-cols-7 flex-1 mx-3 mb-4 border-l border-zinc-300 dark:border-white/70 rounded-b-md overflow-hidden"
        style={{ gridTemplateRows: `repeat(${weekRows}, minmax(0, 1fr))` }}
      >
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="border-r border-b border-zinc-300 dark:border-white/70 bg-secondary/20" />
          }
          const totals = dayTotals[day]
          return (
            <div
              key={day}
              className="border-r border-b border-zinc-300 dark:border-white/70 p-1 flex flex-col overflow-hidden"
            >
              <span className={cn(
                'text-[12px] font-semibold',
                isToday(day)
                  ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#6d5efc] text-white'
                  : 'text-foreground'
              )}>
                {day}
              </span>
              <div className="mt-auto flex flex-col gap-0.5">
                {totals?.income ? (
                  <span className="rounded px-1 py-0.5 text-[9px] font-bold text-emerald-300 bg-emerald-500/20 leading-tight tabular-nums text-center">
                    {compactAmount(totals.income)}
                  </span>
                ) : null}
                {totals?.expense ? (
                  <span className="rounded px-1 py-0.5 text-[9px] font-bold text-red-300 bg-red-500/20 leading-tight tabular-nums text-center">
                    {compactAmount(totals.expense)}
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </motion.div>
    </div>
  )
}
