'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Transaction, type Account } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Share2, TrendingUp, TrendingDown, Minus, Download, FileJson } from 'lucide-react'
import { getCategoryConfig, CHART_COLORS } from '@/lib/category-icons'
import { CalendarDatePicker } from '@/components/ui/calendar-date-picker'

/* ------------------------------------------------------------------ *
 * Types & constants
 * ------------------------------------------------------------------ */
type StatTab = 'cashflow' | 'spending' | 'credit' | 'reports' | 'assets'
type RangeKey = '7d' | '1m' | '6m' | '1y' | 'custom'

const TABS: { key: StatTab; label: string }[] = [
  { key: 'cashflow', label: 'Cash-flow' },
  { key: 'spending', label: 'Spending' },
  { key: 'credit', label: 'Credit' },
  { key: 'reports', label: 'Reports' },
  { key: 'assets', label: 'Assets' },
]

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: '7d', label: '7D', days: 7 },
  { key: '1m', label: '1M', days: 30 },
  { key: '6m', label: '6M', days: 182 },
  { key: '1y', label: '1Y', days: 365 },
]

/* % change helper. Returns null when there's no meaningful baseline. */
const pctChange = (current: number, previous: number): number | null => {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

/* ------------------------------------------------------------------ *
 * Amount — a currency value that NEVER truncates or wraps, and shrinks
 * its own font size when the formatted string gets long (lakhs / crores
 * / large multi-currency values). This is the single source of truth for
 * rendering money across the whole Statistics screen.
 *
 * `size` picks a base scale; the component steps down from that base as
 * the string grows so columns stay aligned and nothing collides.
 * ------------------------------------------------------------------ */
type AmountSize = 'hero' | 'lg' | 'md' | 'sm'

/* Font-size ladders per base size, chosen by formatted-string length.
 * Each ladder degrades gracefully so a ₹99,99,99,999.00 still fits. */
const SIZE_LADDER: Record<AmountSize, { max: number; cls: string }[]> = {
  hero: [
    { max: 11, cls: 'text-[28px]' },
    { max: 14, cls: 'text-[24px]' },
    { max: 17, cls: 'text-[20px]' },
    { max: 20, cls: 'text-[17px]' },
    { max: Infinity, cls: 'text-[15px]' },
  ],
  lg: [
    { max: 11, cls: 'text-[22px]' },
    { max: 14, cls: 'text-[19px]' },
    { max: 17, cls: 'text-[16px]' },
    { max: 20, cls: 'text-[14px]' },
    { max: Infinity, cls: 'text-[12.5px]' },
  ],
  md: [
    { max: 12, cls: 'text-[15px]' },
    { max: 15, cls: 'text-[14px]' },
    { max: 18, cls: 'text-[12.5px]' },
    { max: Infinity, cls: 'text-[11.5px]' },
  ],
  sm: [
    { max: 13, cls: 'text-[13.5px]' },
    { max: 16, cls: 'text-[12.5px]' },
    { max: 19, cls: 'text-[11.5px]' },
    { max: Infinity, cls: 'text-[10.5px]' },
  ],
}

function Amount({
  value,
  size = 'md',
  className,
  signed = false,
}: {
  value: number
  size?: AmountSize
  className?: string
  /** When true, renders a leading '-' for negatives (formatCurrency already does). */
  signed?: boolean
}) {
  const text = signed
    ? `${value < 0 ? '-' : ''}${formatCurrency(Math.abs(value))}`
    : formatCurrency(value)
  const ladder = SIZE_LADDER[size]
  const sizeCls = (ladder.find(step => text.length <= step.max) ?? ladder[ladder.length - 1]).cls
  return (
    <span
      className={cn('font-extrabold tabular-nums whitespace-nowrap leading-tight', sizeCls, className)}
      title={text}
    >
      {text}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */
/** Local YYYY-MM-DD for a Date (no timezone drift). */
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function Statistics() {
  const [tab, setTab] = useState<StatTab>('cashflow')
  const [range, setRange] = useState<RangeKey>('1m')

  /* ---- Custom date range state ---- */
  const todayStr = toYMD(new Date())
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 29)
    return toYMD(d)
  })
  const [customEnd, setCustomEnd] = useState<string>(todayStr)
  // Which custom picker is open: null, or 'start' / 'end'.
  const [picker, setPicker] = useState<null | 'start' | 'end'>(null)

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const safeTx: Transaction[] = Array.isArray(transactions) ? transactions : []
  const safeAccounts: Account[] = Array.isArray(accounts) ? accounts : []

  const isCustom = range === 'custom'

  /* Number of days spanned by the active range (used for averages). */
  const customDays = React.useMemo(() => {
    const s = new Date(customStart + 'T00:00:00')
    const e = new Date(customEnd + 'T00:00:00')
    const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
    return Math.max(1, diff)
  }, [customStart, customEnd])

  const presetRange = RANGES.find(r => r.key === range)
  const customSpanLabel = React.useMemo(() => {
    const s = new Date(customStart + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    const e = new Date(customEnd + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    return `${s} – ${e}`
  }, [customStart, customEnd])
  const activeRange = {
    key: range,
    label: isCustom ? customSpanLabel : presetRange!.label,
    days: isCustom ? customDays : presetRange!.days,
  }

  /* ---- Current and previous (comparison) windows ---- */
  const windows = React.useMemo(() => {
    let start: Date
    let end: Date

    if (isCustom) {
      start = new Date(customStart + 'T00:00:00')
      start.setHours(0, 0, 0, 0)
      end = new Date(customEnd + 'T00:00:00')
      end.setHours(23, 59, 59, 999)
      // Guard against an inverted range.
      if (start > end) {
        const tmp = start
        start = new Date(end)
        start.setHours(0, 0, 0, 0)
        end = new Date(tmp)
        end.setHours(23, 59, 59, 999)
      }
    } else {
      end = new Date()
      end.setHours(23, 59, 59, 999)
      start = new Date(end)
      start.setDate(start.getDate() - (activeRange.days - 1))
      start.setHours(0, 0, 0, 0)
    }

    const span = Math.round((end.getTime() - start.getTime()) / 86_400_000)

    const prevEnd = new Date(start)
    prevEnd.setDate(prevEnd.getDate() - 1)
    prevEnd.setHours(23, 59, 59, 999)
    const prevStart = new Date(prevEnd)
    prevStart.setDate(prevStart.getDate() - span)
    prevStart.setHours(0, 0, 0, 0)

    return { start, end, prevStart, prevEnd }
  }, [isCustom, customStart, customEnd, activeRange.days])

  const inWindow = (tx: Transaction, s: Date, e: Date) => {
    const d = new Date(tx.date + 'T00:00:00')
    return d >= s && d <= e
  }

  const currentTx = React.useMemo(
    () => safeTx.filter(t => inWindow(t, windows.start, windows.end)),
    [safeTx, windows]
  )
  const previousTx = React.useMemo(
    () => safeTx.filter(t => inWindow(t, windows.prevStart, windows.prevEnd)),
    [safeTx, windows]
  )

  const rangeLabel = React.useMemo(() => {
    const s = windows.start.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    const e = windows.end.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    return `${s} – ${e}`
  }, [windows])

  return (
    <div className="flex flex-col space-y-5 pb-8">
      {/* ===== Header ===== */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Statistics</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">{rangeLabel}</p>
      </div>

      {/* ===== Date range filter (TOP) — 7D / 1M / 6M / 1Y / Custom ===== */}
      <div className="grid grid-cols-5 gap-1 p-1.5 rounded-full bg-secondary/70">
        {RANGES.map(r => {
          const active = range === r.key
          return (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={cn('relative h-9 rounded-full text-[13px] font-bold transition-colors', active ? 'text-foreground' : 'text-muted-foreground')}
            >
              {active && (
                <motion.span layoutId="stat-range-pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} className="absolute inset-0 rounded-full bg-background shadow-sm" />
              )}
              <span className="relative z-10">{r.label}</span>
            </button>
          )
        })}
        <button
          onClick={() => {
            setRange('custom')
            setPicker('start')
          }}
          className={cn('relative h-9 rounded-full text-[13px] font-bold transition-colors', isCustom ? 'text-foreground' : 'text-muted-foreground')}
        >
          {isCustom && (
            <motion.span layoutId="stat-range-pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} className="absolute inset-0 rounded-full bg-background shadow-sm" />
          )}
          <span className="relative z-10">Custom</span>
        </button>
      </div>

      {/* ===== Custom from/to selector — only when Custom is active ===== */}
      {isCustom && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPicker('start')}
            className="flex-1 min-w-0 flex flex-col items-start rounded-2xl bg-secondary/60 border border-border/60 px-4 py-2.5 text-left transition-colors hover:bg-secondary"
          >
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">From</span>
            <span className="text-[14px] font-bold text-foreground truncate w-full">
              {new Date(customStart + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </button>
          <span className="text-muted-foreground text-[13px] font-bold shrink-0">→</span>
          <button
            onClick={() => setPicker('end')}
            className="flex-1 min-w-0 flex flex-col items-start rounded-2xl bg-secondary/60 border border-border/60 px-4 py-2.5 text-left transition-colors hover:bg-secondary"
          >
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">To</span>
            <span className="text-[14px] font-bold text-foreground truncate w-full">
              {new Date(customEnd + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </button>
        </div>
      )}

      {/* Calendar picker modal — drives either the From or To date. */}
      <CalendarDatePicker
        open={picker === 'start'}
        value={customStart}
        onConfirm={(date) => {
          setCustomStart(date)
          // If the new start is after end, push end to match.
          if (new Date(date) > new Date(customEnd)) setCustomEnd(date)
          setPicker(null)
        }}
        onCancel={() => setPicker(null)}
      />
      <CalendarDatePicker
        open={picker === 'end'}
        value={customEnd}
        onConfirm={(date) => {
          setCustomEnd(date)
          // If the new end is before start, pull start back to match.
          if (new Date(date) < new Date(customStart)) setCustomStart(date)
          setPicker(null)
        }}
        onCancel={() => setPicker(null)}
      />

      {/* ===== Section tabs ===== */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative shrink-0 px-3.5 py-2 text-[13px] font-bold transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {t.label}
              {active && (
                <motion.span
                  layoutId="stat-tab-underline"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute left-3 right-3 -bottom-0.5 h-[2.5px] rounded-full bg-primary"
                />
              )}
            </button>
          )
        })}
      </div>

      {/* ===== Section content ===== */}
      {tab === 'cashflow' && (
        <CashFlowSection
          currentTx={currentTx}
          previousTx={previousTx}
          days={activeRange.days}
          rangeLabel={activeRange.label}
        />
      )}
      {tab === 'spending' && (
        <CategoryBook
          currentTx={currentTx}
          previousTx={previousTx}
          mode="expense"
          rangeLabel={activeRange.label}
        />
      )}
      {tab === 'credit' && (
        <CreditSection accounts={safeAccounts} currentTx={currentTx} />
      )}
      {tab === 'reports' && (
        <ReportsSection
          currentTx={currentTx}
          previousTx={previousTx}
          days={activeRange.days}
          rangeLabel={activeRange.label}
          windows={windows}
        />
      )}
      {tab === 'assets' && <AssetsSection accounts={safeAccounts} />}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Shared card chrome
 * ------------------------------------------------------------------ */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[1.6rem] bg-card border border-border/70 shadow-card overflow-hidden', className)}>
      {children}
    </div>
  )
}

function CardHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
      <div className="min-w-0">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle && <p className="text-[12.5px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action ?? (
        <button
          className="w-9 h-9 -mr-1 -mt-1 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors shrink-0"
          aria-label="Share"
        >
          <Share2 className="w-[17px] h-[17px]" strokeWidth={2.2} />
        </button>
      )}
    </div>
  )
}

/* Small "vs past period" delta chip. Fixed, compact — never pushes amounts. */
function DeltaChip({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) {
    return <span className="text-[13px] font-semibold text-muted-foreground tabular-nums whitespace-nowrap">— — —</span>
  }
  const rounded = Math.round(value)
  const flat = rounded === 0
  // For expenses, a rise is "bad" (red); for income a rise is "good" (green).
  const good = invert ? rounded < 0 : rounded > 0
  const color = flat ? 'text-muted-foreground' : good ? 'text-positive' : 'text-negative'
  const Icon = flat ? Minus : rounded > 0 ? TrendingUp : TrendingDown
  // Clamp extreme values so a 12000% swing doesn't blow out the layout.
  const shown = Math.abs(rounded) > 999 ? '999+' : `${rounded > 0 ? '+' : ''}${rounded}`
  return (
    <span className={cn('inline-flex items-center gap-1 text-[13px] font-bold tabular-nums whitespace-nowrap', color)}>
      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.4} />
      {shown}%
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Cash-flow: Quick overview table + Income & Expenses book
 * ------------------------------------------------------------------ */
function CashFlowSection({
  currentTx,
  previousTx,
  days,
  rangeLabel,
}: {
  currentTx: Transaction[]
  previousTx: Transaction[]
  days: number
  rangeLabel: string
}) {
  const stats = React.useMemo(() => {
    const build = (list: Transaction[]) => {
      const income = list.filter(t => t.type === 'income')
      const expense = list.filter(t => t.type === 'expense')
      const incomeTotal = income.reduce((s, t) => s + t.amount, 0)
      const expenseTotal = expense.reduce((s, t) => s + t.amount, 0)
      return {
        income: {
          count: income.length,
          total: incomeTotal,
          avgDay: incomeTotal / days,
          avgRec: income.length ? incomeTotal / income.length : 0,
        },
        expense: {
          count: expense.length,
          total: expenseTotal,
          avgDay: expenseTotal / days,
          avgRec: expense.length ? expenseTotal / expense.length : 0,
        },
        net: incomeTotal - expenseTotal,
      }
    }
    return { cur: build(currentTx), prev: build(previousTx) }
  }, [currentTx, previousTx, days])

  const { cur, prev } = stats

  const ROWS: { label: string; inc: number; exp: number; money: boolean }[] = [
    { label: 'Count', inc: cur.income.count, exp: cur.expense.count, money: false },
    { label: 'Average (Day)', inc: cur.income.avgDay, exp: cur.expense.avgDay, money: true },
    { label: 'Average (Record)', inc: cur.income.avgRec, exp: cur.expense.avgRec, money: true },
    { label: 'Total', inc: cur.income.total, exp: cur.expense.total, money: true },
  ]

  return (
    <div className="space-y-5">
      {/* --- Cash Flow Table --- */}
      <Card>
        <CardHead title="Cash Flow Table" subtitle="Am I spending too much?" />
        <div className="px-5 pb-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Last {rangeLabel}</p>

          {/* column headers — amount columns are flexible & right-aligned */}
          <div className="flex items-center gap-3 pb-2 border-b border-border/60">
            <span className="w-[34%] shrink-0 text-[13px] font-bold text-foreground">Quick overview</span>
            <span className="flex-1 min-w-0 text-[13px] font-bold text-positive text-right">Income</span>
            <span className="flex-1 min-w-0 text-[13px] font-bold text-negative text-right">Expenses</span>
          </div>

          <div className="divide-y divide-border/40">
            {ROWS.map(r => (
              <div key={r.label} className="flex items-center gap-3 py-2.5">
                <span className="w-[34%] shrink-0 text-[13.5px] text-muted-foreground truncate">{r.label}</span>
                <span className="flex-1 min-w-0 text-right">
                  {r.money
                    ? <Amount value={r.inc} size="sm" className="text-foreground" />
                    : <span className="text-[13.5px] font-semibold text-foreground tabular-nums">{r.inc}</span>}
                </span>
                <span className="flex-1 min-w-0 text-right">
                  {r.money
                    ? <Amount value={r.exp} size="sm" className="text-negative" />
                    : <span className="text-[13.5px] font-semibold text-negative tabular-nums">{r.exp}</span>}
                </span>
              </div>
            ))}
          </div>

          {/* net cash flow */}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-4 py-3.5">
            <span className="text-[14px] font-semibold text-muted-foreground shrink-0">Cash flow</span>
            <Amount value={cur.net} signed size="lg" className={cur.net >= 0 ? 'text-positive' : 'text-negative'} />
          </div>
        </div>
      </Card>

      {/* --- Income & Expenses Book --- */}
      <Card>
        <CardHead title="Income & Expenses Book" subtitle="Want to see where your money goes?" />
        <div className="px-5 pb-5">
          <div className="flex items-end justify-between gap-3 border-b border-border/60 pb-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Last {rangeLabel}</p>
              <Amount value={cur.net} signed size="hero" className="text-foreground mt-0.5 block" />
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">vs past period</p>
              <DeltaChip value={pctChange(Math.abs(cur.net), Math.abs(prev.net))} />
            </div>
          </div>

          {/* Income rollup + categories */}
          <CategoryRollup
            heading="Income"
            headingColor="text-positive"
            currentTx={currentTx}
            previousTx={previousTx}
            type="income"
          />
          <div className="h-px bg-border/50 my-4" />
          <CategoryRollup
            heading="Expenses"
            headingColor="text-negative"
            currentTx={currentTx}
            previousTx={previousTx}
            type="expense"
          />
        </div>
      </Card>
    </div>
  )
}

/* A heading row (Income / Expenses with totals + delta) followed by its
 * per-category breakdown. Layout rule for big numbers: the category name is
 * the ONLY element allowed to shrink/ellipsize; amounts and deltas are fixed
 * and never truncate. */
function CategoryRollup({
  heading,
  headingColor,
  currentTx,
  previousTx,
  type,
}: {
  heading: string
  headingColor: string
  currentTx: Transaction[]
  previousTx: Transaction[]
  type: 'income' | 'expense'
}) {
  const data = React.useMemo(() => {
    const sum = (list: Transaction[]) => {
      const map: Record<string, number> = {}
      let total = 0
      list.filter(t => t.type === type).forEach(t => {
        map[t.category] = (map[t.category] || 0) + t.amount
        total += t.amount
      })
      return { map, total }
    }
    const cur = sum(currentTx)
    const prev = sum(previousTx)
    const cats = Object.entries(cur.map)
      .map(([name, amount]) => ({
        name,
        amount,
        delta: pctChange(amount, prev.map[name] ?? 0),
      }))
      .sort((a, b) => b.amount - a.amount)
    return { cats, curTotal: cur.total, prevTotal: prev.total }
  }, [currentTx, previousTx, type])

  const invert = type === 'expense' // for expenses: increase = red

  return (
    <div className="mt-4">
      {/* rollup header */}
      <div className="flex items-center gap-3 rounded-xl bg-secondary/50 px-3.5 py-2.5">
        <span className={cn('flex-1 min-w-0 text-[14px] font-bold truncate', headingColor)}>{heading}</span>
        <Amount value={data.curTotal} size="md" className="text-foreground shrink-0" />
        <div className="w-[52px] text-right shrink-0">
          <DeltaChip value={pctChange(data.curTotal, data.prevTotal)} invert={invert} />
        </div>
      </div>

      {/* per-category list */}
      {data.cats.length > 0 ? (
        <div className="mt-1">
          {data.cats.map((c, idx) => {
            const cfg = getCategoryConfig(c.name)
            return (
              <motion.div
                key={c.name}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0"
              >
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ring-1 ring-black/5 dark:ring-white/5', cfg.bg)}>
                  {cfg.emoji}
                </div>
                <span className="flex-1 min-w-0 text-[14px] font-semibold text-foreground truncate">{cfg.label}</span>
                <Amount value={c.amount} size="md" className="text-foreground shrink-0" />
                <div className="w-[52px] text-right shrink-0">
                  <DeltaChip value={c.delta} invert={invert} />
                </div>
              </motion.div>
            )
          })}
        </div>
      ) : (
        <p className="text-center text-[13px] text-muted-foreground py-4">No {type} in this period.</p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Spending / Income book (full category breakdown with bars)
 * ------------------------------------------------------------------ */
function CategoryBook({
  currentTx,
  previousTx,
  mode,
  rangeLabel,
}: {
  currentTx: Transaction[]
  previousTx: Transaction[]
  mode: 'income' | 'expense'
  rangeLabel: string
}) {
  const data = React.useMemo(() => {
    const sum = (list: Transaction[]) => {
      const map: Record<string, number> = {}
      let total = 0
      list.filter(t => t.type === mode).forEach(t => {
        map[t.category] = (map[t.category] || 0) + t.amount
        total += t.amount
      })
      return { map, total }
    }
    const cur = sum(currentTx)
    const prev = sum(previousTx)
    const cats = Object.entries(cur.map)
      .map(([name, amount]) => ({
        name,
        amount,
        pct: cur.total > 0 ? (amount / cur.total) * 100 : 0,
        delta: pctChange(amount, prev.map[name] ?? 0),
      }))
      .sort((a, b) => b.amount - a.amount)
    return { cats, curTotal: cur.total, prevTotal: prev.total }
  }, [currentTx, previousTx, mode])

  return (
    <Card>
      <CardHead title="Spending Breakdown" subtitle="Where is your money going?" />
      <div className="px-5 pb-5">
        <div className="flex items-end justify-between gap-3 border-b border-border/60 pb-3 mb-1">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Last {rangeLabel}</p>
            <Amount value={data.curTotal} size="hero" className="text-negative mt-0.5 block" />
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">vs past period</p>
            <DeltaChip value={pctChange(data.curTotal, data.prevTotal)} invert />
          </div>
        </div>

        {data.cats.length > 0 ? (
          <div className="space-y-4 mt-4">
            {data.cats.map((c, idx) => {
              const cfg = getCategoryConfig(c.name)
              const color = CHART_COLORS[idx % CHART_COLORS.length]
              return (
                <motion.div
                  key={c.name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(idx * 0.04, 0.4) }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 ring-1 ring-black/5 dark:ring-white/5', cfg.bg)}>
                      {cfg.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold text-foreground truncate">{cfg.label}</span>
                      <span className="text-[12px] text-muted-foreground">{c.pct.toFixed(1)}%</span>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <Amount value={c.amount} size="md" className="text-foreground" />
                      <DeltaChip value={c.delta} invert />
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, c.pct)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <p className="text-center text-[13px] text-muted-foreground py-8">No spending in this period.</p>
        )}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Credit: credit-card accounts, utilisation & spend
 * ------------------------------------------------------------------ */
function CreditSection({ accounts, currentTx }: { accounts: Account[]; currentTx: Transaction[] }) {
  const cards = accounts.filter(a => a.type === 'card')

  if (cards.length === 0) {
    return (
      <Card>
        <CardHead title="Credit" subtitle="Cards, limits & utilisation" />
        <p className="px-5 pb-8 text-center text-[13px] text-muted-foreground">No credit cards added yet.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {cards.map(card => {
        const limit = card.creditLimit ?? 0
        // Outstanding ~ negative balance magnitude (cards usually carry a debt balance).
        const outstanding = card.balance < 0 ? Math.abs(card.balance) : card.balance
        const util = limit > 0 ? Math.min(100, (outstanding / limit) * 100) : 0
        const spent = currentTx
          .filter(t => t.accountId === card.id && t.type === 'expense')
          .reduce((s, t) => s + t.amount, 0)
        const over = limit > 0 && outstanding > limit
        return (
          <Card key={card.id}>
            <CardHead title={card.name} subtitle="Credit card" />
            <div className="px-5 pb-5">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] text-muted-foreground">Outstanding</p>
                  <Amount value={outstanding} size="lg" className="text-foreground mt-0.5 block" />
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] text-muted-foreground">Limit</p>
                  {limit > 0
                    ? <Amount value={limit} size="md" className="text-foreground mt-0.5 block" />
                    : <p className="text-[16px] font-bold text-foreground mt-0.5">—</p>}
                </div>
              </div>

              {limit > 0 && (
                <>
                  <div className="mt-4 w-full h-2.5 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      className={cn('h-full rounded-full', over ? 'bg-negative' : 'bg-primary')}
                      initial={{ width: 0 }}
                      animate={{ width: `${util}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-1.5">
                    {util.toFixed(0)}% utilised{over ? ' · over limit' : ''}
                  </p>
                </>
              )}

              <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-4 py-3">
                <span className="text-[13px] font-semibold text-muted-foreground shrink-0">Spent this period</span>
                <Amount value={spent} size="md" className="text-foreground" />
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Reports: summary + full category breakdowns + export (CSV / JSON).
 * This replaces the former standalone Reports module.
 * ------------------------------------------------------------------ */
function ReportsSection({
  currentTx,
  previousTx,
  days,
  rangeLabel,
  windows,
}: {
  currentTx: Transaction[]
  previousTx: Transaction[]
  days: number
  rangeLabel: string
  windows: { start: Date; end: Date; prevStart: Date; prevEnd: Date }
}) {
  const r = React.useMemo(() => {
    const build = (list: Transaction[]) => {
      const income = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const expense = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      return { income, expense, net: income - expense }
    }
    const cur = build(currentTx)
    const prev = build(previousTx)
    const savingsRate = cur.income > 0 ? Math.round((cur.net / cur.income) * 100) : 0

    const byCat = (type: 'income' | 'expense') => {
      const map: Record<string, number> = {}
      currentTx.filter(t => t.type === type).forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount })
      const total = type === 'income' ? cur.income : cur.expense
      return Object.entries(map)
        .map(([category, amount]) => ({ category, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
        .sort((a, b) => b.amount - a.amount)
    }
    return { cur, prev, savingsRate, incomeCats: byCat('income'), expenseCats: byCat('expense') }
  }, [currentTx, previousTx])

  const ymd = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const startStr = ymd(windows.start)
  const endStr = ymd(windows.end)

  const download = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `statistics-${startStr}-to-${endStr}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const buildReportObject = () => ({
    period: { label: `Last ${rangeLabel}`, startDate: startStr, endDate: endStr, days },
    totals: {
      income: r.cur.income,
      expense: r.cur.expense,
      netSavings: r.cur.net,
      savingsRate: r.savingsRate,
    },
    vsPastPeriod: {
      income: pctChange(r.cur.income, r.prev.income),
      expense: pctChange(r.cur.expense, r.prev.expense),
      net: pctChange(Math.abs(r.cur.net), Math.abs(r.prev.net)),
    },
    incomeByCategory: r.incomeCats,
    expenseByCategory: r.expenseCats,
  })

  const exportCSV = () => {
    const esc = (v: string | number) => {
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines: string[] = []
    lines.push(`Statistics Report,Last ${rangeLabel}`)
    lines.push(`Period,${startStr} to ${endStr} (${days} days)`)
    lines.push('')
    lines.push('SUMMARY')
    lines.push(`Total Income,${r.cur.income}`)
    lines.push(`Total Expense,${r.cur.expense}`)
    lines.push(`Net Savings,${r.cur.net}`)
    lines.push(`Savings Rate,${r.savingsRate}%`)
    lines.push('')
    lines.push('INCOME BY CATEGORY')
    lines.push('Category,Amount,Percentage')
    r.incomeCats.forEach(c => lines.push(`${esc(c.category)},${c.amount},${c.pct.toFixed(2)}%`))
    lines.push('')
    lines.push('EXPENSE BY CATEGORY')
    lines.push('Category,Amount,Percentage')
    r.expenseCats.forEach(c => lines.push(`${esc(c.category)},${c.amount},${c.pct.toFixed(2)}%`))
    download(lines.join('\n'), 'text/csv', 'csv')
  }

  const exportJSON = () => download(JSON.stringify(buildReportObject(), null, 2), 'application/json', 'json')

  return (
    <div className="space-y-5">
      {/* Summary */}
      <Card className="relative">
        <div className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 rounded-full bg-positive/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-negative/10 blur-3xl" />
        <CardHead title="Summary Report" subtitle={`Last ${rangeLabel} · ${days} days`} />
        <div className="relative px-5 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-positive">Income</p>
              <Amount value={r.cur.income} size="lg" className="text-foreground mt-1 block" />
              <div className="mt-0.5"><DeltaChip value={pctChange(r.cur.income, r.prev.income)} /></div>
            </div>
            <div className="min-w-0 flex-1 text-right flex flex-col items-end">
              <p className="text-[11px] font-bold uppercase tracking-wider text-negative">Expenses</p>
              <Amount value={r.cur.expense} size="lg" className="text-foreground mt-1 block" />
              <div className="mt-0.5"><DeltaChip value={pctChange(r.cur.expense, r.prev.expense)} invert /></div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-secondary/60 px-4 py-3.5 min-w-0">
              <p className="text-[12px] font-semibold text-muted-foreground">Net savings</p>
              <Amount value={r.cur.net} signed size="md" className={cn('mt-0.5 block', r.cur.net >= 0 ? 'text-positive' : 'text-negative')} />
            </div>
            <div className="rounded-2xl bg-secondary/60 px-4 py-3.5 min-w-0">
              <p className="text-[12px] font-semibold text-muted-foreground">Savings rate</p>
              <p className="text-[18px] font-extrabold text-foreground mt-0.5 tabular-nums">{r.savingsRate}%</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Income categories */}
      <Card>
        <CardHead title="Income categories" />
        <div className="px-5 pb-5">
          <CategoryList cats={r.incomeCats} invert={false} />
        </div>
      </Card>

      {/* Expense categories */}
      <Card>
        <CardHead title="Expense categories" />
        <div className="px-5 pb-5">
          <CategoryList cats={r.expenseCats} invert />
        </div>
      </Card>

      {/* Export */}
      <div>
        <h2 className="text-[15px] font-bold tracking-tight text-foreground mb-3">Export</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={exportCSV}
            className="h-14 rounded-[1.4rem] bg-card border border-border/70 shadow-card flex items-center justify-center gap-2.5 text-foreground font-bold text-[14px] hover:border-primary/40 transition-colors"
          >
            <Download className="w-[18px] h-[18px] text-primary" strokeWidth={2.2} /> CSV
          </button>
          <button
            onClick={exportJSON}
            className="h-14 rounded-[1.4rem] bg-card border border-border/70 shadow-card flex items-center justify-center gap-2.5 text-foreground font-bold text-[14px] hover:border-primary/40 transition-colors"
          >
            <FileJson className="w-[18px] h-[18px] text-primary" strokeWidth={2.2} /> JSON
          </button>
        </div>
      </div>
    </div>
  )
}

/* A simple ranked category list with percentage bar — big-number safe. */
function CategoryList({
  cats,
  invert,
}: {
  cats: { category: string; amount: number; pct: number }[]
  invert: boolean
}) {
  if (cats.length === 0) {
    return <p className="text-center text-[13px] text-muted-foreground py-4">Nothing in this period.</p>
  }
  return (
    <div className="space-y-4">
      {cats.map((c, idx) => {
        const cfg = getCategoryConfig(c.category)
        const color = CHART_COLORS[idx % CHART_COLORS.length]
        return (
          <div key={c.category}>
            <div className="flex items-center gap-3 mb-2">
              <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 ring-1 ring-black/5 dark:ring-white/5', cfg.bg)}>
                {cfg.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold text-foreground truncate">{cfg.label}</span>
                <span className="text-[12px] text-muted-foreground">{c.pct.toFixed(1)}%</span>
              </div>
              <Amount value={c.amount} size="md" className={cn('shrink-0', invert ? 'text-foreground' : 'text-foreground')} />
            </div>
            <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, c.pct)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Assets: account balances overview
 * ------------------------------------------------------------------ */
function AssetsSection({ accounts }: { accounts: Account[] }) {
  const positive = accounts.filter(a => a.type !== 'card')
  const total = positive.reduce((s, a) => s + a.balance, 0)

  return (
    <Card>
      <CardHead title="Assets" subtitle="Balances across your accounts" />
      <div className="px-5 pb-5">
        <div className="rounded-2xl bg-secondary/60 px-4 py-4 mb-4">
          <p className="text-[12px] font-semibold text-muted-foreground">Total balance</p>
          <Amount value={total} signed size="hero" className="text-foreground mt-0.5 block" />
        </div>

        {positive.length > 0 ? (
          <div>
            {positive
              .slice()
              .sort((a, b) => b.balance - a.balance)
              .map(a => (
                <div key={a.id} className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-lg shrink-0">
                    {a.icon || '🏦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold text-foreground truncate">{a.name}</span>
                    <span className="text-[12px] text-muted-foreground capitalize">{a.type}</span>
                  </div>
                  <Amount value={a.balance} signed size="md" className="text-foreground shrink-0" />
                </div>
              ))}
          </div>
        ) : (
          <p className="text-center text-[13px] text-muted-foreground py-6">No accounts yet.</p>
        )}
      </div>
    </Card>
  )
}
