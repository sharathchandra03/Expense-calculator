'use client'

import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Heart, TrendingUp, Clock, AlertCircle, Check, X,
  ChevronRight, Calendar, Percent, User, Trash2, Edit2, History, Plus, CheckCircle2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AmountInput } from '@/components/ui/amount-input'
import { Select } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { useUndo } from '@/components/ui/undo-toast'
import { useToast } from '@/components/ui/toast-notification'
import { AccountSelect } from '@/components/ui/account-select'
import { LendingService } from '@/services/LendingService'
import { Amount } from '@/components/ui/amount'
import { LendingHistorySheet } from '@/components/modules/lending-history-sheet'
import { SmartDefaultsService } from '@/services/SmartDefaultsService'

/** Pick a sensible default account: last used, else bank, else cash, else the first one. */
function useDefaultAccount() {
  const accounts = useLiveQuery(() => db.accounts.toArray())
  const list = React.useMemo(() => (Array.isArray(accounts) ? accounts : []), [accounts])
  const defaultId = React.useMemo(() => {
    const last = SmartDefaultsService.getLastUsedAccount()
    return (
      (last && list.find(a => a.id === last)?.id) ||
      list.find(a => a.type === 'bank')?.id ||
      list.find(a => a.type === 'cash')?.id ||
      list[0]?.id ||
      ''
    )
  }, [list])
  return { accounts: list, defaultId }
}

/** Checklist of where a recorded payment will appear. */
function WhereItShowsUp({ lines }: { lines: { label: string; value: string }[] }) {
  return (
    <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">When you save, this updates</p>
      <ul className="space-y-1.5">
        {lines.map(l => (
          <li key={l.label} className="flex items-start gap-2 text-[11.5px] leading-snug">
            <CheckCircle2 className="mt-px h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
            <span className="min-w-0">
              <span className="font-semibold text-foreground">{l.label}</span>
              <span className="text-muted-foreground"> · {l.value}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Small info line explaining which transaction will be created. */
function ImpactNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-primary/5 border border-primary/15 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
      {children}
    </p>
  )
}

interface LendingRecord {
  id: string
  contactName: string
  type: 'lent' | 'borrowed'
  amount: number
  interestRate: number
  interestType: 'none' | 'simple' | 'compound'
  expectedRepaymentDate?: string
  status: 'active' | 'paid'
  createdAt: string
  description?: string
}

export function LendingDashboard() {
  const [filterType, setFilterType] = useState<'all' | 'lent' | 'borrowed'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTab, setEditTab] = useState<'edit' | 'payment'>('edit')
  const [showNewForm, setShowNewForm] = useState(false)
  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete'; id: string; name: string } | null>(null)
  const [settleId, setSettleId] = useState<string | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [historyJustRecorded, setHistoryJustRecorded] = useState(false)

  const { showUndo } = useUndo()
  const lending = useLiveQuery(() => db.lending.toArray()) || []

  // Calculate interest accrued
  const calculateAccruedInterest = (record: LendingRecord) => {
    if (record.interestType === 'none') return 0

    const createdDate = new Date(record.createdAt)
    const now = new Date()
    const daysElapsed = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))

    if (record.interestType === 'simple') {
      return (record.amount * record.interestRate * daysElapsed) / (100 * 365)
    }

    // Compound interest (annually)
    const yearsElapsed = daysElapsed / 365
    return record.amount * (Math.pow(1 + record.interestRate / 100, yearsElapsed) - 1)
  }

  // Filtered and sorted lending records
  const filteredLending = useMemo(() => {
    return lending
      .filter((l) => filterType === 'all' || l.type === filterType)
      .map((l) => ({
        ...l,
        accruedInterest: calculateAccruedInterest(l as LendingRecord),
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [lending, filterType])

  // Summary metrics
  const metrics = useMemo(() => {
    const lent = filteredLending
      .filter((l) => l.type === 'lent')
      .reduce((sum, l) => sum + l.amount, 0)

    const borrowed = filteredLending
      .filter((l) => l.type === 'borrowed')
      .reduce((sum, l) => sum + l.amount, 0)

    const pendingInterest = filteredLending.reduce((sum, l) => sum + l.accruedInterest, 0)

    const activeCount = filteredLending.filter((l) => l.status === 'active').length

    return { lent, borrowed, pendingInterest, activeCount }
  }, [filteredLending])

  // Overdue detection
  const overdueRecords = useMemo(() => {
    const now = new Date()
    return filteredLending.filter((l) => {
      if (!l.expectedRepaymentDate) return false
      const dueDate = new Date(l.expectedRepaymentDate)
      return l.status === 'active' && dueDate < now
    })
  }, [filteredLending])

  const handleDelete = async (id: string) => {
    const record = lending.find(l => l.id === id)
    if (!record) return
    try {
      await db.lending.delete(id)
      showUndo(`${record.contactName} deleted`, async () => {
        await db.lending.add(record)
      })
    } catch {
      // Delete failed silently
    }
  }

  const daysUntilDue = (dueDate: string) => {
    const due = new Date(dueDate)
    const now = new Date()
    const diffTime = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 bg-background/80 backdrop-blur-md z-10 py-4 -mx-4 px-4"
      >
        <h1 className="text-xl font-bold text-foreground">Lending & Interest</h1>
        <p className="text-xs text-muted-foreground mt-1">Track money lent and borrowed with interest calculations</p>
      </motion.div>

      {/* Overdue Alert */}
      {overdueRecords.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-600 dark:text-red-400 text-sm">
              {overdueRecords.length} overdue payment{overdueRecords.length > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
              You have {overdueRecords.length} lending record{overdueRecords.length > 1 ? 's' : ''} past their due date
            </p>
          </div>
        </motion.div>
      )}

      {/* Key Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-3"
      >
        {[
          {
            label: 'Money Lent',
            value: formatCurrency(metrics.lent),
            icon: Heart,
            color: 'text-pink-500',
            bg: 'bg-pink-500/10',
          },
          {
            label: 'Money Borrowed',
            value: formatCurrency(metrics.borrowed),
            icon: TrendingUp,
            color: 'text-blue-500',
            bg: 'bg-blue-500/10',
          },
          {
            label: 'Accrued Interest',
            value: formatCurrency(metrics.pendingInterest),
            icon: Percent,
            color: 'text-emerald-500',
            bg: 'bg-emerald-500/10',
          },
          {
            label: 'Active Records',
            value: String(metrics.activeCount),
            icon: Clock,
            color: 'text-indigo-500',
            bg: 'bg-indigo-500/10',
          },
        ].map((metric, i) => {
          const Icon = metric.icon
          return (
            <motion.div
              key={i}
              whileHover={{ scale: 1.02 }}
              className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm flex flex-col items-center text-center space-y-2"
            >
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', metric.bg)}>
                <Icon className={cn('w-5 h-5', metric.color)} />
              </div>
              <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">{metric.label}</p>
              <p className="text-sm font-bold text-foreground">{metric.value}</p>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Filter Tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex gap-2 p-1 bg-secondary rounded-xl w-fit"
      >
        {(['all', 'lent', 'borrowed'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-semibold uppercase transition-all',
              filterType === type
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {type === 'all' ? 'All' : type === 'lent' ? 'Lent' : 'Borrowed'}
          </button>
        ))}
      </motion.div>

      {/* Lending Records */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Records</h2>
          <Button
            size="sm"
            onClick={() => setShowNewForm(!showNewForm)}
            className="text-xs"
          >
            + Add Record
          </Button>
        </div>

        {/* New Record Form */}
        {showNewForm && <NewLendingForm onClose={() => setShowNewForm(false)} />}

        {/* Lending Records List */}
        {filteredLending.length > 0 ? (
          <div className="space-y-3">
            <AnimatePresence>
              {filteredLending.map((record, i) => {
                const daysLeft = record.expectedRepaymentDate ? daysUntilDue(record.expectedRepaymentDate) : 0
                const isOverdue = daysLeft < 0
                const isActive = record.status === 'active'
                const summary = LendingService.summarize(record)

                return (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      'p-4 rounded-2xl border transition-all',
                      isActive
                        ? 'bg-secondary/50 border-border/50 hover:border-primary/30'
                        : 'bg-secondary/30 border-border/30 opacity-60'
                    )}
                  >
                    <div className="space-y-3.5">
                      {/* Header: avatar, name, type, actions */}
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[15px] font-bold',
                          record.type === 'lent' ? 'bg-pink-500/15 text-pink-500' : 'bg-blue-500/15 text-blue-500'
                        )}>
                          {record.contactName.trim().charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="truncate text-[15px] font-bold text-foreground">{record.contactName}</p>
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                              record.type === 'lent'
                                ? 'bg-pink-500/15 text-pink-600 dark:text-pink-400'
                                : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                            )}>
                              {record.type === 'lent' ? 'Lent' : 'Borrowed'}
                            </span>
                            {!isActive && (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Settled</span>
                            )}
                          </div>
                          {record.description && (
                            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{record.description}</p>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 items-center">
                          <button
                            onClick={() => { setEditTab('edit'); setEditingId(record.id) }}
                            className="rounded-full p-2 transition-colors hover:bg-primary/10"
                            aria-label="Edit lending record"
                          >
                            <Edit2 className="h-4 w-4 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => setConfirmAction({ type: 'delete', id: record.id, name: record.contactName })}
                            className="rounded-full p-2 transition-colors hover:bg-destructive/10"
                            aria-label="Delete lending record"
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </div>
                      </div>

                      {/* Outstanding + interest */}
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          {isActive ? (record.type === 'lent' ? 'Still owes you' : 'You still owe') : 'Original amount'}
                        </p>
                        <Amount value={isActive ? record.amount : summary.total} size="lg" className="mt-0.5 block text-foreground" />
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {record.interestType !== 'none' || record.interestRate > 0
                            ? <>Interest {record.interestRate}% · Accrued <span className="font-semibold text-emerald-500">{formatCurrency(record.accruedInterest)}</span>
                                {record.accruedInterest > 0 && isActive && <> · Total due <span className="font-semibold text-foreground">{formatCurrency(record.amount + record.accruedInterest)}</span></>}</>
                            : 'No interest'}
                        </p>
                      </div>

                      {/* Repayment progress (only once something has been paid back) */}
                      {summary.repaid > 0 && (
                        <div>
                          <div className="mb-1 flex items-center justify-between text-[11.5px]">
                            <span className="text-muted-foreground">
                              {record.type === 'lent' ? 'Received' : 'Paid'} <span className="font-semibold text-foreground">{formatCurrency(summary.repaid)}</span> of {formatCurrency(summary.total)}
                            </span>
                            <span className="font-bold text-emerald-500">{Math.round(summary.progress)}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${summary.progress}%` }} />
                          </div>
                        </div>
                      )}

                      {/* Due date */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Due</span>
                        <span className="font-semibold text-foreground">
                          {record.expectedRepaymentDate ? new Date(record.expectedRepaymentDate).toLocaleDateString() : 'N/A'}
                        </span>
                        {isActive && record.expectedRepaymentDate && (
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                            isOverdue ? 'bg-red-500/15 text-red-500' : 'bg-secondary text-muted-foreground'
                          )}>
                            {isOverdue ? `${Math.abs(daysLeft)} days overdue` : daysLeft === 0 ? 'today' : `in ${daysLeft} days`}
                          </span>
                        )}
                        {summary.lastRepayment && (
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            Last payment {new Date(summary.lastRepayment.date + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>

                      {/* Actions: three small, equal pills */}
                      <div className={cn('grid gap-2 pt-0.5', isActive ? 'grid-cols-3' : 'grid-cols-1')}>
                        {isActive && (
                          <button
                            onClick={() => { setEditTab('payment'); setEditingId(record.id) }}
                            className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-primary/10 px-3 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/15"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} /> Payment
                          </button>
                        )}
                        <button
                          onClick={() => { setHistoryJustRecorded(false); setHistoryId(record.id) }}
                          className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-card px-3 text-[12px] font-semibold text-foreground transition-colors hover:bg-secondary"
                        >
                          <History className="h-3.5 w-3.5" strokeWidth={2.2} /> History
                        </button>
                        {isActive && (
                          <button
                            onClick={() => setSettleId(record.id)}
                            className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-500/12 px-3 text-[12px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} /> Settle
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        ) : (
          <div className="text-center py-12 bg-secondary/20 rounded-xl border border-dashed border-border">
            <Heart className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-bold text-muted-foreground">No lending records yet</p>
            <p className="text-xs text-muted-foreground/75 mt-1">Add your first lending record to get started</p>
          </div>
        )}
      </motion.div>

      {/* Edit Lending Form */}
      <AnimatePresence>
        {editingId && (
          <EditLendingForm
            recordId={editingId}
            initialTab={editTab}
            lending={lending}
            onClose={() => setEditingId(null)}
            onRecorded={(id) => { setHistoryJustRecorded(true); setHistoryId(id) }}
          />
        )}
      </AnimatePresence>

      {/* Per-borrower payment history */}
      <AnimatePresence>
        {historyId && (
          <LendingHistorySheet
            key={historyId}
            recordId={historyId}
            justRecorded={historyJustRecorded}
            onClose={() => { setHistoryId(null); setHistoryJustRecorded(false) }}
            onRecordPayment={(id) => {
              setHistoryId(null)
              setHistoryJustRecorded(false)
              setEditTab('payment')
              setEditingId(id)
            }}
          />
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      {/* Settle: records the repayment as a real transaction */}
      <AnimatePresence>
        {settleId && (() => {
          const rec = filteredLending.find(l => l.id === settleId) ?? lending.find(l => l.id === settleId)
          if (!rec) return null
          const accrued = 'accruedInterest' in rec ? Number((rec as { accruedInterest: number }).accruedInterest) || 0 : 0
          return (
            <SettleLendingModal
              key={settleId}
              record={rec as LendingRecord}
              accruedInterest={accrued}
              onClose={() => setSettleId(null)}
              onSettled={(name, undo) => {
                setSettleId(null)
                showUndo(`${name} marked as settled`, undo)
              }}
            />
          )
        })()}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={!!confirmAction}
        title="Delete Lending Record?"
        message={`Are you sure you want to delete the record for "${confirmAction?.name ?? ''}"? You can undo this action.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (confirmAction) handleDelete(confirmAction.id)
          setConfirmAction(null)
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}

function NewLendingForm({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast()
  const { accounts, defaultId } = useDefaultAccount()
  const [accountId, setAccountId] = useState('')
  const [data, setData] = useState({
    contactName: '',
    type: 'lent' as 'lent' | 'borrowed',
    amount: '' as string | number,
    interestRate: '' as string | number,
    interestType: 'none' as 'none' | 'simple' | 'compound',
    expectedRepaymentDate: '',
    description: '',
  })

  const effectiveAccountId = accountId || defaultId
  const hasAccounts = accounts.length > 0
  const amountNum = parseFloat(String(data.amount)) || 0

  const handleSubmit = async () => {
    if (!data.contactName || !data.amount || !data.expectedRepaymentDate) {
      showToast('Please fill in contact name, amount, and repayment date')
      return
    }
    if (amountNum <= 0) {
      showToast('Enter an amount greater than zero')
      return
    }

    try {
      const recordMoney = hasAccounts && !!effectiveAccountId
      await db.transaction('rw', LendingService.TABLES, async () => {
        const newId = generateUUID()
        await db.lending.add({
          id: newId,
          ...data,
          contactName: data.contactName.trim(),
          amount: amountNum,
          interestRate: parseFloat(String(data.interestRate)) || 0,
          status: 'active',
          createdAt: new Date().toISOString(),
          history: [],
        })
        await LendingService.record({
          recordId: newId,
          kind: data.type,
          contact: data.contactName.trim(),
          event: 'initial',
          amount: amountNum,
          accountId: recordMoney ? effectiveAccountId : undefined,
        })
      })
      showToast(recordMoney ? 'Saved and recorded in your transactions' : 'Lending record saved')
      onClose()
    } catch (err) {
      console.error('Error adding lending record:', err)
      showToast('Could not save the record')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="p-4 bg-secondary/50 border border-border/50 rounded-lg space-y-3"
    >
      <Input
        placeholder="Contact name"
        value={data.contactName}
        onChange={(e) => setData({ ...data, contactName: e.target.value })}
        className="text-sm"
      />

      <div className="grid grid-cols-2 gap-2">
        <Select
          value={data.type}
          onChange={(e) => setData({ ...data, type: e.target.value as 'lent' | 'borrowed' })}
        >
          <option value="lent">Lent</option>
          <option value="borrowed">Borrowed</option>
        </Select>

        <AmountInput
          placeholder="Amount"
          value={data.amount as string}
          onChange={(val) => setData({ ...data, amount: val })}
          className="text-sm"
        />
      </div>

      {/* Which account the money moves through */}
      {hasAccounts ? (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase">
            {data.type === 'lent' ? 'Paid from account' : 'Received in account'}
          </label>
          <AccountSelect value={effectiveAccountId} onChange={setAccountId} placeholder="Select account" />
          {amountNum > 0 && (
            <ImpactNote>
              {LendingService.describeImpact(data.type, 'principal', amountNum)} Your account balance updates too.
            </ImpactNote>
          )}
        </div>
      ) : (
        <ImpactNote>Add an account to also record this as a transaction.</ImpactNote>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          placeholder="Interest Rate %"
          value={data.interestRate}
          onChange={(e) => setData({ ...data, interestRate: e.target.value })}
          className="text-sm"
        />

        <Select
          value={data.interestType}
          onChange={(e) => setData({ ...data, interestType: e.target.value as 'none' | 'simple' | 'compound' })}
        >
          <option value="none">No Interest</option>
          <option value="simple">Simple</option>
          <option value="compound">Compound</option>
        </Select>
      </div>

      <DatePicker
        value={data.expectedRepaymentDate}
        onChange={(d) => setData({ ...data, expectedRepaymentDate: d })}
        placeholder="Expected repayment date"
      />

      <Input
        placeholder="Notes (optional)"
        value={data.description}
        onChange={(e) => setData({ ...data, description: e.target.value })}
        className="text-sm"
      />

      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          className="flex-1 text-sm"
        >
          Save
        </Button>
        <Button
          variant="outline"
          onClick={onClose}
          className="flex-1 text-sm"
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
      </div>
    </motion.div>
  )
}


function EditLendingForm({ recordId, lending, initialTab = 'edit', onClose, onRecorded }: { recordId: string; lending: LendingRecord[]; initialTab?: 'edit' | 'payment'; onClose: () => void; onRecorded?: (id: string) => void }) {
  const record = lending.find((l) => l.id === recordId)
  const { showToast } = useToast()
  const { accounts, defaultId } = useDefaultAccount()
  const [accountId, setAccountId] = useState('')
  const [activeTab, setActiveTab] = useState<'edit' | 'payment'>(initialTab)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [data, setData] = useState({
    contactName: record?.contactName || '',
    type: (record?.type || 'lent') as 'lent' | 'borrowed',
    amount: record?.amount?.toString() || '',
    interestRate: record?.interestRate?.toString() || '0',
    interestType: (record?.interestType || 'none') as 'none' | 'simple' | 'compound',
    expectedRepaymentDate: record?.expectedRepaymentDate || '',
    description: record?.description || '',
  })

  if (!record) return null

  const kind = record.type
  const effectiveAccountId = accountId || defaultId
  const hasAccounts = accounts.length > 0
  const canRecordMoney = hasAccounts && !!effectiveAccountId

  // Outstanding principal as stored in the database (always fresh after a payment)
  const outstanding = Number(record.amount) || 0
  const newPrincipal = parseFloat(data.amount) || 0
  const principalDelta = Math.round((newPrincipal - outstanding) * 100) / 100
  const paymentNum = parseFloat(paymentAmount) || 0

  const handleSave = async () => {
    if (!data.contactName || !data.amount) return
    if (newPrincipal <= 0) {
      showToast('Enter an amount greater than zero')
      return
    }
    try {
      const name = data.contactName.trim()
      const patch = {
        contactName: name,
        interestRate: parseFloat(data.interestRate) || 0,
        interestType: data.interestType,
        expectedRepaymentDate: data.expectedRepaymentDate,
        description: data.description,
      }
      await db.transaction('rw', LendingService.TABLES, async () => {
        if (principalDelta !== 0) {
          // The amount changed: log it in the history and, if an account is chosen, record the money movement.
          await LendingService.record({
            recordId,
            kind,
            contact: name,
            event: principalDelta > 0 ? 'increase' : 'decrease',
            amount: Math.abs(principalDelta),
            accountId: canRecordMoney ? effectiveAccountId : undefined,
            patch,
          })
        } else {
          await db.lending.update(recordId, patch)
        }
      })
      if (principalDelta !== 0 && canRecordMoney) showToast('Amount updated and recorded in your transactions')
      onClose()
    } catch {
      showToast('Could not save changes')
    }
  }

  const handleRecordPayment = async () => {
    if (!paymentNum || paymentNum <= 0) {
      showToast('Please enter a valid payment amount')
      return
    }
    if (paymentNum > outstanding) {
      showToast('Payment cannot exceed the remaining amount')
      return
    }

    try {
      await db.transaction('rw', LendingService.TABLES, async () => {
        await LendingService.record({
          recordId,
          kind,
          contact: record.contactName,
          event: 'repayment',
          amount: paymentNum,
          accountId: canRecordMoney ? effectiveAccountId : undefined,
          note: paymentNote.trim() || undefined,
        })
      })

      showToast(`Payment of ${formatCurrency(paymentNum)} recorded${canRecordMoney ? ' in Transactions' : ''}`)
      // Jump straight to the history so the new entry is visible.
      onRecorded?.(recordId)
      onClose()
    } catch {
      showToast('Failed to record payment')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-card border border-border/60 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Edit Lending Record</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-secondary rounded-xl">
          <button
            onClick={() => setActiveTab('edit')}
            className={cn(
              'flex-1 py-2 rounded-lg text-xs font-semibold transition-all',
              activeTab === 'edit'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Edit Details
          </button>
          <button
            onClick={() => setActiveTab('payment')}
            className={cn(
              'flex-1 py-2 rounded-lg text-xs font-semibold transition-all',
              activeTab === 'payment'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Record Payment
          </button>
        </div>

        {activeTab === 'edit' ? (
          <>
            <Input
              placeholder="Contact name"
              value={data.contactName}
              onChange={(e) => setData({ ...data, contactName: e.target.value })}
              className="text-sm"
            />

            <div className="grid grid-cols-2 gap-2">
              {/* Type is fixed once money has been recorded against it */}
              <div className="flex h-11 items-center justify-center rounded-2xl border border-border/70 bg-secondary text-[13px] font-semibold text-muted-foreground">
                {kind === 'lent' ? 'Lent' : 'Borrowed'}
              </div>

              <AmountInput
                placeholder="Amount"
                value={data.amount}
                onChange={(val) => setData({ ...data, amount: val })}
                className="text-sm"
              />
            </div>

            {/* Amount changed: show exactly what will be recorded */}
            {principalDelta !== 0 && newPrincipal > 0 && (
              canRecordMoney ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    {LendingService.txnType(kind, principalDelta > 0 ? 'principal' : 'repayment') === 'expense'
                      ? 'Paid from account'
                      : 'Received in account'}
                  </label>
                  <AccountSelect value={effectiveAccountId} onChange={setAccountId} placeholder="Select account" />
                  <ImpactNote>
                    Amount {principalDelta > 0 ? 'increased' : 'reduced'} by {formatCurrency(Math.abs(principalDelta))}.{' '}
                    {LendingService.describeImpact(kind, principalDelta > 0 ? 'principal' : 'repayment', principalDelta)}
                  </ImpactNote>
                </div>
              ) : (
                <ImpactNote>Add an account to also record amount changes as transactions.</ImpactNote>
              )
            )}

            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Interest Rate %"
                value={data.interestRate}
                onChange={(e) => setData({ ...data, interestRate: e.target.value })}
                className="text-sm"
              />

              <Select
                value={data.interestType}
                onChange={(e) => setData({ ...data, interestType: e.target.value as 'none' | 'simple' | 'compound' })}
              >
                <option value="none">No Interest</option>
                <option value="simple">Simple</option>
                <option value="compound">Compound</option>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Expected Repayment Date</label>
              <DatePicker
                value={data.expectedRepaymentDate}
                onChange={(d) => setData({ ...data, expectedRepaymentDate: d })}
                className="mt-1.5"
                placeholder="Select date"
              />
            </div>

            <Input
              placeholder="Notes (optional)"
              value={data.description}
              onChange={(e) => setData({ ...data, description: e.target.value })}
              className="text-sm"
            />

            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} className="flex-1 text-sm">
                Save Changes
              </Button>
              <Button variant="outline" onClick={onClose} className="flex-1 text-sm">
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Payment Recording Section */}
            <div className="p-3 bg-secondary/50 rounded-xl border border-border/30 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Outstanding Balance</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(outstanding)}</p>
              <p className="text-[10px] text-muted-foreground">
                {kind === 'lent' ? 'Owed by' : 'Owed to'} {record.contactName}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  {kind === 'lent' ? 'Amount received' : 'Amount paid'}
                </label>
                <AmountInput
                  placeholder={kind === 'lent' ? 'Enter amount received' : 'Enter amount paid'}
                  value={paymentAmount}
                  onChange={(val) => setPaymentAmount(val)}
                  className="text-sm mt-1.5"
                />
              </div>

              {/* Quick amount buttons */}
              <div className="flex flex-wrap gap-2">
                {[1000, 2000, 5000, 10000].map((amt) => {
                  if (amt > outstanding) return null
                  return (
                    <button
                      key={amt}
                      onClick={() => setPaymentAmount(amt.toString())}
                      className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                    >
                      +{amt >= 1000 ? `${amt / 1000}K` : amt}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPaymentAmount(String(outstanding))}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors"
                >
                  Full Amount
                </button>
              </div>

              {canRecordMoney ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    {kind === 'lent' ? 'Received in account' : 'Paid from account'}
                  </label>
                  <AccountSelect value={effectiveAccountId} onChange={setAccountId} placeholder="Select account" />
                  {paymentNum > 0 && (
                    <WhereItShowsUp
                      lines={[
                        {
                          label: 'Transactions',
                          value: `${LendingService.txnType(kind, 'repayment') === 'income' ? 'Income' : 'Expense'} · ${kind === 'lent' ? 'Lending' : 'Borrowing'} · ${formatCurrency(paymentNum)}`,
                        },
                        {
                          label: accounts.find(a => a.id === effectiveAccountId)?.name ?? 'Account',
                          value: `Balance ${LendingService.txnType(kind, 'repayment') === 'income' ? '+' : '-'}${formatCurrency(paymentNum)}`,
                        },
                        {
                          label: `${record.contactName}'s history`,
                          value: `${kind === 'lent' ? 'Still owes' : 'You still owe'} ${formatCurrency(Math.max(0, outstanding - paymentNum))}`,
                        },
                      ]}
                    />
                  )}
                </div>
              ) : (
                <ImpactNote>Add an account to also record payments as transactions.</ImpactNote>
              )}

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Note (optional)</label>
                <Input
                  placeholder="e.g., Paid via UPI"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="text-sm mt-1.5"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={handleRecordPayment} className="flex-1 text-sm">
                Record Payment
              </Button>
              <Button variant="outline" onClick={onClose} className="flex-1 text-sm">
                Cancel
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

/* Settle: closes the record and records the final repayment as a real transaction. */
function SettleLendingModal({
  record,
  accruedInterest,
  onClose,
  onSettled,
}: {
  record: LendingRecord
  accruedInterest: number
  onClose: () => void
  onSettled: (name: string, undo: () => Promise<void>) => void
}) {
  const { showToast } = useToast()
  const { accounts, defaultId } = useDefaultAccount()
  const [accountId, setAccountId] = useState('')
  const [recordMoney, setRecordMoney] = useState(true)

  const kind = record.type
  const principal = Number(record.amount) || 0
  const interest = Math.round(accruedInterest * 100) / 100
  const suggested = Math.round((principal + interest) * 100) / 100
  const [amount, setAmount] = useState(String(suggested))

  const effectiveAccountId = accountId || defaultId
  const hasAccounts = accounts.length > 0
  const amountNum = parseFloat(amount) || 0
  const willRecord = recordMoney && hasAccounts && !!effectiveAccountId && amountNum > 0

  const handleConfirm = async () => {
    try {
      let entryId = ''
      await db.transaction('rw', LendingService.TABLES, async () => {
        const entry = await LendingService.record({
          recordId: record.id,
          kind,
          contact: record.contactName,
          event: 'settlement',
          amount: amountNum,
          accountId: willRecord ? effectiveAccountId : undefined,
          note: 'Settled',
        })
        entryId = entry.id
      })
      onSettled(record.contactName, async () => {
        await db.transaction('rw', LendingService.TABLES, async () => {
          await LendingService.removeEntry(record.id, entryId)
        })
      })
    } catch {
      showToast('Could not settle this record')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-card border border-border/60 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Mark as settled</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary" aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="rounded-xl border border-border/30 bg-secondary/50 p-3 space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Principal</span><span className="font-semibold text-foreground">{formatCurrency(principal)}</span></div>
          {interest > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Accrued interest</span><span className="font-semibold text-emerald-500">{formatCurrency(interest)}</span></div>
          )}
          <div className="flex justify-between border-t border-border/30 pt-1.5"><span className="font-semibold text-foreground">Total due</span><span className="font-bold text-foreground">{formatCurrency(suggested)}</span></div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">
            {kind === 'lent' ? 'Amount received' : 'Amount paid'}
          </label>
          <AmountInput value={amount} onChange={setAmount} className="text-sm mt-1.5" />
        </div>

        {hasAccounts ? (
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-[13px] font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={recordMoney}
                onChange={(e) => setRecordMoney(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Record this in my transactions
            </label>
            {recordMoney && (
              <>
                <label className="text-xs font-semibold text-muted-foreground uppercase block">
                  {kind === 'lent' ? 'Received in account' : 'Paid from account'}
                </label>
                <AccountSelect value={effectiveAccountId} onChange={setAccountId} placeholder="Select account" />
                {amountNum > 0 && (
                  <ImpactNote>{LendingService.describeImpact(kind, 'repayment', amountNum)} Your account balance updates too.</ImpactNote>
                )}
              </>
            )}
          </div>
        ) : (
          <ImpactNote>Add an account to also record the settlement as a transaction.</ImpactNote>
        )}

        <div className="flex gap-2 pt-1">
          <Button onClick={handleConfirm} className="flex-1 text-sm">Mark Settled</Button>
          <Button variant="outline" onClick={onClose} className="flex-1 text-sm">Cancel</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
