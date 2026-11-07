'use client'

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import { db } from '@/db/schema'
import { cn } from '@/lib/utils'
import { Amount } from '@/components/ui/amount'
import { NetWorthService, NET_WORTH_COLORS } from '@/services/NetWorthService'

/**
 * Net worth overview: one "super total" with a breakdown of where it comes
 * from (accounts & assets, investments, money lent out) and what you owe.
 * Reads live data itself, so it can be dropped into any screen.
 */
export function NetWorthCard({ className, title = 'Net worth' }: { className?: string; title?: string }) {
  const assets = useLiveQuery(() => db.assets.toArray())
  const investments = useLiveQuery(() => db.investments.toArray())
  const lending = useLiveQuery(() => db.lending.toArray())

  const breakdown = React.useMemo(
    () => NetWorthService.compute(
      Array.isArray(assets) ? assets : [],
      Array.isArray(investments) ? investments : [],
      Array.isArray(lending) ? lending : [],
    ),
    [assets, investments, lending],
  )
  const segments = React.useMemo(() => NetWorthService.segments(breakdown), [breakdown])
  const hasBar = segments.some(s => s.percentage > 0)

  return (
    <div className={cn('relative rounded-[1.6rem] bg-card border border-border/70 shadow-card overflow-hidden p-5', className)}>
      <div className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full bg-primary/10 blur-3xl" />

      {/* Super total */}
      <div className="relative">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        <Amount
          value={breakdown.netWorth}
          signed
          size="hero"
          className={cn('mt-1 block', breakdown.netWorth < 0 ? 'text-negative' : 'text-foreground')}
        />
      </div>

      {/* Total assets vs liabilities */}
      <div className="relative mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-secondary/60 px-3.5 py-3 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground">Total assets</p>
          <Amount value={breakdown.totalAssets} signed size="md" className="mt-0.5 block text-positive" />
        </div>
        <div className="rounded-2xl bg-secondary/60 px-3.5 py-3 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground">You owe (borrowed)</p>
          <Amount value={breakdown.borrowed} size="md" className="mt-0.5 block text-negative" />
        </div>
      </div>

      {/* Stacked share bar */}
      <div className="relative mt-5">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary" role="img" aria-label="Share of total assets">
          {hasBar && segments.map(s => (
            s.percentage > 0 ? (
              <motion.div
                key={s.key}
                style={{ background: s.color }}
                initial={{ width: 0 }}
                animate={{ width: `${s.percentage}%` }}
                transition={{ duration: 0.5 }}
              />
            ) : null
          ))}
        </div>
      </div>

      {/* Breakdown rows */}
      <div className="relative mt-3 divide-y divide-border/40">
        {segments.map(s => (
          <div key={s.key} className="flex items-center gap-3 py-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-foreground">{s.label}</p>
              <p className="text-[11px] text-muted-foreground">{s.percentage.toFixed(1)}% of total assets</p>
            </div>
            <Amount value={s.value} signed size="md" className="shrink-0 text-foreground" />
          </div>
        ))}
        <div className="flex items-center gap-3 py-2.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: NET_WORTH_COLORS.borrowed }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold text-foreground">Borrowed (liability)</p>
            <p className="text-[11px] text-muted-foreground">Subtracted from net worth</p>
          </div>
          <Amount value={-breakdown.borrowed} signed size="md" className="shrink-0 text-negative" />
        </div>
      </div>
    </div>
  )
}
