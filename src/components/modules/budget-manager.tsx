'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Budget, Transaction, generateUUID } from '@/db/schema'
import { AmountInput } from '@/components/ui/amount-input'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/ui/category-icon'
import { formatCurrency, getCurrencySymbol, cn } from '@/lib/utils'
import {
  Plus, ArrowLeft, HelpCircle, Calendar, ChevronRight, Pencil, Check, X,
  Search, Trash2, PiggyBank,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BudgetManagementService } from '@/services/BudgetManagementService'
import { useToast } from '@/components/ui/toast-notification'
import { useUndo } from '@/components/ui/undo-toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DEFAULT_EXPENSE_CATEGORIES } from '@/lib/category-meta'

type Period = 'monthly' | 'yearly'
type View = 'list' | 'add' | 'analysis'

/** First day of a given month (YYYY-MM-01) */
function monthStart(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`
}
/** First day of the next month — exclusive end used by the budget period */
function monthEnd(year: number, month: number): string {
  const d = new Date(year, month + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function yearStart(year: number): string {
  return `${year}-01-01`
}
function yearEnd(year: number): string {
  return `${year + 1}-01-01`
}

/* ------------------------------------------------------------------ *
 * Semicircle gauge (Remaining / Over by)
 * ------------------------------------------------------------------ */
function BudgetGauge({ remaining, pct }: { remaining: number; pct: number }) {
  const R = 80
  const cx = 100
  const cy = 100
  const circumference = Math.PI * R
  const progress = Math.max(0, Math.min(1, pct / 100))
  const over = remaining < 0
  const arcColor = over ? 'var(--negative, #ef4444)' : 'var(--positive, #22c55e)'

  return (
    <div className="relative w-full flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-full max-w-[280px]">
        {/* Track */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none"
          stroke="var(--secondary, #27272a)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Progress */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none"
          stroke={arcColor}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {over ? 'Over by' : 'Remaining'}
        </p>
        <p className={cn('text-[30px] font-extrabold tracking-tight', over ? 'text-negative' : 'text-foreground')}>
          {formatCurrency(Math.abs(remaining))}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Category multi-select sheet
 * ------------------------------------------------------------------ */
function CategoryPickerBody({
  selected, onClose, onDone,
}: {
  selected: string[]
  onClose: () => void
  onDone: (cats: string[]) => void
}) {
  const [local, setLocal] = useState<string[]>(selected)
  const [query, setQuery] = useState('')

  const all = DEFAULT_EXPENSE_CATEGORIES
  const filtered = useMemo(
    () => all.filter(c => c.toLowerCase().includes(query.toLowerCase())),
    [all, query]
  )
  const allSelected = local.length === all.length

  const toggle = (c: string) =>
    setLocal(prev => (prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]))

  const toggleAll = () => setLocal(allSelected ? [] : [...all])

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-40" onClick={onClose}
      />
      {/* Centering overlay keeps the sheet frame-width on desktop and
          bottom-anchored on mobile (matches the app's Dialog pattern). */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="pointer-events-auto w-full max-w-md bg-card rounded-t-3xl sm:rounded-3xl p-5 max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[18px] font-bold text-foreground">Select Included Categories</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 h-11 px-3 rounded-2xl bg-secondary/70 border border-border/50 mb-3">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] text-muted-foreground">{local.length} categories selected</span>
          <button onClick={toggleAll} className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <span className={cn(
              'w-5 h-5 rounded-md flex items-center justify-center border',
              allSelected ? 'bg-primary border-primary' : 'border-border'
            )}>
              {allSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
            </span>
            Select all
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pb-2">
          {filtered.map(cat => {
            const on = local.includes(cat)
            return (
              <button
                key={cat}
                onClick={() => toggle(cat)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-secondary/40 hover:bg-secondary/70 transition-colors"
              >
                <CategoryIcon name={cat} type="expense" size={38} iconSize={18} />
                <span className="flex-1 text-left text-[14px] font-medium text-foreground">{cat}</span>
                <span className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors',
                  on ? 'bg-primary border-primary' : 'border-border'
                )}>
                  {on && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                </span>
              </button>
            )
          })}
        </div>

        <Button onClick={() => onDone(local)} size="pill" className="w-full mt-3">
          Done
        </Button>
      </motion.div>
      </div>
    </>
  )
}

function CategoryPickerSheet({
  open, selected, onClose, onDone,
}: {
  open: boolean
  selected: string[]
  onClose: () => void
  onDone: (cats: string[]) => void
}) {
  // Keyed remount on each open so the body's local selection initializes
  // fresh from `selected` without a setState-in-effect.
  return (
    <AnimatePresence>
      {open && (
        <CategoryPickerBody selected={selected} onClose={onClose} onDone={onDone} />
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ *
 * Page header (back + title + help)
 * ------------------------------------------------------------------ */
function Header({ title, onBack, onAdd }: { title: string; onBack?: () => void; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between px-1 mb-5">
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
        )}
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {onAdd && (
          <button
            onClick={onAdd}
            className="h-8 pl-2 pr-3 rounded-full bg-primary text-primary-foreground flex items-center gap-1 font-semibold text-[12px]"
            aria-label="Add budget"
            title="Add budget"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Budget
          </button>
        )}
        <button className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center" aria-label="Help">
          <HelpCircle className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}

export function BudgetManager() {
  const { showToast } = useToast()
  const { showUndo } = useUndo()

  const allBudgets = useLiveQuery(() => db.budgets.toArray())
  const allTransactions = useLiveQuery(() => db.transactions.toArray())
  const safeBudgets = useMemo(() => (Array.isArray(allBudgets) ? allBudgets : []), [allBudgets])
  const safeTransactions = useMemo(() => (Array.isArray(allTransactions) ? allTransactions : []), [allTransactions])

  const [period, setPeriod] = useState<Period>('monthly')
  const [view, setView] = useState<View>('list')
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: string; name?: string }>({ open: false })

  // Budgets for the active tab (monthly or yearly)
  const periodBudgets = useMemo(
    () => safeBudgets.filter(b => b.period === period && b.isActive),
    [safeBudgets, period]
  )

  const active = useMemo(
    () => periodBudgets.filter(b => BudgetManagementService.getTiming(b) === 'active'),
    [periodBudgets]
  )
  const upcoming = useMemo(
    () => periodBudgets
      .filter(b => BudgetManagementService.getTiming(b) === 'upcoming')
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [periodBudgets]
  )

  const selectedBudget = safeBudgets.find(b => b.id === selectedBudgetId) || null

  const handleDelete = (id: string) => {
    const b = safeBudgets.find(x => x.id === id)
    setDeleteConfirm({ open: true, id, name: b?.name || 'this budget' })
  }
  const confirmDelete = async () => {
    const id = deleteConfirm.id
    if (!id) return
    const b = safeBudgets.find(x => x.id === id)
    await db.budgets.delete(id)
    if (b) showUndo(`"${b.name}" deleted`, async () => { await db.budgets.add(b) })
    setDeleteConfirm({ open: false })
    if (view === 'analysis') setView('list')
  }

  /* ========================= ANALYSIS VIEW ========================= */
  if (view === 'analysis' && selectedBudget) {
    return (
      <BudgetAnalysis
        budget={selectedBudget}
        transactions={safeTransactions}
        onBack={() => { setView('list'); setSelectedBudgetId(null) }}
        onEdit={() => setView('add')}
        onDelete={() => handleDelete(selectedBudget.id)}
        deleteConfirm={deleteConfirm}
        confirmDelete={confirmDelete}
        cancelDelete={() => setDeleteConfirm({ open: false })}
      />
    )
  }

  /* ============================ ADD VIEW ============================ */
  if (view === 'add') {
    return (
      <AddBudgetFlow
        period={period}
        existing={selectedBudget}
        onCancel={() => { setView('list'); setSelectedBudgetId(null) }}
        onSaved={(id) => {
          setSelectedBudgetId(id)
          setView('analysis')
          showToast('Budget saved')
        }}
      />
    )
  }

  /* ============================ LIST VIEW =========================== */
  return (
    <div className="flex flex-col pb-24 relative min-h-[70vh]">
      <Header title="Budgets" onAdd={() => { setSelectedBudgetId(null); setView('add') }} />

      {/* Monthly / Yearly tabs */}
      <div className="grid grid-cols-2 gap-1 p-1.5 rounded-full bg-secondary/70 mb-6">
        {(['monthly', 'yearly'] as Period[]).map(p => {
          const on = period === p
          return (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn('relative h-10 rounded-full text-[14px] font-bold capitalize transition-colors',
                on ? 'text-foreground' : 'text-muted-foreground')}
            >
              {on && (
                <motion.span layoutId="budget-period-pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-full bg-background shadow-sm" />
              )}
              <span className="relative z-10">{p === 'monthly' ? 'Monthly' : 'Yearly'}</span>
            </button>
          )
        })}
      </div>

      {periodBudgets.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center text-center px-6 pt-10 flex-1">
          <div className="w-28 h-28 rounded-full bg-amber-500/10 flex items-center justify-center mb-8">
            <PiggyBank className="w-14 h-14 text-amber-500" />
          </div>
          <h2 className="text-[24px] font-bold text-foreground leading-tight mb-3">
            Set Up Your First<br />{period === 'monthly' ? 'Monthly' : 'Yearly'} Budget
          </h2>
          <p className="text-[14px] text-muted-foreground leading-relaxed max-w-xs">
            Budgeting is one of the most important steps you can take to manage your finances effectively.
          </p>
          <Button onClick={() => { setSelectedBudgetId(null); setView('add') }} size="lg" className="w-full mt-10">
            Set Up Budget
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active */}
          {active.length > 0 && (
            <section>
              <p className="text-[13px] font-semibold text-muted-foreground mb-3 px-1">Active</p>
              <div className="space-y-4">
                {active.map(b => (
                  <ActiveBudgetCard
                    key={b.id}
                    budget={b}
                    transactions={safeTransactions}
                    onClick={() => { setSelectedBudgetId(b.id); setView('analysis') }}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <section>
              <p className="text-[13px] font-semibold text-muted-foreground mb-3 px-1">Upcoming</p>
              <div className="space-y-3">
                {upcoming.map(b => (
                  <UpcomingBudgetCard
                    key={b.id}
                    budget={b}
                    transactions={safeTransactions}
                    onClick={() => { setSelectedBudgetId(b.id); setView('analysis') }}
                  />
                ))}
              </div>
            </section>
          )}

        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Delete Budget?"
        message={`Are you sure you want to delete "${deleteConfirm.name}"? You can undo this action.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false })}
      />
    </div>
  )
}

/* ================================================================== *
 * Active budget card — gauge + spent/limit + safe-to-spend
 * ================================================================== */
function ActiveBudgetCard({
  budget, transactions, onClick,
}: { budget: Budget; transactions: Transaction[]; onClick: () => void }) {
  const status = BudgetManagementService.getAggregateStatus(budget, transactions)
  const safePerDay = BudgetManagementService.getSafeToSpend(budget, transactions)
  const label = BudgetManagementService.getPeriodLabel(budget)
  const { end } = BudgetManagementService.getCurrentPeriod(budget)
  const endLabel = new Date(end + 'T00:00:00').toLocaleDateString('en-US', { month: 'long' })

  return (
    <button onClick={onClick} className="w-full text-left card-surface p-5 rounded-[1.5rem]">
      <div className="mb-2">
        <h3 className="text-[20px] font-bold text-foreground leading-tight">{budget.name}</h3>
        <p className="text-[13px] text-muted-foreground">{label}</p>
      </div>
      <BudgetGauge remaining={budget.limit - status.spent} pct={status.percentUsed} />
      <div className="flex items-end justify-between mt-3">
        <div>
          <p className="text-[12px] text-muted-foreground">Spent</p>
          <p className="text-[16px] font-extrabold text-foreground">{formatCurrency(status.spent)}</p>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-muted-foreground flex items-center gap-1 justify-end">
            Limit <Pencil className="w-3 h-3" />
          </p>
          <p className="text-[16px] font-extrabold text-foreground">{formatCurrency(budget.limit)}</p>
        </div>
      </div>
      {safePerDay > 0 && budget.period === 'monthly' && (
        <div className="mt-4 pt-4 border-t border-border/60 text-center">
          <p className="text-[12px] text-muted-foreground">
            Safe to spend: <span className="font-bold text-positive">{formatCurrency(safePerDay)}/day</span> for rest of {endLabel}.
          </p>
        </div>
      )}
    </button>
  )
}

/* ================================================================== *
 * Upcoming budget card — compact progress row
 * ================================================================== */
function UpcomingBudgetCard({
  budget, transactions, onClick,
}: { budget: Budget; transactions: Transaction[]; onClick: () => void }) {
  const status = BudgetManagementService.getAggregateStatus(budget, transactions)
  const label = BudgetManagementService.getPeriodLabel(budget)

  return (
    <button onClick={onClick} className="w-full text-left card-surface p-5 rounded-[1.5rem]">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[18px] font-bold text-foreground leading-tight">{budget.name}</h3>
          <p className="text-[12px] text-muted-foreground">{label}</p>
          <p className="text-[13px] text-muted-foreground mt-0.5">Budget: {formatCurrency(budget.limit)}</p>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-extrabold text-foreground">{formatCurrency(budget.limit - status.spent)}</p>
          <p className="text-[12px] text-muted-foreground">Available</p>
        </div>
      </div>
      <div className="flex items-center justify-end mb-1.5">
        <span className="text-[12px] font-semibold text-positive">{Math.round(status.percentUsed)}%</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, status.percentUsed)}%` }} />
      </div>
    </button>
  )
}

/* ================================================================== *
 * Budget Analysis — per-category fill bars
 * ================================================================== */
function BudgetAnalysis({
  budget, transactions, onBack, onEdit, onDelete, deleteConfirm, confirmDelete, cancelDelete,
}: {
  budget: Budget
  transactions: Transaction[]
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  deleteConfirm: { open: boolean; name?: string }
  confirmDelete: () => void
  cancelDelete: () => void
}) {
  const status = BudgetManagementService.getAggregateStatus(budget, transactions)
  const breakdown = BudgetManagementService.getCategoryBreakdown(budget, transactions)
  const label = BudgetManagementService.getPeriodLabel(budget)

  return (
    <div className="flex flex-col pb-24 relative">
      <Header title="Budget Analysis" onBack={onBack} />

      {/* Summary gauge card */}
      <div className="card-surface p-5 rounded-[1.5rem] mb-5">
        <div className="mb-2">
          <h3 className="text-[20px] font-bold text-foreground leading-tight">{budget.name}</h3>
          <p className="text-[13px] text-muted-foreground">{label}</p>
        </div>
        <BudgetGauge remaining={budget.limit - status.spent} pct={status.percentUsed} />
        <div className="flex items-end justify-between mt-3">
          <div>
            <p className="text-[12px] text-muted-foreground">Spent</p>
            <p className="text-[16px] font-extrabold text-foreground">{formatCurrency(status.spent)}</p>
          </div>
          <div className="text-right">
            <p className="text-[12px] text-muted-foreground">Limit</p>
            <p className="text-[16px] font-extrabold text-foreground">{formatCurrency(budget.limit)}</p>
          </div>
        </div>
      </div>

      {/* Budgeted categories */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-[18px] font-bold text-foreground">Budgeted categories</h3>
        <span className="text-[13px] text-muted-foreground">
          {breakdown.length} {breakdown.length === 1 ? 'category' : 'categories'}
        </span>
      </div>

      <div className="space-y-3">
        {breakdown.map(row => {
          const hasLimit = row.limit > 0
          const pct = hasLimit ? Math.min(100, row.percentUsed) : 0
          const barColor = row.status === 'exceeded' ? 'bg-red-500'
            : row.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
          return (
            <div key={row.category} className="card-surface p-4 rounded-[1.25rem]">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <CategoryIcon name={row.category} type="expense" size={40} iconSize={20} />
                  <div>
                    <p className="text-[15px] font-bold text-foreground">{row.category}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {hasLimit ? `Budget: ${formatCurrency(row.limit)}` : 'No limit set'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-extrabold text-foreground">{formatCurrency(row.spent)}</p>
                  <p className="text-[11px] text-muted-foreground">Spent</p>
                </div>
              </div>

              {hasLimit && (
                <>
                  <div className="flex items-center justify-end mb-1.5">
                    <span className={cn('text-[12px] font-semibold',
                      row.status === 'exceeded' ? 'text-red-500' : row.status === 'warning' ? 'text-amber-500' : 'text-positive')}>
                      {Math.round(row.percentUsed)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <motion.div className={cn('h-full rounded-full', barColor)}
                      initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
                  </div>
                  <p className={cn('text-[12px] mt-2 flex items-center gap-1',
                    row.remaining >= 0 ? 'text-positive' : 'text-red-500')}>
                    {row.remaining >= 0 ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    {row.remaining >= 0
                      ? `You are ${formatCurrency(row.remaining)} under your limit.`
                      : `You are ${formatCurrency(Math.abs(row.remaining))} over your limit.`}
                  </p>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Edit + delete FABs — sticky so they stay inside the phone frame. */}
      <div className="sticky bottom-4 z-20 flex flex-col items-end gap-3 pointer-events-none">
        <button onClick={onDelete}
          className="pointer-events-auto h-12 w-12 rounded-full bg-secondary text-foreground shadow-card flex items-center justify-center"
          aria-label="Delete budget">
          <Trash2 className="w-5 h-5 text-red-500" />
        </button>
        <button onClick={onEdit}
          className="pointer-events-auto h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-fab flex items-center justify-center"
          aria-label="Edit budget">
          <Pencil className="w-6 h-6" />
        </button>
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Delete Budget?"
        message={`Are you sure you want to delete "${deleteConfirm.name}"? You can undo this action.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  )
}

/* ================================================================== *
 * Add / Edit budget flow — two steps
 *  Step 1: period + total limit + category selection
 *  Step 2: divide the budget into category-wise limits (optional)
 * ================================================================== */
function AddBudgetFlow({
  period: initialPeriod, existing, onCancel, onSaved,
}: {
  period: Period
  existing: Budget | null
  onCancel: () => void
  onSaved: (id: string) => void
}) {
  const { showToast } = useToast()
  const now = new Date()

  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState<string>(existing?.name ?? '')
  const [period, setPeriod] = useState<Period>(existing?.period === 'yearly' ? 'yearly' : initialPeriod)
  const [year, setYear] = useState(() => existing ? new Date(existing.startDate + 'T00:00:00').getFullYear() : now.getFullYear())
  const [month, setMonth] = useState(() => existing ? new Date(existing.startDate + 'T00:00:00').getMonth() : now.getMonth())
  const [limit, setLimit] = useState<string>(existing ? String(existing.limit) : '')
  const [categories, setCategories] = useState<string[]>(
    existing?.categories && existing.categories.length > 0
      ? existing.categories
      : [...DEFAULT_EXPENSE_CATEGORIES]
  )
  const [catLimits, setCatLimits] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    if (existing?.categoryLimits) {
      for (const [k, v] of Object.entries(existing.categoryLimits)) init[k] = String(v)
    }
    return init
  })
  const [pickerOpen, setPickerOpen] = useState(false)

  const totalLimit = parseFloat(limit) || 0
  const assigned = categories.reduce((sum, c) => sum + (parseFloat(catLimits[c]) || 0), 0)
  const remaining = totalLimit - assigned

  const periodLabel = period === 'monthly'
    ? new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : String(year)

  const handleNext = () => {
    if (!name.trim()) { showToast('Give this budget a name'); return }
    if (totalLimit <= 0) { showToast('Enter a total budget limit'); return }
    if (categories.length === 0) { showToast('Select at least one category'); return }
    setStep(2)
  }

  const handleSave = async () => {
    if (remaining < 0) { showToast('Category limits exceed the total budget'); return }

    const start = period === 'monthly' ? monthStart(year, month) : yearStart(year)
    const end = period === 'monthly' ? monthEnd(year, month) : yearEnd(year)

    // Build the category-limits map (only categories with an explicit amount)
    const limitsMap: Record<string, number> = {}
    categories.forEach(c => {
      const v = parseFloat(catLimits[c]) || 0
      if (v > 0) limitsMap[c] = v
    })

    const payload = {
      name: name.trim() || `${periodLabel} Budget`,
      category: categories[0] || '',
      categories,
      categoryLimits: limitsMap,
      limit: totalLimit,
      period,
      alertThreshold: 80,
    }

    try {
      if (existing) {
        await db.budgets.update(existing.id, { ...payload, startDate: start, endDate: end })
        onSaved(existing.id)
      } else {
        const id = generateUUID()
        await db.budgets.add({
          id,
          ...payload,
          spent: 0,
          startDate: start,
          endDate: end,
          isActive: true,
        })
        onSaved(id)
      }
    } catch (err) {
      console.error('Error saving budget:', err)
      showToast('Could not save budget')
    }
  }

  /* ---------- STEP 2: divide budget ---------- */
  if (step === 2) {
    return (
      <div className="flex flex-col pb-28">
        <Header title="Add budget" onBack={() => setStep(1)} />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-bold text-foreground">Set category-wise limits <span className="text-muted-foreground font-normal">(optional)</span></h2>
            <p className="text-[13px] text-muted-foreground mt-1">Set limits on categories within your budget, if you want.</p>
          </div>
          <button onClick={handleSave} className="flex-shrink-0 text-[13px] font-semibold text-primary mt-0.5">
            Skip
          </button>
        </div>

        {/* Total / remaining banner */}
        <div className="card-surface p-4 rounded-2xl mt-4 flex items-center justify-between">
          <div>
            <p className="text-[12px] text-muted-foreground">Total Budget</p>
            <p className="text-[18px] font-extrabold text-foreground">{formatCurrency(totalLimit)}</p>
          </div>
          <div className="text-right">
            <p className="text-[12px] text-muted-foreground">Remaining</p>
            <p className={cn('text-[18px] font-extrabold', remaining < 0 ? 'text-red-500' : 'text-foreground')}>
              {formatCurrency(remaining)}
            </p>
          </div>
        </div>

        <p className="text-[13px] text-muted-foreground mt-4 mb-3">{categories.length} categories included</p>

        <div className="space-y-3">
          {categories.map(cat => (
            <div key={cat} className="card-surface p-3 rounded-2xl flex items-center gap-3">
              <CategoryIcon name={cat} type="expense" size={40} iconSize={20} />
              <span className="flex-1 text-[15px] font-semibold text-foreground">{cat}</span>
              <div className="w-32">
                <AmountInput
                  placeholder="No Limit"
                  value={catLimits[cat] || ''}
                  onChange={(v) => setCatLimits(prev => ({ ...prev, [cat]: v }))}
                  prefixSymbol={getCurrencySymbol()}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="pt-6">
          <Button onClick={handleSave} size="lg" className="w-full" disabled={remaining < 0}>
            {existing ? 'Save Changes' : 'Save Budget'}
          </Button>
        </div>
      </div>
    )
  }

  /* ---------- STEP 1: period + limit + categories ---------- */
  return (
    <div className="flex flex-col pb-28">
      <Header title="Add budget" onBack={onCancel} />

      {/* Monthly / Yearly tabs */}
      <div className="grid grid-cols-2 gap-1 p-1.5 rounded-full bg-secondary/70 mb-6">
        {(['monthly', 'yearly'] as Period[]).map(p => {
          const on = period === p
          return (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn('relative h-10 rounded-full text-[14px] font-bold capitalize transition-colors',
                on ? 'text-foreground' : 'text-muted-foreground')}>
              {on && <motion.span layoutId="add-period-pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full bg-background shadow-sm" />}
              <span className="relative z-10">{p === 'monthly' ? 'Monthly' : 'Yearly'}</span>
            </button>
          )
        })}
      </div>

      {/* Budget name */}
      <div className="card-surface p-5 rounded-2xl mb-4">
        <p className="text-[16px] font-bold text-foreground mb-3">Budget name</p>
        <Input
          placeholder="e.g. Household, Personal, Groceries"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={40}
        />
      </div>

      {/* Budget for (period selector) */}
      <div className="card-surface p-5 rounded-2xl mb-4">
        <p className="text-[16px] font-bold text-foreground mb-3">Budget for</p>
        {period === 'monthly' ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 h-12 px-4 rounded-2xl bg-secondary border border-border/60">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="flex-1 bg-transparent text-[14px] font-medium text-foreground outline-none"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i} value={i}>
                    {new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' })}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="bg-transparent text-[14px] font-medium text-foreground outline-none"
              >
                {Array.from({ length: 5 }).map((_, i) => {
                  const y = now.getFullYear() + i
                  return <option key={y} value={y}>{y}</option>
                })}
              </select>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 h-12 px-4 rounded-2xl bg-secondary border border-border/60">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="flex-1 bg-transparent text-[14px] font-medium text-foreground outline-none"
            >
              {Array.from({ length: 5 }).map((_, i) => {
                const y = now.getFullYear() + i
                return <option key={y} value={y}>{y}</option>
              })}
            </select>
          </div>
        )}
      </div>

      {/* Total limit */}
      <div className="card-surface p-5 rounded-2xl mb-4">
        <p className="text-[16px] font-bold text-foreground mb-3">What&apos;s your total budget limit?</p>
        <AmountInput
          placeholder="Enter your total budget limit"
          value={limit}
          onChange={setLimit}
          prefixSymbol={getCurrencySymbol()}
        />
      </div>

      {/* Included categories */}
      <button onClick={() => setPickerOpen(true)} className="w-full text-left card-surface p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[16px] font-bold text-foreground">Included Categories</p>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-[13px] text-muted-foreground mb-4">
          {categories.length === DEFAULT_EXPENSE_CATEGORIES.length
            ? 'All categories included in your budget'
            : `${categories.length} categories included`}
        </p>
        <div className="flex gap-4 overflow-x-auto pb-1">
          {categories.slice(0, 6).map(cat => (
            <div key={cat} className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16">
              <CategoryIcon name={cat} type="expense" size={46} iconSize={22} />
              <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2">{cat}</span>
            </div>
          ))}
        </div>
      </button>

      <div className="pt-6">
        <Button onClick={handleNext} size="lg" className="w-full">Next</Button>
      </div>

      <CategoryPickerSheet
        open={pickerOpen}
        selected={categories}
        onClose={() => setPickerOpen(false)}
        onDone={(cats) => {
          setCategories(cats)
          // Drop limits for removed categories
          setCatLimits(prev => {
            const next: Record<string, string> = {}
            cats.forEach(c => { if (prev[c]) next[c] = prev[c] })
            return next
          })
          setPickerOpen(false)
        }}
      />
    </div>
  )
}
