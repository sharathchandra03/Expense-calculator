'use client'

import React, { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Amount } from '@/components/ui/amount'

export interface BudgetOverviewItem {
  id: string
  name: string
  /** e.g. "November 2026" */
  label: string
  limit: number
  spent: number
  timing: 'active' | 'upcoming' | 'past'
  /** Safe to spend per day for the rest of the period (0 when not running). */
  safePerDay: number
  /** Whole days left in the budget's period (0 when not running). */
  daysLeft: number
}

/** Identity colour per budget (avatar + share bar). */
const BUDGET_COLORS = ['#6d5efc', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6', '#f97316', '#3b82f6']

/** Green under 80%, amber from 80%, red when over the limit. */
function toneFor(spent: number, limit: number, upcoming = false) {
  if (upcoming) return { color: 'var(--muted-foreground)', label: 'Upcoming' }
  const pct = limit > 0 ? (spent / limit) * 100 : 0
  if (spent > limit) return { color: 'var(--negative)', label: 'Over budget' }
  if (pct >= 80) return { color: '#f59e0b', label: 'Almost used' }
  return { color: 'var(--positive)', label: 'On track' }
}

function Bar({ pct, color, className }: { pct: number; color: string; className?: string }) {
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-secondary', className)}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      />
    </div>
  )
}

/**
 * Budget summary for Analysis.
 *
 * The card always shows the TOTAL of every budget in range: remaining, a
 * progress bar, spent of limit and safe-to-spend. With more than one budget,
 * a toggle underneath expands/collapses the individual budgets.
 */
export function BudgetOverview({ items, onManage }: { items: BudgetOverviewItem[]; onManage?: () => void }) {
  const [open, setOpen] = useState(false)
  const multi = items.length > 1

  const total = useMemo(() => {
    const limit = items.reduce((s, i) => s + i.limit, 0)
    const spent = items.reduce((s, i) => s + i.spent, 0)
    const running = items.filter(i => i.timing === 'active')
    const labels = Array.from(new Set(items.map(i => i.label)))
    return {
      limit,
      spent,
      remaining: limit - spent,
      pct: limit > 0 ? (spent / limit) * 100 : 0,
      safePerDay: running.reduce((s, i) => s + i.safePerDay, 0),
      daysLeft: running.length > 0 ? Math.max(...running.map(i => i.daysLeft)) : 0,
      upcoming: items.length > 0 && items.every(i => i.timing === 'upcoming'),
      period: labels.length === 1 ? labels[0] : `${labels.length} periods`,
    }
  }, [items])

  const tone = toneFor(total.spent, total.limit, total.upcoming)
  const over = total.remaining < 0
  const title = multi ? 'Total budget' : items[0]?.name ?? 'Budget'

  return (
    <div className="overflow-hidden rounded-[1.6rem] border border-border/70 bg-card shadow-card">
      <div className="p-4">
        {/* Title row */}
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">{title}</span> · {total.period}
          </p>
          <span className="flex flex-shrink-0 items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: tone.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.color }} />
            {tone.label}
          </span>
        </div>

        {/* Remaining + used % */}
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground">{over ? 'Over by' : 'Left to spend'}</p>
            <Amount value={Math.abs(total.remaining)} size="hero" className={cn('block', over ? 'text-negative' : 'text-foreground')} />
          </div>
          <p className="flex-shrink-0 pb-1 text-[13px] font-bold tabular-nums" style={{ color: tone.color }}>
            {Math.round(total.pct)}% used
          </p>
        </div>

        <Bar pct={total.pct} color={tone.color} className="mt-3 h-2" />

        {/* Spent / limit */}
        <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
          <span className="min-w-0 truncate">
            Spent <Amount value={total.spent} size="sm" className="font-semibold text-foreground" />
          </span>
          <span className="min-w-0 truncate text-right">
            Limit <Amount value={total.limit} size="sm" className="font-semibold text-foreground" />
          </span>
        </div>

        {/* Bottom row: safe-to-spend, expand toggle (many budgets) and manage, side by side */}
        {(() => {
          const showSafe = total.safePerDay > 0 && total.daysLeft > 0
          if (!showSafe && !multi && !onManage) return null
          return (
            <div className="mt-3 flex items-stretch gap-2">
              {showSafe ? (
                <div
                  className="min-w-0 flex-1 rounded-xl px-3 py-1.5"
                  style={{ background: 'color-mix(in srgb, var(--positive) 10%, transparent)' }}
                >
                  <p className="truncate text-[12px] text-muted-foreground">
                    <Amount value={total.safePerDay} size="sm" className="font-bold text-positive" />/day
                  </p>
                  <p className="truncate text-[10.5px] font-semibold text-muted-foreground">
                    for {total.daysLeft} {total.daysLeft === 1 ? 'day' : 'days'}
                  </p>
                </div>
              ) : <span className="flex-1" />}
              {multi && (
                <button
                  type="button"
                  onClick={() => setOpen(o => !o)}
                  aria-expanded={open}
                  aria-label={open ? 'Hide budgets' : `Show ${items.length} budgets`}
                  className="flex min-h-9 flex-shrink-0 items-center gap-1 rounded-xl bg-secondary px-2.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-secondary/70"
                >
                  {items.length}
                  <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} />
                </button>
              )}
              {onManage && (
                <button
                  type="button"
                  onClick={onManage}
                  aria-label="Manage budgets"
                  className="flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-xl bg-primary/10 px-2.5 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/15"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Manage
                </button>
              )}
            </div>
          )
        })()}
      </div>

      {/* Individual budgets */}
      <AnimatePresence initial={false}>
        {multi && open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/50 bg-secondary/30 px-3 pb-3 pt-3">
              {/* How the total limit is split between budgets */}
              <div className="px-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                  <span>Split of total limit</span>
                  <span>{items.length} budgets</span>
                </div>
                <div className="mt-1.5 flex h-2 w-full gap-[3px] overflow-hidden rounded-full">
                  {items.map((item, idx) => (
                    <motion.span
                      key={item.id}
                      className="h-full rounded-full"
                      style={{ background: BUDGET_COLORS[idx % BUDGET_COLORS.length] }}
                      initial={{ width: 0 }}
                      animate={{ width: `${total.limit > 0 ? (item.limit / total.limit) * 100 : 100 / items.length}%` }}
                      transition={{ duration: 0.5, delay: 0.05 }}
                    />
                  ))}
                </div>
              </div>

              <ul className="mt-3 space-y-2">
                {items.map((item, idx) => {
                  const accent = BUDGET_COLORS[idx % BUDGET_COLORS.length]
                  const t = toneFor(item.spent, item.limit, item.timing === 'upcoming')
                  const pct = item.limit > 0 ? (item.spent / item.limit) * 100 : 0
                  const left = item.limit - item.spent
                  const share = total.limit > 0 ? (item.limit / total.limit) * 100 : 0
                  const showPeriod = item.label !== total.period
                  return (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: 0.04 * idx }}
                      className="rounded-2xl border border-border/50 bg-card p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-[14px] font-bold"
                          style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
                        >
                          {item.name.trim().charAt(0).toUpperCase() || 'B'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold text-foreground">{item.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {Math.round(share)}% of total{showPeriod ? ` · ${item.label}` : ''}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <Amount value={Math.abs(left)} size="md" className={cn('block', left < 0 ? 'text-negative' : 'text-foreground')} />
                          <p className="text-[10.5px] font-semibold text-muted-foreground">{left < 0 ? 'over' : 'left'}</p>
                        </div>
                      </div>
                      <Bar pct={pct} color={t.color} className="mt-2.5 h-1.5" />
                      <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                        <span className="min-w-0 truncate">
                          <Amount value={item.spent} size="sm" className="font-semibold text-foreground" /> of{' '}
                          <Amount value={item.limit} size="sm" className="font-semibold text-foreground" />
                        </span>
                        <span className="flex flex-shrink-0 items-center gap-1 font-semibold" style={{ color: t.color }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />
                          {Math.round(pct)}% · {t.label}
                        </span>
                      </div>
                    </motion.li>
                  )
                })}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
