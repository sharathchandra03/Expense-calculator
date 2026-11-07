'use client'

import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X, ArrowDownLeft, ArrowUpRight, CheckCircle2, Trash2, Plus, Receipt, Wallet,
  StickyNote, Info, ChevronDown, Sparkles,
} from 'lucide-react'
import { db, type Lending, type LendingEntry, type LendingEntryKind } from '@/db/schema'
import { cn } from '@/lib/utils'
import { Amount } from '@/components/ui/amount'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast-notification'
import { LendingService } from '@/services/LendingService'

/** Plain-language title for each history entry. */
function entryTitle(kind: LendingEntryKind, type: Lending['type']): string {
  switch (kind) {
    case 'initial': return type === 'lent' ? 'Money lent' : 'Money borrowed'
    case 'increase': return type === 'lent' ? 'Lent more' : 'Borrowed more'
    case 'decrease': return 'Amount reduced'
    case 'repayment': return type === 'lent' ? 'Payment received' : 'Payment made'
    case 'settlement': return 'Settled in full'
  }
}

function monthLabel(ymd: string): string {
  const d = new Date((ymd || '') + 'T00:00:00')
  return isNaN(d.getTime()) ? 'Earlier' : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatWhen(entry: LendingEntry): string {
  const d = new Date((entry.date || '') + 'T00:00:00')
  const day = isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  const time = entry.time
    ? new Date(`2000-01-01T${entry.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : ''
  return [day, time].filter(Boolean).join(' · ')
}

/**
 * Per-borrower history: a summary of what was lent and repaid, plus a timeline
 * of every payment and change. Rows expand to show the account used and the
 * ledger transaction each payment created, and can be removed (which reverses
 * the transaction and restores the balance).
 */
export function LendingHistorySheet({
  recordId,
  justRecorded = false,
  onClose,
  onRecordPayment,
}: {
  recordId: string
  /** Show a confirmation banner and open the newest entry (used right after saving a payment). */
  justRecorded?: boolean
  onClose: () => void
  onRecordPayment: (recordId: string) => void
}) {
  const { showToast } = useToast()
  const record = useLiveQuery(() => db.lending.get(recordId), [recordId])
  const accounts = useLiveQuery(() => db.accounts.toArray())
  const accountName = useMemo(
    () => new Map((Array.isArray(accounts) ? accounts : []).map(a => [a.id, a.name])),
    [accounts],
  )

  // undefined = untouched (may auto-open the newest entry); null = all collapsed
  const [expandedState, setExpandedState] = useState<string | null | undefined>(undefined)
  const [removeTarget, setRemoveTarget] = useState<LendingEntry | null>(null)

  // Newest first for display
  const entries = useMemo(() => (record ? [...LendingService.timeline(record)].reverse() : []), [record])
  const summary = useMemo(() => (record ? LendingService.summarize(record) : null), [record])

  // Right after saving a payment, the newest entry starts expanded until the user taps something.
  const expandedId = expandedState === undefined ? (justRecorded ? entries[0]?.id ?? null : null) : expandedState
  const setExpandedId = (id: string | null) => setExpandedState(id)

  const groups = useMemo(() => {
    const out: { label: string; items: LendingEntry[] }[] = []
    entries.forEach(e => {
      const label = monthLabel(e.date)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(e)
      else out.push({ label, items: [e] })
    })
    return out
  }, [entries])

  const handleRemove = async () => {
    if (!removeTarget) return
    const target = removeTarget
    setRemoveTarget(null)
    try {
      await db.transaction('rw', LendingService.TABLES, async () => {
        await LendingService.removeEntry(recordId, target.id)
      })
      setExpandedId(null)
      showToast(target.transactionId ? 'Entry removed and the transaction was reversed' : 'Entry removed')
    } catch {
      showToast('Could not remove this entry')
    }
  }

  const isLent = record?.type === 'lent'
  const isActive = record?.status === 'active'
  const hasRepayments = entries.some(e => e.kind === 'repayment' || e.kind === 'settlement')

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9000] bg-black/60"
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-0 z-[9001] flex items-end justify-center sm:items-center sm:p-4">
        <motion.div
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          className="pointer-events-auto flex h-[92vh] w-full flex-col rounded-t-3xl bg-card sm:h-[85vh] sm:max-w-md sm:rounded-3xl"
          role="dialog"
          aria-modal="true"
          aria-label="Payment history"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pb-3 pt-5">
            <div className={cn(
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[15px] font-bold',
              isLent ? 'bg-pink-500/15 text-pink-500' : 'bg-blue-500/15 text-blue-500',
            )}>
              {(record?.contactName || '?').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[17px] font-bold leading-tight text-foreground">{record?.contactName ?? 'History'}</h3>
              <p className="text-[12px] text-muted-foreground">
                {isLent ? 'You lent' : 'You borrowed'} · Payment history
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-4">
            {!record || !summary ? (
              <p className="py-16 text-center text-[13px] text-muted-foreground">Loading…</p>
            ) : (
              <>
                {/* Saved confirmation: says where the payment went */}
                <AnimatePresence>
                  {justRecorded && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                      className="mb-4 flex items-start gap-2.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3"
                    >
                      <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                      <p className="text-[12.5px] leading-snug text-emerald-700 dark:text-emerald-300">
                        Payment saved. It now appears in this history, in <b>Transactions</b> under &quot;{isLent ? 'Lending' : 'Borrowing'}&quot;,
                        and your account balance and <b>{isLent ? 'amount still owed' : 'amount you owe'}</b> are updated.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Summary */}
                <div className="rounded-3xl border border-border/60 bg-secondary/40 p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        {isActive ? (isLent ? 'Still owes you' : 'You still owe') : 'Settled'}
                      </p>
                      <Amount value={summary.outstanding} size="hero" className={cn('mt-0.5 block', isActive ? 'text-foreground' : 'text-emerald-500')} />
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[22px] font-extrabold leading-none tabular-nums text-foreground">{Math.round(summary.progress)}%</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">repaid</p>
                    </div>
                  </div>

                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={Math.round(summary.progress)} aria-valuemin={0} aria-valuemax={100}>
                    <motion.div
                      className="h-full rounded-full bg-emerald-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${summary.progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="min-w-0 rounded-2xl bg-card px-3 py-2.5">
                      <p className="text-[11px] text-muted-foreground">{isLent ? 'Total lent' : 'Total borrowed'}</p>
                      <Amount value={summary.total} size="md" className="mt-0.5 block text-foreground" />
                    </div>
                    <div className="min-w-0 rounded-2xl bg-card px-3 py-2.5">
                      <p className="text-[11px] text-muted-foreground">{isLent ? 'Received so far' : 'Paid so far'}</p>
                      <Amount value={summary.repaid} size="md" className="mt-0.5 block text-emerald-500" />
                    </div>
                  </div>
                  {summary.lastRepayment && (
                    <p className="mt-3 text-[12px] text-muted-foreground">
                      Last payment: <span className="font-semibold text-foreground">{formatWhen(summary.lastRepayment)}</span>
                    </p>
                  )}
                </div>

                {/* No payments yet */}
                {!hasRepayments && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-dashed border-border bg-secondary/20 px-3.5 py-3">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <p className="text-[12.5px] leading-snug text-muted-foreground">
                      No payments yet. When {record.contactName} {isLent ? 'pays you back' : 'is paid'}, record it and it will show up here.
                    </p>
                  </div>
                )}

                {/* Timeline */}
                <div className="mt-6">
                  {groups.map(group => (
                    <section key={group.label} className="mb-5 last:mb-0">
                      <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">{group.label}</h4>
                      <ul>
                        {group.items.map((e, idx) => {
                          const moneyIn = LendingService.entryTxnType(record.type, e.kind) === 'income'
                          const open = expandedId === e.id
                          const isLastInGroup = idx === group.items.length - 1
                          const Icon = e.kind === 'settlement' ? CheckCircle2 : moneyIn ? ArrowDownLeft : ArrowUpRight
                          const removable = e.kind !== 'initial'
                          return (
                            <li key={e.id} className="relative">
                              {!isLastInGroup && <span className="absolute left-[19px] top-11 -bottom-1 w-px bg-border/60" aria-hidden />}
                              <button
                                type="button"
                                onClick={() => setExpandedId(open ? null : e.id)}
                                aria-expanded={open}
                                className="flex w-full items-center gap-3 rounded-2xl py-2 text-left"
                              >
                                <span className={cn(
                                  'relative z-[1] flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
                                  e.kind === 'settlement'
                                    ? 'bg-emerald-500/15 text-emerald-500'
                                    : moneyIn ? 'bg-emerald-500/12 text-emerald-500' : 'bg-rose-500/12 text-rose-500',
                                )}>
                                  <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[14px] font-semibold text-foreground">{entryTitle(e.kind, record.type)}</span>
                                  <span className="block truncate text-[12px] text-muted-foreground">{formatWhen(e) || 'Date unknown'}</span>
                                </span>
                                <span className="flex flex-shrink-0 flex-col items-end">
                                  <span className="flex items-center gap-1">
                                    <Amount
                                      value={e.amount}
                                      size="md"
                                      className={moneyIn ? 'text-emerald-500' : 'text-foreground'}
                                    />
                                    <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
                                  </span>
                                  <span className="text-[11px] tabular-nums text-muted-foreground">
                                    {moneyIn ? 'In' : 'Out'} · Left <Amount value={e.balanceAfter} size="sm" className="font-semibold text-muted-foreground" />
                                  </span>
                                </span>
                              </button>

                              <AnimatePresence initial={false}>
                                {open && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mb-2 ml-[52px] space-y-2 rounded-2xl bg-secondary/50 p-3 text-[12.5px]">
                                      <div className="flex items-center gap-2 text-muted-foreground">
                                        <Wallet className="h-3.5 w-3.5 flex-shrink-0" />
                                        <span>
                                          {e.accountId
                                            ? <>Account: <span className="font-semibold text-foreground">{accountName.get(e.accountId) ?? 'Deleted account'}</span></>
                                            : 'No account linked'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-muted-foreground">
                                        <Receipt className="h-3.5 w-3.5 flex-shrink-0" />
                                        <span>
                                          {e.transactionId
                                            ? <>In Transactions as <span className="font-semibold text-foreground">{moneyIn ? 'income' : 'expense'}</span> · {isLent ? 'Lending' : 'Borrowing'}</>
                                            : 'Not recorded in Transactions'}
                                        </span>
                                      </div>
                                      {e.note && (
                                        <div className="flex items-start gap-2 text-muted-foreground">
                                          <StickyNote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                                          <span className="text-foreground">{e.note}</span>
                                        </div>
                                      )}
                                      {e.id === 'derived-initial' && (
                                        <p className="text-muted-foreground">Created before payment history was tracked.</p>
                                      )}
                                      {removable && (
                                        <button
                                          type="button"
                                          onClick={() => setRemoveTarget(e)}
                                          className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1.5 text-[12px] font-semibold text-destructive hover:bg-destructive/15"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" /> Remove this entry
                                        </button>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {record && (
            <div className="border-t border-border/40 px-5 pb-6 pt-3">
              {isActive ? (
                <button
                  type="button"
                  onClick={() => onRecordPayment(recordId)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground transition active:scale-[0.99]"
                >
                  <Plus className="h-4 w-4" />
                  {isLent ? 'Record a payment received' : 'Record a payment made'}
                </button>
              ) : (
                <p className="flex items-center justify-center gap-2 text-[13px] font-semibold text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" /> This record is settled
                </p>
              )}
            </div>
          )}
        </motion.div>
      </div>

      <ConfirmDialog
        isOpen={!!removeTarget}
        title="Remove this entry?"
        message={
          removeTarget?.transactionId
            ? 'The matching transaction will be reversed, your account balance restored, and the amount owed adjusted.'
            : 'The amount owed will be adjusted. No transaction was recorded for this entry.'
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  )
}
