'use client'

import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Search, SlidersHorizontal, X } from 'lucide-react'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { getCategoryConfig } from '@/lib/category-icons'
import type { TabType } from '@/components/layout/bottom-nav'

interface CustomViewProps {
  onNavigateToTab?: (tab: TabType) => void
}

type TypeSegment = 'all' | 'expense' | 'income'
type RangeMode = 'all' | 'range'

interface Filters {
  type: TypeSegment
  categories: Set<string>
  paymentModes: Set<string>
  rangeMode: RangeMode
  from: string // YYYY-MM-DD
  to: string   // YYYY-MM-DD
}

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatRangeLabel(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function CustomView({ onNavigateToTab }: CustomViewProps) {
  const [search, setSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const rawTransactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const safeTransactions = useMemo(
    () => (Array.isArray(rawTransactions) ? rawTransactions : []),
    [rawTransactions]
  )
  const safeAccounts = useMemo(
    () => (Array.isArray(accounts) ? accounts : []),
    [accounts]
  )

  // Default range = current month
  const defaultFrom = useMemo(() => {
    const now = new Date()
    return toDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
  }, [])
  const defaultTo = useMemo(() => {
    const now = new Date()
    return toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  }, [])

  const [filters, setFilters] = useState<Filters>({
    type: 'all',
    categories: new Set(),
    paymentModes: new Set(),
    rangeMode: 'all',
    from: defaultFrom,
    to: defaultTo,
  })

  // Distinct categories & payment modes present in the data
  const availableCategories = useMemo(
    () => Array.from(new Set(safeTransactions.map(t => t.category))).filter(Boolean),
    [safeTransactions]
  )
  const availableAccounts = safeAccounts

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return safeTransactions
      .filter((tx) => {
        const matchSearch = !term ||
          tx.description.toLowerCase().includes(term) ||
          tx.category.toLowerCase().includes(term)
        const matchType = filters.type === 'all' || tx.type === filters.type
        const matchCategory = filters.categories.size === 0 || filters.categories.has(tx.category)
        const matchMode = filters.paymentModes.size === 0 || filters.paymentModes.has(tx.accountId)
        let matchRange = true
        if (filters.rangeMode === 'range') {
          matchRange = tx.date >= filters.from && tx.date <= filters.to
        }
        return matchSearch && matchType && matchCategory && matchMode && matchRange
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [safeTransactions, search, filters])

  const income = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  // Count of active filters for the badge
  const activeFilterCount =
    (filters.type !== 'all' ? 1 : 0) +
    filters.categories.size +
    filters.paymentModes.size +
    (filters.rangeMode === 'range' ? 1 : 0)

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
        <h1 className="text-[18px] font-bold text-foreground">Custom View</h1>
      </div>

      {/* Search + filter trigger */}
      <div className="flex items-center gap-2 px-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search transactions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 rounded-full bg-secondary border border-border/60 pl-10 pr-9 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setFilterOpen(true)}
          className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-secondary border border-border/60 text-foreground hover:bg-accent transition-colors"
          aria-label="Filter"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#6d5efc] text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 px-5 py-4">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Income</p>
          <p className="text-[13px] font-semibold text-emerald-500">{formatCurrency(income)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Expenses</p>
          <p className="text-[13px] font-semibold text-foreground">{formatCurrency(expense)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Net</p>
          <p className={cn('text-[13px] font-semibold', income - expense >= 0 ? 'text-emerald-500' : 'text-destructive')}>
            {income - expense < 0 ? '-' : '+'}{formatCurrency(Math.abs(income - expense))}
          </p>
        </div>
      </div>

      {/* Range chip (when active) */}
      {filters.rangeMode === 'range' && (
        <div className="px-4 pb-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6d5efc]/15 border border-[#6d5efc]/30 px-3 py-1 text-[11px] font-medium text-[#a78bfa]">
            {formatRangeLabel(filters.from)} — {formatRangeLabel(filters.to)}
          </span>
        </div>
      )}

      {/* Transaction list */}
      <div className="flex flex-col">
        {filtered.length > 0 ? (
          filtered.map((tx) => {
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
                    <span className="text-[11px] text-muted-foreground/50">·</span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    </span>
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
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-24 px-5 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-[16px] font-semibold text-foreground">No matching transactions</p>
            <p className="text-[13px] text-muted-foreground mt-1">Try adjusting your filters.</p>
          </div>
        )}
      </div>

      {/* Filter bottom sheet */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        setFilters={setFilters}
        availableCategories={availableCategories}
        availableAccounts={availableAccounts}
        defaultFrom={defaultFrom}
        defaultTo={defaultTo}
      />
    </div>
  )
}

/* ── Filter bottom sheet ─────────────────────────────────────────── */

function FilterSheet({
  isOpen, onClose, filters, setFilters, availableCategories, availableAccounts, defaultFrom, defaultTo,
}: {
  isOpen: boolean
  onClose: () => void
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
  availableCategories: string[]
  availableAccounts: { id: string; name: string }[]
  defaultFrom: string
  defaultTo: string
}) {
  const [rangePickerOpen, setRangePickerOpen] = useState(false)

  const toggleCategory = (cat: string) => {
    setFilters(prev => {
      const next = new Set(prev.categories)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return { ...prev, categories: next }
    })
  }
  const togglePaymentMode = (id: string) => {
    setFilters(prev => {
      const next = new Set(prev.paymentModes)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, paymentModes: next }
    })
  }

  const clearAll = () => {
    setFilters(prev => ({
      ...prev,
      type: 'all',
      categories: new Set(),
      paymentModes: new Set(),
      rangeMode: 'all',
      from: defaultFrom,
      to: defaultTo,
    }))
  }

  const typeSegments: { id: TypeSegment; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'expense', label: 'Spending' },
    { id: 'income', label: 'Income' },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="absolute inset-x-0 bottom-0 z-50 max-h-[85%] overflow-y-auto rounded-t-3xl bg-card border-t border-border/60 px-5 pb-8 pt-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] font-bold text-foreground">Filter</h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Date range entry row */}
            <div className="mt-4 flex items-center gap-4">
              <span className="text-[14px] font-semibold text-foreground">Date range</span>
              <button
                onClick={() => setRangePickerOpen(true)}
                className={cn(
                  'rounded-full border px-3 py-1 text-[13px] font-medium transition-colors',
                  filters.rangeMode === 'range'
                    ? 'border-[#6d5efc]/60 bg-[#6d5efc]/15 text-[#a78bfa]'
                    : 'border-border/70 text-muted-foreground hover:text-foreground'
                )}
              >
                {filters.rangeMode === 'range'
                  ? `${formatRangeLabel(filters.from)} — ${formatRangeLabel(filters.to)}`
                  : 'All time'}
              </button>
            </div>

            {/* Category */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-foreground">Category</span>
              </div>

              {/* Type segmented control */}
              <div className="mt-3 flex items-center gap-1 rounded-full bg-secondary p-1">
                {typeSegments.map(seg => (
                  <button
                    key={seg.id}
                    onClick={() => setFilters(prev => ({ ...prev, type: seg.id }))}
                    className={cn(
                      'flex-1 rounded-full py-1.5 text-[13px] font-medium transition-colors',
                      filters.type === seg.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                    )}
                  >
                    {seg.label}
                  </button>
                ))}
              </div>

              {/* Category chips */}
              <div className="mt-3 flex flex-wrap gap-2">
                {availableCategories.length === 0 && (
                  <span className="text-[12px] text-muted-foreground">No categories yet</span>
                )}
                {availableCategories.map(cat => {
                  const active = filters.categories.has(cat)
                  const cfg = getCategoryConfig(cat)
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                        active
                          ? 'border-[#6d5efc]/60 bg-[#6d5efc]/15 text-foreground'
                          : 'border-border/70 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {cfg.emoji} {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Payment mode */}
            <div className="mt-6">
              <span className="text-[14px] font-semibold text-foreground">Payment mode</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {availableAccounts.length === 0 && (
                  <span className="text-[12px] text-muted-foreground">No accounts yet</span>
                )}
                {availableAccounts.map(acc => {
                  const active = filters.paymentModes.has(acc.id)
                  return (
                    <button
                      key={acc.id}
                      onClick={() => togglePaymentMode(acc.id)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                        active
                          ? 'border-[#6d5efc]/60 bg-[#6d5efc]/15 text-foreground'
                          : 'border-border/70 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {acc.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-8 flex items-center gap-3">
              <button
                onClick={clearAll}
                className="flex-1 rounded-full bg-secondary py-3 text-[14px] font-semibold text-foreground hover:bg-accent transition-colors"
              >
                Clear all
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-full bg-gradient-to-br from-[#7c6ffd] to-[#5b3df5] py-3 text-[14px] font-semibold text-white"
              >
                Apply
              </button>
            </div>

            {/* Range picker (nested sheet) */}
            <AnimatePresence>
              {rangePickerOpen && (
                <RangePicker
                  onClose={() => setRangePickerOpen(false)}
                  filters={filters}
                  setFilters={setFilters}
                  defaultFrom={defaultFrom}
                  defaultTo={defaultTo}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ── Range picker ────────────────────────────────────────────────── */

function RangePicker({
  onClose, filters, setFilters, defaultFrom, defaultTo,
}: {
  onClose: () => void
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters>>
  defaultFrom: string
  defaultTo: string
}) {
  // This component only mounts while the picker is open, so initial state is
  // seeded directly from the current filters each time it opens.
  const [mode, setMode] = useState<RangeMode>(filters.rangeMode)
  const [from, setFrom] = useState(filters.from || defaultFrom)
  const [to, setTo] = useState(filters.to || defaultTo)

  const done = () => {
    setFilters(prev => ({
      ...prev,
      rangeMode: mode,
      from: mode === 'range' ? from : defaultFrom,
      to: mode === 'range' ? to : defaultTo,
    }))
    onClose()
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50 md:absolute"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        className="fixed inset-x-0 bottom-0 z-[70] rounded-t-3xl bg-card border-t border-border/60 px-5 pb-8 pt-5 md:absolute"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <h2 className="text-[16px] font-bold text-foreground">Select Range</h2>
          <button
            onClick={done}
            className="rounded-full bg-secondary px-4 py-1.5 text-[13px] font-semibold text-foreground hover:bg-accent transition-colors"
          >
            Done
          </button>
        </div>

        {/* Mode tabs */}
        <div className="mt-4 flex items-center gap-1 rounded-full bg-secondary p-1">
          <button
            onClick={() => setMode('range')}
            className={cn(
              'flex-1 rounded-full py-2 text-[13px] font-medium transition-colors',
              mode === 'range' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            Date Range
          </button>
          <button
            onClick={() => setMode('all')}
            className={cn(
              'flex-1 rounded-full py-2 text-[13px] font-medium transition-colors',
              mode === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            All Time
          </button>
        </div>

        {/* Range inputs */}
        {mode === 'range' ? (
          <div className="mt-5 rounded-2xl border border-border/60 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <label className="text-[14px] text-muted-foreground">From</label>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg bg-secondary border border-border/60 px-3 py-2 text-[14px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="h-px w-full bg-border/50" />
            <div className="flex items-center justify-between gap-3">
              <label className="text-[14px] text-muted-foreground">To</label>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg bg-secondary border border-border/60 px-3 py-2 text-[14px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-border/60 p-4 text-center text-[13px] text-muted-foreground">
            Showing transactions from all time.
          </p>
        )}
      </motion.div>
    </>
  )
}
