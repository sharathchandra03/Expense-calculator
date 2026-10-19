'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { ChevronLeft, ChevronRight, Download, Pencil } from 'lucide-react'
import { getCategoryConfig, CHART_COLORS } from '@/lib/category-icons'

/* ------------------------------------------------------------------ *
 * Types & constants
 * ------------------------------------------------------------------ */
type Period = 'week' | 'month' | 'year' | 'custom'
type CatMode = 'spending' | 'income'
type PayMode = 'spending' | 'income' | 'transfers'

const DONUT_COLORS = CHART_COLORS

/* Renders a percentage label at the radial midpoint of each slice, so the
 * figure sits *inside* the donut ring (never clipped at the chart edge).
 * Slices smaller than 3% are skipped to avoid clutter; the exact figure for
 * every category is always shown in the ranked list below the donut. */
const renderDonutLabel = (props: {
  cx: number
  cy: number
  midAngle: number
  innerRadius: number
  outerRadius: number
  percent: number
}) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props
  if (percent * 100 < 3) return null
  const RAD = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) / 2
  const x = cx + radius * Math.cos(-midAngle * RAD)
  const y = cy + radius * Math.sin(-midAngle * RAD)
  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  )
}

/* Picks a font-size class based on the length of the formatted amount string,
 * so large values (lakhs / crores) shrink to fit instead of overflowing and
 * colliding. Font weight stays constant so thickness looks uniform across sizes. */
const amountSizeClass = (text: string): string => {
  const len = text.length
  if (len <= 10) return 'text-[26px]'
  if (len <= 12) return 'text-[22px]'
  if (len <= 14) return 'text-[19px]'
  if (len <= 16) return 'text-[16px]'
  return 'text-[14px]'
}

const toYMD = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const startOfWeek = (d: Date) => {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // Monday = 0
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */
export function Analytics() {
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [customRange, setCustomRange] = useState(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: toYMD(start), end: toYMD(now) }
  })
  const [catMode, setCatMode] = useState<CatMode>('spending')
  const [payMode, setPayMode] = useState<PayMode>('spending')

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const budgets = useLiveQuery(() => db.budgets.toArray()) ?? []

  const safeTx = Array.isArray(transactions) ? transactions : []
  const safeAccounts = Array.isArray(accounts) ? accounts : []
  const safeBudgets = Array.isArray(budgets) ? budgets : []

  /* ---- Date range for the selected period ---- */
  const range = React.useMemo(() => {
    if (period === 'week') {
      const start = startOfWeek(anchor)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      return { start, end }
    }
    if (period === 'year') {
      const start = new Date(anchor.getFullYear(), 0, 1)
      const end = new Date(anchor.getFullYear(), 11, 31, 23, 59, 59, 999)
      return { start, end }
    }
    if (period === 'custom') {
      const start = new Date(customRange.start + 'T00:00:00')
      const end = new Date(customRange.end + 'T23:59:59')
      return { start, end }
    }
    // month
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999)
    return { start, end }
  }, [period, anchor, customRange])

  /* ---- Navigation ---- */
  const navigate = (dir: -1 | 1) => {
    setAnchor(prev => {
      const d = new Date(prev)
      if (period === 'week') d.setDate(d.getDate() + dir * 7)
      else if (period === 'year') d.setFullYear(d.getFullYear() + dir)
      else d.setMonth(d.getMonth() + dir) // month
      return d
    })
  }

  const rangeLabel = React.useMemo(() => {
    if (period === 'week') {
      const s = range.start
      const e = range.end
      const sameMonth = s.getMonth() === e.getMonth()
      const sFmt = s.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
      const eFmt = e.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
      return sameMonth ? `${s.getDate()} – ${eFmt}` : `${sFmt} – ${eFmt}`
    }
    if (period === 'year') return String(anchor.getFullYear())
    if (period === 'custom') {
      const s = new Date(customRange.start + 'T00:00:00')
      const e = new Date(customRange.end + 'T00:00:00')
      return `${s.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return anchor.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  }, [period, anchor, range, customRange])

  /* ---- Transactions within the range ---- */
  const periodTx = React.useMemo(() => {
    return safeTx.filter(tx => {
      const d = new Date(tx.date + 'T00:00:00')
      return d >= range.start && d <= range.end
    })
  }, [safeTx, range])

  const spendingTx = periodTx.filter(t => t.type === 'expense')
  const incomeTx = periodTx.filter(t => t.type === 'income')

  /* ---- Summary ---- */
  const summary = React.useMemo(() => {
    const spending = spendingTx.reduce((s, t) => s + t.amount, 0)
    const income = incomeTx.reduce((s, t) => s + t.amount, 0)
    return { spending, income, net: income - spending }
  }, [spendingTx, incomeTx])

  /* ---- Days in the selected range (for per-day averages) ---- */
  const daysInRange = React.useMemo(() => {
    const ms = range.end.getTime() - range.start.getTime()
    return Math.max(1, Math.round(ms / 86_400_000) + 1)
  }, [range])

  /* ---- Budget (matches the selected period where possible) ---- */
  const budgetData = React.useMemo(() => {
    const periodForBudget = period === 'week' ? 'weekly' : period === 'year' ? 'yearly' : 'monthly'
    const active = safeBudgets.filter(b => b.isActive && b.period === periodForBudget)
    const limit = active.reduce((s, b) => s + b.limit, 0)
    const spent = summary.spending
    const remaining = limit - spent
    const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0
    // Days left within the current range (for "safe to spend")
    const now = new Date()
    const endForSafe = range.end < now ? range.end : range.end
    const daysLeft = Math.max(1, Math.round((endForSafe.getTime() - Math.max(now.getTime(), range.start.getTime())) / 86_400_000) + 1)
    const safePerDay = remaining > 0 ? remaining / daysLeft : 0
    return { limit, spent, remaining, pct, daysLeft, safePerDay, hasBudget: active.length > 0 }
  }, [safeBudgets, summary.spending, period, range])

  /* ---- Categories (donut + ranked list) ---- */
  const categoryData = React.useMemo(() => {
    const src = catMode === 'spending' ? spendingTx : incomeTx
    const total = src.reduce((s, t) => s + t.amount, 0)
    const map: Record<string, number> = {}
    src.forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount })
    const list = Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
    return { list, total }
  }, [spendingTx, incomeTx, catMode])

  /* ---- Payment modes ---- */
  const paymentData = React.useMemo(() => {
    let src = periodTx
    if (payMode === 'spending') src = periodTx.filter(t => t.type === 'expense' && t.category !== 'Transfer')
    else if (payMode === 'income') src = periodTx.filter(t => t.type === 'income' && t.category !== 'Transfer')
    else src = periodTx.filter(t => t.category === 'Transfer')

    const map: Record<string, number> = {}
    src.forEach(t => {
      const acct = safeAccounts.find(a => a.id === t.accountId)
      const name = acct?.name || 'Cash'
      map[name] = (map[name] || 0) + t.amount
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [periodTx, payMode, safeAccounts])

  /* ---- Stats (averages recompute per period) ---- */
  const stats = React.useMemo(() => {
    const spendPerDay = summary.spending / daysInRange
    const spendPerTx = spendingTx.length > 0 ? summary.spending / spendingTx.length : 0
    const incomePerDay = summary.income / daysInRange
    const incomePerTx = incomeTx.length > 0 ? summary.income / incomeTx.length : 0
    return { spendPerDay, spendPerTx, incomePerDay, incomePerTx }
  }, [summary, daysInRange, spendingTx.length, incomeTx.length])

  /* ---- CSV export of the current period ---- */
  const exportCsv = () => {
    const rows = [['Date', 'Type', 'Category', 'Amount', 'Account', 'Description']]
    periodTx
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach(t => {
        const acct = safeAccounts.find(a => a.id === t.accountId)
        rows.push([t.date, t.type, t.category, String(t.amount), acct?.name || '', (t.description || '').replace(/,/g, ' ')])
      })
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analysis-${rangeLabel.replace(/\s+/g, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <div className="flex flex-col space-y-5 pb-8">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Analysis</h1>
        <button
          onClick={exportCsv}
          className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/70 transition-colors"
          aria-label="Export this period as CSV"
        >
          <Download className="w-[18px] h-[18px]" strokeWidth={2.2} />
        </button>
      </div>

      {/* ===== Period selector ===== */}
      <div className="grid grid-cols-4 gap-1 p-1.5 rounded-full bg-secondary/70">
        {PERIODS.map(p => {
          const active = period === p.key
          return (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'relative h-9 rounded-full text-[13px] font-bold transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {active && (
                <motion.span
                  layoutId="period-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-full bg-background shadow-sm"
                />
              )}
              <span className="relative z-10">{p.label}</span>
            </button>
          )
        })}
      </div>

      {/* ===== Period navigator ===== */}
      {period === 'custom' ? (
        <RangeCalendar
          start={customRange.start}
          end={customRange.end}
          onChange={(start, end) => setCustomRange({ start, end })}
        />
      ) : (
        <div className="rounded-full bg-secondary/40 border border-border/60 flex items-center justify-between px-2 py-2.5">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors" aria-label="Previous period">
            <ChevronLeft className="w-5 h-5" strokeWidth={2.4} />
          </button>
          <div className="text-center">
            <p className="text-[17px] font-extrabold tracking-tight text-foreground leading-tight">{rangeLabel}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
              {periodTx.length} {periodTx.length === 1 ? 'Transaction' : 'Transactions'}
            </p>
          </div>
          <button onClick={() => navigate(1)} className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors" aria-label="Next period">
            <ChevronRight className="w-5 h-5" strokeWidth={2.4} />
          </button>
        </div>
      )}

      {/* ===== Spending / Income summary ===== */}
      <div className="relative rounded-[1.6rem] bg-card border border-border/70 p-5 shadow-card overflow-hidden">
        {/* soft color glows */}
        <div className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 rounded-full bg-negative/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-positive/10 blur-3xl" />
        {(() => {
          const spendStr = formatCurrency(summary.spending)
          const incomeStr = formatCurrency(summary.income)
          // Size both numbers off the longer string so they stay visually balanced
          const sizeClass = amountSizeClass(spendStr.length >= incomeStr.length ? spendStr : incomeStr)
          return (
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-negative">Spending</p>
                <p className={cn('font-bold tracking-tight text-foreground mt-1 tabular-nums truncate', sizeClass)}>{spendStr}</p>
              </div>
              <div className="min-w-0 flex-1 text-right">
                <p className="text-[11px] font-bold uppercase tracking-wider text-positive">Income</p>
                <p className={cn('font-bold tracking-tight text-foreground mt-1 tabular-nums truncate', sizeClass)}>{incomeStr}</p>
              </div>
            </div>
          )
        })()}
        <div className="relative mt-5 flex items-center justify-between rounded-2xl bg-secondary/60 px-4 py-3.5">
          <span className="text-[14px] font-semibold text-muted-foreground">Net Balance</span>
          <span className={cn('text-[18px] font-extrabold', summary.net >= 0 ? 'text-foreground' : 'text-negative')}>
            {summary.net < 0 ? '-' : ''}{formatCurrency(Math.abs(summary.net))}
          </span>
        </div>
      </div>

      {/* ===== Budget ===== */}
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight text-foreground mb-3">Budget</h2>
        <div className="rounded-[1.6rem] bg-card border border-border/70 p-6 shadow-card">
          {budgetData.hasBudget ? (
            <>
              <BudgetGauge remaining={budgetData.remaining} pct={budgetData.pct} />
              <div className="flex items-end justify-between mt-4">
                <div>
                  <p className="text-[13px] text-muted-foreground">Spent</p>
                  <p className="text-[17px] font-extrabold text-foreground">{formatCurrency(budgetData.spent)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-muted-foreground flex items-center gap-1 justify-end">
                    Limit <Pencil className="w-3 h-3" />
                  </p>
                  <p className="text-[17px] font-extrabold text-foreground">{formatCurrency(budgetData.limit)}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/60 text-center">
                <p className="text-[13px] text-muted-foreground">
                  Safe to spend: <span className="font-extrabold text-positive">{formatCurrency(budgetData.safePerDay)}/day</span> for the rest of this period.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <p className="text-[14px] font-semibold text-foreground">No budget set for this period</p>
              <p className="text-[12px] text-muted-foreground mt-1">Create a budget to track safe-to-spend here.</p>
            </div>
          )}
        </div>
      </div>

      {/* ===== Categories ===== */}
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight text-foreground mb-3">Categories</h2>
        <div className="rounded-[1.6rem] bg-card border border-border/70 p-5 shadow-card space-y-5">
          {/* Spending / Income toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-secondary/70 w-[220px] mx-auto">
            {(['spending', 'income'] as CatMode[]).map(m => {
              const active = catMode === m
              return (
                <button
                  key={m}
                  onClick={() => setCatMode(m)}
                  className={cn('relative h-8 rounded-full text-[12px] font-bold capitalize transition-colors', active ? 'text-foreground' : 'text-muted-foreground')}
                >
                  {active && (
                    <motion.span layoutId="cat-pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} className="absolute inset-0 rounded-full bg-background shadow-sm" />
                  )}
                  <span className="relative z-10">{m}</span>
                </button>
              )
            })}
          </div>

          {categoryData.list.length > 0 ? (
            <>
              {/* Donut with % labels placed inside each slice */}
              <div className="relative h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={categoryData.list}
                      cx="50%" cy="50%"
                      innerRadius={62} outerRadius={100}
                      paddingAngle={2} dataKey="value" nameKey="name"
                      stroke="none" animationDuration={600}
                      label={renderDonutLabel}
                      labelLine={false}
                    >
                      {categoryData.list.map((_, idx) => (
                        <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', fontSize: '12px', boxShadow: 'var(--shadow-elevated)', padding: '10px 14px' }}
                      itemStyle={{ color: 'var(--foreground)' }}
                      formatter={(value: number, name: string) => {
                        const pct = categoryData.total > 0 ? ((value / categoryData.total) * 100).toFixed(1) : '0'
                        return [`${formatCurrency(value)} (${pct}%)`, getCategoryConfig(name).label]
                      }}
                    />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>

              {/* Ranked category list */}
              <div className="space-y-1">
                {categoryData.list.map((cat, idx) => {
                  const cfg = getCategoryConfig(cat.name)
                  const pct = categoryData.total > 0 ? (cat.value / categoryData.total) * 100 : 0
                  return (
                    <div key={cat.name} className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
                      <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 ring-1 ring-black/5 dark:ring-white/5', cfg.bg)}>
                        {cfg.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-[15px] font-semibold text-foreground truncate">{cfg.label}</span>
                        <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                          <span
                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                          />
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                      <span className="text-[15px] font-extrabold text-foreground flex-shrink-0">{formatCurrency(cat.value)}</span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-center text-[13px] text-muted-foreground py-6">No {catMode} in this period.</p>
          )}
        </div>
      </div>

      {/* ===== Payment modes ===== */}
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight text-foreground mb-3">Payment modes</h2>
        <div className="rounded-[1.6rem] bg-card border border-border/70 p-5 shadow-card space-y-4">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-full bg-secondary/70">
            {(['spending', 'income', 'transfers'] as PayMode[]).map(m => {
              const active = payMode === m
              return (
                <button
                  key={m}
                  onClick={() => setPayMode(m)}
                  className={cn('relative h-8 rounded-full text-[12px] font-bold capitalize transition-colors', active ? 'text-foreground' : 'text-muted-foreground')}
                >
                  {active && (
                    <motion.span layoutId="pay-pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} className="absolute inset-0 rounded-full bg-background shadow-sm" />
                  )}
                  <span className="relative z-10">{m}</span>
                </button>
              )
            })}
          </div>

          {paymentData.length > 0 ? (
            <div className="space-y-1">
              {paymentData.map((pm) => (
                <div key={pm.name} className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
                  <div className="w-10 h-10 rounded-2xl bg-positive/10 flex items-center justify-center text-lg flex-shrink-0">💵</div>
                  <span className="flex-1 text-[15px] font-semibold text-foreground truncate">{pm.name}</span>
                  <span className="text-[15px] font-extrabold text-foreground flex-shrink-0">{formatCurrency(pm.value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-[13px] text-muted-foreground py-4">No {payMode} in this period.</p>
          )}
        </div>
      </div>

      {/* ===== Stats ===== */}
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight text-foreground mb-3">Stats</h2>
        <div className="rounded-[1.6rem] bg-card border border-border/70 p-5 shadow-card space-y-5">
          {/* Average spending */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-negative mb-3">Average Spending</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[13px] text-muted-foreground">Per day</p>
                <p className="text-[20px] font-extrabold text-foreground mt-0.5">{formatCurrency(stats.spendPerDay)}</p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground">Per transaction</p>
                <p className="text-[20px] font-extrabold text-foreground mt-0.5">{formatCurrency(stats.spendPerTx)}</p>
              </div>
            </div>
          </div>
          <div className="h-px bg-border/60" />
          {/* Average income */}
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-positive mb-3">Average Income</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[13px] text-muted-foreground">Per day</p>
                <p className="text-[20px] font-extrabold text-foreground mt-0.5">{formatCurrency(stats.incomePerDay)}</p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground">Per transaction</p>
                <p className="text-[20px] font-extrabold text-foreground mt-0.5">{formatCurrency(stats.incomePerTx)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Budget semicircle gauge
 * ------------------------------------------------------------------ */
function BudgetGauge({ remaining, pct }: { remaining: number; pct: number }) {
  // Semicircle arc: 180° sweep. Stroke dasharray on a half-circle path.
  const R = 80
  const CX = 100
  const CY = 100
  const circumference = Math.PI * R // half circle length
  const progress = Math.max(0, Math.min(1, pct / 100))
  const over = remaining < 0
  const arcColor = over ? 'var(--negative)' : 'var(--positive)'

  // Arc path from left (180°) to right (0°)
  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`

  return (
    <div className="relative w-full flex flex-col items-center">
      <svg viewBox="0 0 200 112" className="w-full max-w-[280px]">
        {/* Track */}
        <path d={arc} fill="none" stroke="var(--secondary)" strokeWidth={16} strokeLinecap="round" />
        {/* Progress */}
        <path
          d={arc}
          fill="none"
          stroke={arcColor}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.32,0.72,0,1)' }}
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {over ? 'Over by' : 'Remaining'}
        </p>
        <p className={cn('text-[28px] font-extrabold tracking-tight', over ? 'text-negative' : 'text-foreground')}>
          {formatCurrency(Math.abs(remaining))}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Inline themed range calendar (pick start → end)
 * ------------------------------------------------------------------ */
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function RangeCalendar({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  const [viewDate, setViewDate] = useState(() => new Date((start || toYMD(new Date())) + 'T00:00:00'))
  // Which endpoint the next tap sets. Starts fresh: the first tap sets a new
  // start date, the next tap sets the end. Then it cycles.
  const [picking, setPicking] = useState<'start' | 'end'>('start')

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const startD = start ? new Date(start + 'T00:00:00') : null
  const endD = end ? new Date(end + 'T00:00:00') : null

  const handleDay = (day: number) => {
    const picked = ymd(year, month, day)
    const pickedD = new Date(picked + 'T00:00:00')

    if (picking === 'start') {
      // Starting a fresh range
      onChange(picked, picked)
      setPicking('end')
      return
    }
    // picking the end of the current range
    if (startD && pickedD < startD) {
      // Picked a date before the start → make it the new start
      onChange(picked, start)
    } else {
      onChange(start, picked)
    }
    setPicking('start')
  }

  const inRange = (day: number) => {
    if (!startD || !endD) return false
    const d = new Date(ymd(year, month, day) + 'T00:00:00')
    return d > startD && d < endD
  }
  const isStart = (day: number) => startD && ymd(year, month, day) === toYMD(startD)
  const isEnd = (day: number) => endD && ymd(year, month, day) === toYMD(endD)

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const fmt = (d: Date | null) => d ? d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="rounded-[1.6rem] bg-card border border-border/70 p-5 shadow-card">
      {/* Selected range summary */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className={cn('px-3 py-1.5 rounded-full text-[12px] font-bold', picking === 'start' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground')}>
          {fmt(startD)}
        </span>
        <span className="text-muted-foreground text-[13px] font-bold">→</span>
        <span className={cn('px-3 py-1.5 rounded-full text-[12px] font-bold', picking === 'end' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground')}>
          {fmt(endD)}
        </span>
      </div>

      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} className="w-9 h-9 rounded-full bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors">
          <ChevronLeft className="w-4 h-4" strokeWidth={2.4} />
        </button>
        <span className="text-[15px] font-extrabold text-foreground">{MONTHS[month]} {year}</span>
        <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} className="w-9 h-9 rounded-full bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors">
          <ChevronRight className="w-4 h-4" strokeWidth={2.4} />
        </button>
      </div>

      {/* Weekday row */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((wd, i) => (
          <div key={i} className="text-center text-[11px] font-bold text-muted-foreground py-1">{wd}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={idx} />
          const s = isStart(day)
          const e = isEnd(day)
          const mid = inRange(day)
          const endpoint = s || e
          return (
            <div key={idx} className={cn('flex justify-center', mid && 'bg-primary/12', s && !e && 'bg-primary/12 rounded-l-full', e && !s && 'bg-primary/12 rounded-r-full')}>
              <button
                type="button"
                onClick={() => handleDay(day)}
                className={cn(
                  'w-10 h-10 rounded-full text-[13px] font-semibold flex items-center justify-center transition-all',
                  endpoint ? 'bg-primary text-primary-foreground shadow-card' : mid ? 'text-primary font-semibold' : 'text-foreground hover:bg-secondary'
                )}
              >
                {day}
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer helper */}
      <div className="mt-3 pt-3 border-t border-border/60 text-center">
        <p className="text-[12px] text-muted-foreground">
          {picking === 'start' ? 'Tap to pick a start date' : 'Now pick an end date'}
        </p>
      </div>
    </div>
  )
}
