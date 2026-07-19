'use client'

import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Heart, TrendingUp, Clock, AlertCircle, Check, X,
  ChevronRight, Calendar, Percent, User, Trash2, Edit2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AmountInput } from '@/components/ui/amount-input'
import { Select } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useUndo } from '@/components/ui/undo-toast'
import { useToast } from '@/components/ui/toast-notification'

interface LendingRecord {
  id: string
  contactName: string
  type: 'lent' | 'borrowed'
  amount: number
  interestRate: number
  interestType: 'none' | 'simple' | 'compound'
  expectedRepaymentDate: string
  status: 'active' | 'paid'
  createdAt: string
  description?: string
}

export function LendingDashboard() {
  const [filterType, setFilterType] = useState<'all' | 'lent' | 'borrowed'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'settle'; id: string; name: string } | null>(null)

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

  const handleMarkSettled = async (id: string) => {
    const record = lending.find(l => l.id === id)
    if (!record) return
    try {
      await db.lending.update(id, { status: 'paid' })
      showUndo(`${record.contactName} marked as settled`, async () => {
        await db.lending.update(id, { status: 'active' })
      })
    } catch {
      // Update failed silently
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
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Lending & Interest</h1>
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

                return (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      'p-4 rounded-lg border transition-all',
                      isActive
                        ? 'bg-secondary/50 border-border/50 hover:border-primary/30'
                        : 'bg-secondary/30 border-border/30 opacity-60'
                    )}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <p className="font-semibold text-foreground">{record.contactName}</p>
                            <span className={cn(
                              'text-xs font-semibold uppercase px-2 py-1 rounded-full',
                              record.type === 'lent'
                                ? 'bg-pink-500/20 text-pink-600 dark:text-pink-400'
                                : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                            )}>
                              {record.type === 'lent' ? 'Lent' : 'Borrowed'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{record.description}</p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingId(record.id)}
                            className="p-2 hover:bg-primary/10 rounded-lg transition-colors"
                            aria-label="Edit lending record"
                          >
                            <Edit2 className="w-4 h-4 text-muted-foreground hover:text-primary" />
                          </button>
                          <button
                            onClick={() => setConfirmAction({ type: 'delete', id: record.id, name: record.contactName })}
                            className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                            aria-label="Delete lending record"
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-background/50 p-2 rounded-lg">
                          <p className="text-muted-foreground">Principal</p>
                          <p className="font-semibold text-foreground">{formatCurrency(record.amount)}</p>
                        </div>
                        <div className="bg-background/50 p-2 rounded-lg">
                          <p className="text-muted-foreground">Interest Rate</p>
                          <p className="font-semibold text-foreground">{record.interestRate}%</p>
                        </div>
                        <div className="bg-background/50 p-2 rounded-lg">
                          <p className="text-muted-foreground">Accrued Interest</p>
                          <p className="font-semibold text-emerald-500">{formatCurrency(record.accruedInterest)}</p>
                        </div>
                        <div className="bg-background/50 p-2 rounded-lg">
                          <p className="text-muted-foreground">Total Due</p>
                          <p className="font-semibold text-foreground">
                            {formatCurrency(record.amount + record.accruedInterest)}
                          </p>
                        </div>
                      </div>

                      {/* Due Date & Status */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/30">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Due</p>
                            <p className="text-xs font-semibold text-foreground">
                              {record.expectedRepaymentDate ? new Date(record.expectedRepaymentDate).toLocaleDateString() : 'N/A'}
                              {isActive && record.expectedRepaymentDate && (
                                <span className={cn(
                                  'ml-2',
                                  isOverdue ? 'text-red-500 font-bold' : 'text-muted-foreground'
                                )}>
                                  ({isOverdue ? `${Math.abs(daysLeft)} days overdue` : `in ${daysLeft} days`})
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {isActive && (
                          <button
                            onClick={() => setConfirmAction({ type: 'settle', id: record.id, name: record.contactName })}
                            className="px-3 py-1 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-lg hover:bg-emerald-500/30 transition-colors"
                          >
                            Mark Settled
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
            lending={lending}
            onClose={() => setEditingId(null)}
          />
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!confirmAction}
        title={confirmAction?.type === 'delete' ? 'Delete Lending Record?' : 'Mark as Settled?'}
        message={
          confirmAction?.type === 'delete'
            ? `Are you sure you want to delete the record for "${confirmAction.name}"? You can undo this action.`
            : `Mark the record for "${confirmAction?.name}" as settled? You can undo this if done by mistake.`
        }
        confirmLabel={confirmAction?.type === 'delete' ? 'Delete' : 'Mark Settled'}
        cancelLabel="Cancel"
        variant={confirmAction?.type === 'delete' ? 'danger' : 'warning'}
        onConfirm={() => {
          if (confirmAction) {
            if (confirmAction.type === 'delete') handleDelete(confirmAction.id)
            else handleMarkSettled(confirmAction.id)
          }
          setConfirmAction(null)
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}

function NewLendingForm({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast()
  const [data, setData] = useState({
    contactName: '',
    type: 'lent' as 'lent' | 'borrowed',
    amount: '' as string | number,
    interestRate: '' as string | number,
    interestType: 'none' as 'none' | 'simple' | 'compound',
    expectedRepaymentDate: '',
    description: '',
  })

  const handleSubmit = async () => {
    if (!data.contactName || !data.amount || !data.expectedRepaymentDate) {
      showToast('Please fill in contact name, amount, and repayment date')
      return
    }

    try {
      await db.lending.add({
        id: generateUUID(),
        ...data,
        amount: parseFloat(String(data.amount)) || 0,
        interestRate: parseFloat(String(data.interestRate)) || 0,
        status: 'active',
        createdAt: new Date().toISOString(),
      } as any)
      onClose()
    } catch (err) {
      console.error('Error adding lending record:', err)
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
          onChange={(e) => setData({ ...data, type: e.target.value as any })}
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
          onChange={(e) => setData({ ...data, interestType: e.target.value as any })}
        >
          <option value="none">No Interest</option>
          <option value="simple">Simple</option>
          <option value="compound">Compound</option>
        </Select>
      </div>

      <Input
        type="date"
        value={data.expectedRepaymentDate}
        onChange={(e) => setData({ ...data, expectedRepaymentDate: e.target.value })}
        className="text-sm"
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


function EditLendingForm({ recordId, lending, onClose }: { recordId: string; lending: any[]; onClose: () => void }) {
  const record = lending.find((l: any) => l.id === recordId)
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<'edit' | 'payment'>('edit')
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

  const handleSave = async () => {
    if (!data.contactName || !data.amount) return
    try {
      await db.lending.update(recordId, {
        contactName: data.contactName,
        type: data.type,
        amount: parseFloat(data.amount) || 0,
        interestRate: parseFloat(data.interestRate) || 0,
        interestType: data.interestType,
        expectedRepaymentDate: data.expectedRepaymentDate,
        description: data.description,
      })
      onClose()
    } catch {
      // Save failed
    }
  }

  const handleRecordPayment = async () => {
    const payment = parseFloat(paymentAmount)
    if (!payment || payment <= 0) {
      showToast('Please enter a valid payment amount')
      return
    }

    const currentAmount = parseFloat(data.amount) || 0
    if (payment > currentAmount) {
      showToast('Payment cannot exceed the remaining amount')
      return
    }

    const newAmount = currentAmount - payment
    try {
      await db.transaction('rw', [db.lending, db.systemLogs], async () => {
        if (newAmount <= 0) {
          // Fully paid off
          await db.lending.update(recordId, {
            amount: 0,
            status: 'paid',
          })
        } else {
          await db.lending.update(recordId, {
            amount: newAmount,
          })
        }

        // Log the payment
        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'lending',
          description: `Partial payment of ${formatCurrency(payment)} received from ${record.contactName}${paymentNote ? ` - ${paymentNote}` : ''}. Remaining: ${formatCurrency(newAmount)}`,
          amount: payment,
        })
      })

      showToast(`Payment of ${formatCurrency(payment)} recorded successfully`)
      setPaymentAmount('')
      setPaymentNote('')
      if (newAmount <= 0) {
        onClose()
      } else {
        // Update local state to reflect new amount
        setData({ ...data, amount: newAmount.toString() })
      }
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
              <Select
                value={data.type}
                onChange={(e) => setData({ ...data, type: e.target.value as any })}
              >
                <option value="lent">Lent</option>
                <option value="borrowed">Borrowed</option>
              </Select>

              <AmountInput
                placeholder="Amount"
                value={data.amount}
                onChange={(val) => setData({ ...data, amount: val })}
                className="text-sm"
              />
            </div>

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
                onChange={(e) => setData({ ...data, interestType: e.target.value as any })}
              >
                <option value="none">No Interest</option>
                <option value="simple">Simple</option>
                <option value="compound">Compound</option>
              </Select>
            </div>

            <Input
              type="date"
              value={data.expectedRepaymentDate}
              onChange={(e) => setData({ ...data, expectedRepaymentDate: e.target.value })}
              className="text-sm"
              label="Expected Repayment Date"
            />

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
              <p className="text-lg font-bold text-foreground">{formatCurrency(parseFloat(data.amount) || 0)}</p>
              <p className="text-[10px] text-muted-foreground">
                {record.type === 'lent' ? 'Owed by' : 'Owed to'} {record.contactName}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Payment Amount</label>
                <AmountInput
                  placeholder="Enter amount received"
                  value={paymentAmount}
                  onChange={(val) => setPaymentAmount(val)}
                  className="text-sm mt-1.5"
                />
              </div>

              {/* Quick amount buttons */}
              <div className="flex flex-wrap gap-2">
                {[1000, 2000, 5000, 10000].map((amt) => {
                  const currentAmt = parseFloat(data.amount) || 0
                  if (amt > currentAmt) return null
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
                  onClick={() => setPaymentAmount(data.amount)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors"
                >
                  Full Amount
                </button>
              </div>

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
