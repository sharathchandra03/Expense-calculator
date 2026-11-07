'use client'

import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { db } from '@/db/schema'
import { cn } from '@/lib/utils'
import { CHART_COLORS } from '@/lib/category-icons'
import { Amount } from '@/components/ui/amount'
import { CategoryIcon } from '@/components/ui/category-icon'

export interface BreakdownItem {
  name: string
  value: number
  /** Optional change vs the previous period, rendered by `renderDelta`. */
  delta?: number | null
}

interface CategoryBreakdownProps {
  items: BreakdownItem[]
  type: 'income' | 'expense'
  /** 'donut' shows a ring with the total in the middle, 'bar' a segmented share bar. */
  variant?: 'donut' | 'bar'
  /** Rows shown before the "show more" expander. */
  collapsedCount?: number
  renderDelta?: (item: BreakdownItem) => React.ReactNode
  emptyText?: string
  className?: string
}

const OTHER_KEY = '__other__'
const OTHER_COLOR = '#94a3b8'

/** Formats a share, keeping tiny values readable. */
const fmtPct = (p: number) => (p > 0 && p < 0.1 ? '<0.1%' : `${p.toFixed(1)}%`)

/**
 * A compact, scroll-friendly category breakdown.
 *
 * - The chart groups everything beyond the top rows into one "Other" slice, so
 *   it never fills up with slivers.
 * - Only the top rows are listed up front. The rest sit behind a "show more"
 *   expander that scrolls inside its own box, so the page stays short.
 * - Tapping a row (or a donut slice) highlights it and shows its figures in the
 *   centre of the donut.
 * - Every amount uses <Amount/>, so large values never truncate.
 */
export function CategoryBreakdown({
  items,
  type,
  variant = 'bar',
  collapsedCount = 5,
  renderDelta,
  emptyText = 'Nothing in this period.',
  className,
}: CategoryBreakdownProps) {
  const [expanded, setExpanded] = useState(false)
  // A category name, or OTHER_KEY for the grouped slice.
  const [activeName, setActiveName] = useState<string | null>(null)

  const customCategories = useLiveQuery(() => db.customCategories.toArray())
  const customByName = useMemo(
    () => new Map((Array.isArray(customCategories) ? customCategories : []).map(c => [`${c.type}:${c.name.toLowerCase()}`, c])),
    [customCategories],
  )

  const sorted = useMemo(
    () => items.filter(i => i.value > 0).sort((a, b) => b.value - a.value),
    [items],
  )
  const total = useMemo(() => sorted.reduce((s, i) => s + i.value, 0), [sorted])

  // Rows get a colour by rank; anything past the collapsed count shares the "other" grey
  // so each row matches the slice it belongs to.
  const rows = useMemo(
    () => sorted.map((item, idx) => ({
      ...item,
      key: idx < collapsedCount ? item.name : OTHER_KEY,
      color: idx < collapsedCount ? CHART_COLORS[idx % CHART_COLORS.length] : OTHER_COLOR,
      pct: total > 0 ? (item.value / total) * 100 : 0,
    })),
    [sorted, total, collapsedCount],
  )

  const slices = useMemo(() => {
    const head = rows.slice(0, collapsedCount).map(r => ({ key: r.key, name: r.name, value: r.value, color: r.color }))
    const rest = rows.slice(collapsedCount)
    if (rest.length === 0) return head
    return [...head, {
      key: OTHER_KEY,
      name: `${rest.length} other ${rest.length === 1 ? 'category' : 'categories'}`,
      value: rest.reduce((s, r) => s + r.value, 0),
      color: OTHER_COLOR,
    }]
  }, [rows, collapsedCount])

  if (rows.length === 0) {
    return <p className={cn('py-8 text-center text-[13px] text-muted-foreground', className)}>{emptyText}</p>
  }

  const visible = expanded ? rows : rows.slice(0, collapsedCount)
  const hiddenCount = rows.length - collapsedCount
  const hiddenTotal = rows.slice(collapsedCount).reduce((s, r) => s + r.value, 0)
  const activeRow = rows.find(r => r.name === activeName) ?? null
  // The slice the active selection belongs to (rows past the top N map to the grouped slice).
  const activeSliceKey = activeRow ? activeRow.key : activeName
  const activeSlice = slices.find(s => s.key === activeSliceKey) ?? null
  // Centre label: the tapped category, the grouped slice, or the total.
  const centre = activeRow
    ? { name: activeRow.name, value: activeRow.value }
    : activeSlice && activeSlice.key === OTHER_KEY
      ? { name: activeSlice.name, value: activeSlice.value }
      : null
  const toggleActive = (name: string) => setActiveName(prev => (prev === name ? null : name))

  return (
    <div className={className}>
      {/* ── Chart ── */}
      {variant === 'donut' ? (
        <div className="relative mx-auto h-[220px] w-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={74}
                outerRadius={100}
                paddingAngle={slices.length > 1 ? 3 : 0}
                cornerRadius={6}
                startAngle={90}
                endAngle={-270}
                stroke="none"
                animationDuration={500}
                onClick={(_, i) => toggleActive(slices[i].key)}
              >
                {slices.map(s => (
                  <Cell
                    key={s.key}
                    fill={s.color}
                    fillOpacity={activeSliceKey && activeSliceKey !== s.key ? 0.28 : 1}
                    style={{ cursor: 'pointer', outline: 'none', transition: 'fill-opacity 0.2s' }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Centre label: total, or the tapped slice */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[52px] text-center">
            <p className="max-w-full truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {centre ? centre.name : 'Total'}
            </p>
            <Amount value={centre ? centre.value : total} size="lg" className="mt-0.5 text-foreground" />
            {centre && (
              <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                {fmtPct(total > 0 ? (centre.value / total) * 100 : 0)}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div
          className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full"
          role="img"
          aria-label="Share of each category"
        >
          {slices.map(s => (
            <button
              key={s.key}
              type="button"
              title={`${s.name}: ${fmtPct(total > 0 ? (s.value / total) * 100 : 0)}`}
              onClick={() => toggleActive(s.key)}
              className="h-full min-w-[3px] rounded-full transition-opacity"
              style={{
                width: `${total > 0 ? (s.value / total) * 100 : 0}%`,
                background: s.color,
                opacity: activeSliceKey && activeSliceKey !== s.key ? 0.3 : 1,
              }}
              aria-label={s.name}
            />
          ))}
        </div>
      )}

      {/* ── List ── */}
      <div className={cn('mt-4', expanded && 'max-h-[340px] overflow-y-auto overscroll-contain pr-1')}>
        <ul className="divide-y divide-border/40">
          {visible.map(row => {
            const custom = customByName.get(`${type}:${row.name.toLowerCase()}`)
            const isActive = activeRow?.name === row.name || (activeName === OTHER_KEY && row.key === OTHER_KEY)
            const dim = !!activeName && !isActive
            return (
              <li key={row.name}>
                <button
                  type="button"
                  onClick={() => toggleActive(row.name)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-opacity',
                    dim && 'opacity-45',
                  )}
                >
                  <CategoryIcon
                    name={row.name}
                    type={type}
                    isCustom={!!custom}
                    icon={custom?.icon}
                    color={custom?.color}
                    size={36}
                    iconSize={18}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[14px] font-semibold text-foreground">{row.name}</span>
                      <Amount value={row.value} size="md" className="shrink-0 text-foreground" />
                    </span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <motion.span
                          className="block h-full rounded-full"
                          style={{ background: row.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, row.pct)}%` }}
                          transition={{ duration: 0.45 }}
                        />
                      </span>
                      <span className="w-[46px] shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
                        {fmtPct(row.pct)}
                      </span>
                      {renderDelta && (
                        <span className="w-[52px] shrink-0 text-right">{renderDelta(row)}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* ── Expander ── */}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary/60 px-4 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={expanded ? 'less' : 'more'}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="flex items-center gap-2"
            >
              {expanded ? 'Show less' : `Show ${hiddenCount} more`}
              {!expanded && <Amount value={hiddenTotal} size="sm" className="font-bold text-muted-foreground" />}
            </motion.span>
          </AnimatePresence>
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  )
}
