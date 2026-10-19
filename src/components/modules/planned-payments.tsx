'use client'

/* ------------------------------------------------------------------ *
 * Planned Payments — future cash flow
 * ------------------------------------------------------------------ *
 * Lists planned receivables (income) and expenditures (expense) with a
 * projected net cash-flow summary. Add / edit via the shared PlannedPaymentForm
 * (same UI/UX as Add transaction), complete a plan (creates a real transaction
 * and moves money), or delete it.
 * ------------------------------------------------------------------ */

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { PlannedPayment } from '@/db/schema'
import { PlannedPaymentService } from '@/services/PlannedPaymentService'
import { PlannedPaymentForm, type PlannedPaymentDraft } from '@/components/modules/planned-payment-form'
import { CategoryIcon } from '@/components/ui/category-icon'
import { formatCurrency, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, CalendarClock, Check, Pencil, Trash2, Repeat, ArrowDownRight,
  ArrowUpRight, CalendarCheck, Zap,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast-notification'

interface PlannedPaymentsProps {
  onNavigateToTab?: (tab: string) => void
}

type FilterKind = 'upcoming' | 'all' | 'income' | 'expense'

const FILTERS: { key: FilterKind; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expense' },
  { key: 'all', label: 'All' },
]

const formatPlanDate = (d: string) => {
  const date = new Date(d + 'T00:00:00')
  if (isNaN(date.getTime())) return d
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000)
  const label = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  if (diffDays === 0) return `Today · ${label}`
  if (diffDays === 1) return `Tomorrow · ${label}`
  if (diffDays > 1 && diffDays <= 30) return `In ${diffDays} days · ${label}`
  if (diffDays < 0) return `Overdue · ${label}`
  return label
}

export function PlannedPayments({ onNavigateToTab }: PlannedPaymentsProps) {
  const { showToast } = useToast()
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<PlannedPayment | null>(null)
  const [filter, setFilter] = useState<FilterKind>('upcoming')
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: string; label?: string }>({ open: false })

  const allPlans = useLiveQuery(() => db.plannedPayments.toArray()) ?? []
  const safePlans = Array.isArray(allPlans) ? allPlans : []

  const active = safePlans.filter(p => p.status === 'planned')

  // Projected cash flow over the active (planned) items.
  const projected = React.useMemo(() => {
    const income = active.filter(p => p.type === 'income').reduce((s, p) => s + p.amount, 0)
    const expense = active.filter(p => p.type === 'expense').reduce((s, p) => s + p.amount, 0)
    return { income, expense, net: income - expense }
  }, [active])

  const visible = React.useMemo(() => {
    let list = safePlans
    if (filter === 'upcoming') list = active
    else if (filter === 'income') list = safePlans.filter(p => p.type === 'income' && p.status === 'planned')
    else if (filter === 'expense') list = safePlans.filter(p => p.type === 'expense' && p.status === 'planned')
    // 'all' keeps everything incl. completed/cancelled
    return [...list].sort((a, b) => {
      // Planned first, then by date ascending
      if (a.status !== b.status) return a.status === 'planned' ? -1 : 1
      return a.date.localeCompare(b.date)
    })
  }, [safePlans, active, filter])

  const openCreate = () => { setEditing(null); setView('form') }
  const openEdit = (p: PlannedPayment) => { setEditing(p); setView('form') }

  const handleSave = async (draft: PlannedPaymentDraft) => {
    try {
      if (editing) {
        await PlannedPaymentService.update(editing.id, draft)
        showToast('Planned payment updated')
      } else {
        await PlannedPaymentService.create(draft)
        showToast('Planned payment added')
      }
      setView('list')
      setEditing(null)
    } catch (err) {
      console.error('Error saving planned payment:', err)
      showToast('Could not save planned payment')
    }
  }

  const handleMarkDone = async (p: PlannedPayment) => {
    try {
      await PlannedPaymentService.markDone(p.id)
      showToast(p.frequency === 'recurring' ? 'Logged · rolled to next date' : 'Planned payment completed')
    } catch (err) {
      console.error('Error completing planned payment:', err)
      showToast('Could not complete planned payment')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm.id) return
    try {
      await PlannedPaymentService.remove(deleteConfirm.id)
      showToast('Planned payment deleted')
    } catch (err) {
      console.error('Error deleting planned payment:', err)
    }
    setDeleteConfirm({ open: false })
  }

  if (view === 'form') {
    return (
      <PlannedPaymentForm
        initial={editing ?? undefined}
        onBack={() => { setView('list'); setEditing(null) }}
        onSave={handleSave}
        onNavigateToTab={onNavigateToTab}
      />
    )
  }

  return (
    <div className="flex flex-col space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Planned Payments</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Future cash flow you expect</p>
        </div>
        <button
          onClick={openCreate}
          className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Add planned payment"
        >
          <Plus className="w-5 h-5" strokeWidth={2.4} />
        </button>
      </div>

      {/* Projected cash flow summary */}
      <div className="relative rounded-[1.6rem] bg-card border border-border/70 p-5 shadow-card overflow-hidden">
        <div className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 rounded-full bg-positive/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-negative/10 blur-3xl" />
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Projected net cash flow</p>
        <p className={cn('text-[28px] font-bold tracking-tight mt-1 tabular-nums', projected.net >= 0 ? 'text-positive' : 'text-negative')}>
          {projected.net < 0 ? '-' : '+'}{formatCurrency(Math.abs(projected.net))}
        </p>
        <div className="relative mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-secondary/60 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-positive">Receivable</p>
            <p className="text-[16px] font-extrabold text-foreground mt-0.5 tabular-nums truncate">{formatCurrency(projected.income)}</p>
          </div>
          <div className="rounded-2xl bg-secondary/60 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-negative">Payable</p>
            <p className="text-[16px] font-extrabold text-foreground mt-0.5 tabular-nums truncate">{formatCurrency(projected.expense)}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-4 gap-1 p-1.5 rounded-full bg-secondary/70">
        {FILTERS.map(f => {
          const activeF = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn('relative h-9 rounded-full text-[13px] font-bold transition-colors', activeF ? 'text-foreground' : 'text-muted-foreground')}
            >
              {activeF && (
                <motion.span layoutId="planned-filter-pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} className="absolute inset-0 rounded-full bg-background shadow-sm" />
              )}
              <span className="relative z-10">{f.label}</span>
            </button>
          )
        })}
      </div>

      {/* List */}
      {visible.length > 0 ? (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {visible.map(p => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className={cn(
                  'rounded-[1.4rem] bg-card border border-border/70 p-4 shadow-card',
                  p.status !== 'planned' && 'opacity-60'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0">
                    <CategoryIcon name={p.category} type={p.type} size={44} iconSize={20} />
                    <span className={cn(
                      'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-card',
                      p.type === 'income' ? 'bg-positive text-white' : 'bg-negative text-white'
                    )}>
                      {p.type === 'income' ? <ArrowUpRight className="w-3 h-3" strokeWidth={3} /> : <ArrowDownRight className="w-3 h-3" strokeWidth={3} />}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[15px] font-semibold text-foreground truncate">{p.description || p.category}</p>
                      <p className={cn('text-[15px] font-extrabold flex-shrink-0 tabular-nums', p.type === 'income' ? 'text-positive' : 'text-foreground')}>
                        {p.type === 'income' ? '+' : '-'}{formatCurrency(p.amount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                        {p.frequency === 'recurring'
                          ? <><Repeat className="w-3 h-3" />{p.recurrenceRule}</>
                          : <><CalendarCheck className="w-3 h-3" />One-time</>}
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-[12px] text-muted-foreground">{formatPlanDate(p.date)}</span>
                      {p.status === 'planned' && (p.autoExecute ?? true) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wide">
                          <Zap className="w-2.5 h-2.5" strokeWidth={2.5} />Auto
                        </span>
                      )}
                      {p.status === 'completed' && <span className="text-[11px] font-semibold text-positive">· Completed</span>}
                      {p.status === 'cancelled' && <span className="text-[11px] font-semibold text-muted-foreground">· Cancelled</span>}
                    </div>

                    {/* Labels */}
                    {p.tags && p.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.tags.map(t => (
                          <span key={t} className="px-2 py-0.5 rounded-full bg-secondary text-[11px] font-medium text-muted-foreground">{t}</span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    {p.status === 'planned' && (
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => handleMarkDone(p)}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-positive/15 text-positive text-[12px] font-semibold active:scale-95 transition-transform"
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={3} />
                          {p.frequency === 'recurring' ? 'Log & roll' : 'Mark done'}
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="flex items-center justify-center h-8 w-8 rounded-full bg-secondary text-foreground active:scale-95 transition-transform"
                          aria-label="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ open: true, id: p.id, label: p.description || p.category })}
                          className="flex items-center justify-center h-8 w-8 rounded-full bg-secondary text-destructive active:scale-95 transition-transform"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {p.status !== 'planned' && (
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => setDeleteConfirm({ open: true, id: p.id, label: p.description || p.category })}
                          className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary text-destructive text-[12px] font-semibold active:scale-95 transition-transform"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="rounded-[1.6rem] bg-card border border-border/70 p-8 shadow-card flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-3">
            <CalendarClock className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-[15px] font-semibold text-foreground">No planned payments yet</p>
          <p className="text-[13px] text-muted-foreground mt-1 max-w-[260px]">
            Plan a future receivable or expenditure to see your projected cash flow here.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 flex items-center gap-1.5 h-10 px-4 rounded-full bg-foreground text-background text-[14px] font-semibold active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" strokeWidth={2.4} />
            Add planned payment
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Delete planned payment?"
        message={`This removes "${deleteConfirm.label ?? ''}" from your planned cash flow. This won't affect any transactions already logged.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ open: false })}
      />
    </div>
  )
}
