'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID, syncAccountToAsset } from '@/db/schema'
import { Dialog, DialogContent, DialogHeader, DialogClose } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { AmountInput } from '@/components/ui/amount-input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { CategorySelect } from '@/components/ui/category-select'
import { CategoryIcon } from '@/components/ui/category-icon'
import { formatCurrency, cn, getCurrencySymbol } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { DatePicker } from '@/components/ui/date-picker'
import { ClockTimePicker } from '@/components/ui/clock-time-picker'
import { CalendarDatePicker } from '@/components/ui/calendar-date-picker'
import {
  ArrowDownRight, ArrowUpRight, Heart, Home, Target, Zap,
  X, ChevronRight, Check, Camera, ArrowLeft, Calendar, Clock,
  Calculator, Utensils, Wallet, AlignLeft, Hash, Paperclip,
  Save, ArrowLeftRight, Plus, Pencil, Search, CalendarClock,
} from 'lucide-react'
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '@/lib/category-meta'
import { PlannedPaymentForm, type PlannedPaymentDraft } from '@/components/modules/planned-payment-form'
import { PlannedPaymentService } from '@/services/PlannedPaymentService'
import { AddAccountSheet } from '@/components/modules/account-manager'

// Validation schemas
const transactionSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  category: z.string().min(1, 'Category required'),
  accountId: z.string().min(1, 'Account required'),
  description: z.string().optional().default(''),
  date: z.string().min(1, 'Date required'),
  time: z.string().optional().default(''),
  isRecurring: z.boolean().default(false),
})

const transferSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  fromAccountId: z.string().min(1, 'From account required'),
  toAccountId: z.string().min(1, 'To account required'),
  description: z.string().optional().default(''),
  date: z.string().min(1, 'Date required'),
  time: z.string().optional().default(''),
})

const lendingSchema = z.object({
  contactName: z.string().min(1, 'Name required'),
  amount: z.coerce.number().positive('Amount required'),
  interestRate: z.coerce.number().min(0),
  interestType: z.enum(['none', 'simple', 'compound']),
  expectedRepaymentDate: z.string().optional(),
  description: z.string().optional(),
})

const assetSchema = z.object({
  name: z.string().min(1, 'Name required'),
  type: z.enum(['cash', 'bank', 'stock', 'crypto', 'real_estate', 'gold']),
  balance: z.coerce.number().nonnegative(),
})

const billSchema = z.object({
  title: z.string().min(1, 'Title required'),
  amount: z.coerce.number().positive(),
  dueDate: z.string().min(1),
  category: z.string().min(1),
  isRecurring: z.boolean().default(false),
})

const goalSchema = z.object({
  title: z.string().min(1, 'Title required'),
  targetAmount: z.coerce.number().positive(),
  currentAmount: z.coerce.number().nonnegative(),
  targetDate: z.string().min(1),
  category: z.string().min(1),
})

type ModeType = 'expense' | 'income' | 'transfer' | 'lending' | 'asset' | 'bill' | 'goal'
type PrimaryMode = 'expense' | 'income' | 'transfer'

interface QuickAddModalProps {
  isOpen: boolean
  onClose: () => void
  onNavigateToTab?: (tab: string) => void
}

// Accent colors mirror the reference: orange (expense), lime (income), blue (transfer)
export const PRIMARY_ACCENTS: Record<PrimaryMode, { color: string; soft: string }> = {
  expense: { color: '#f59e0b', soft: 'rgba(245,158,11,0.14)' },
  income: { color: '#a3e635', soft: 'rgba(163,230,53,0.14)' },
  transfer: { color: '#38bdf8', soft: 'rgba(56,189,248,0.14)' },
}

const MODE_CONFIG = {
  expense: { label: 'Expense', icon: ArrowDownRight, color: 'from-red-500/20 to-red-500/5', accent: 'text-red-500', bg: 'bg-red-500/10' },
  income: { label: 'Income', icon: ArrowUpRight, color: 'from-emerald-500/20 to-emerald-500/5', accent: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  lending: { label: 'Lending', icon: Heart, color: 'from-pink-500/20 to-pink-500/5', accent: 'text-pink-500', bg: 'bg-pink-500/10' },
  asset: { label: 'Asset', icon: Home, color: 'from-amber-500/20 to-amber-500/5', accent: 'text-amber-500', bg: 'bg-amber-500/10' },
  bill: { label: 'Bill', icon: Zap, color: 'from-amber-500/20 to-amber-500/5', accent: 'text-amber-500', bg: 'bg-amber-500/10' },
  goal: { label: 'Goal', icon: Target, color: 'from-indigo-500/20 to-indigo-500/5', accent: 'text-indigo-500', bg: 'bg-indigo-500/10' },
}

// Richer metadata for the "More to add" screen — distinct color + description
// per record type so each card reads as its own purpose.
const MORE_TO_ADD: { key: 'planned' | 'lending' | 'asset' | 'bill' | 'goal'; label: string; desc: string; icon: React.ElementType; color: string }[] = [
  { key: 'planned', label: 'Planned Payment', desc: 'A future income or expense you expect', icon: CalendarClock, color: '#8b5cf6' },
  { key: 'lending', label: 'Lending', desc: 'Money you lent or borrowed from someone', icon: Heart, color: '#ec4899' },
  { key: 'asset', label: 'Asset', desc: 'Property, gold, savings or anything you own', icon: Home, color: '#f59e0b' },
  { key: 'bill', label: 'Bill', desc: 'An upcoming payment with a due date', icon: Zap, color: '#8b5cf6' },
  { key: 'goal', label: 'Goal', desc: 'Save towards something you are planning for', icon: Target, color: '#6366f1' },
]

export const SUGGESTED_TAGS = ['vacation 🏝️', 'amazon 📦', 'business']

export function QuickAddModal({ isOpen, onClose, onNavigateToTab }: QuickAddModalProps) {
  // step: 'transaction' = the Expense/Income/Transfer screen (default when + is tapped)
  //       'select' = grid of the other record types (lending/asset/bill/goal)
  //       'form' = one of the other record forms
  const [mode, setMode] = useState<ModeType>('expense')
  const [primary, setPrimary] = useState<PrimaryMode>('expense')
  const [step, setStep] = useState<'transaction' | 'select' | 'form' | 'planned'>('transaction')
  const [submitted, setSubmitted] = useState(false)
  const accounts = useLiveQuery(() => db.accounts.toArray()) || []

  const getCurrentTime = () => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }

  const expenseForm = useForm<z.infer<typeof transactionSchema>>({
    resolver: zodResolver(transactionSchema),
    defaultValues: { date: new Date().toISOString().split('T')[0], time: getCurrentTime(), isRecurring: false }
  })

  const incomeForm = useForm<z.infer<typeof transactionSchema>>({
    resolver: zodResolver(transactionSchema),
    defaultValues: { date: new Date().toISOString().split('T')[0], time: getCurrentTime(), isRecurring: false }
  })

  const transferForm = useForm<z.infer<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: { date: new Date().toISOString().split('T')[0], time: getCurrentTime() }
  })

  const lendingForm = useForm<z.infer<typeof lendingSchema>>({
    resolver: zodResolver(lendingSchema),
    defaultValues: { interestType: 'none', interestRate: '' as any, amount: '' as any }
  })

  const assetForm = useForm<z.infer<typeof assetSchema>>({
    resolver: zodResolver(assetSchema),
    defaultValues: { type: 'bank', balance: '' as any }
  })

  const billForm = useForm<z.infer<typeof billSchema>>({
    resolver: zodResolver(billSchema),
    defaultValues: { dueDate: new Date().toISOString().split('T')[0], isRecurring: false }
  })

  const goalForm = useForm<z.infer<typeof goalSchema>>({
    resolver: zodResolver(goalSchema),
    defaultValues: { targetAmount: 0, currentAmount: 0 }
  })

  const handleModeSelect = (selectedMode: ModeType) => {
    setMode(selectedMode)
    setStep('form')
    setSubmitted(false)
  }

  const handleClose = () => {
    setStep('transaction')
    setPrimary('expense')
    setSubmitted(false)
    const today = new Date().toISOString().split('T')[0]
    expenseForm.reset({ date: today, time: getCurrentTime(), isRecurring: false, amount: '' as any, category: '', accountId: '', description: '' })
    incomeForm.reset({ date: today, time: getCurrentTime(), isRecurring: false, amount: '' as any, category: '', accountId: '', description: '' })
    transferForm.reset({ date: today, time: getCurrentTime(), amount: '' as any, fromAccountId: '', toAccountId: '', description: '' })
    lendingForm.reset({ interestType: 'none', interestRate: '' as any, amount: '' as any, contactName: '', description: '', expectedRepaymentDate: '' })
    assetForm.reset({ type: 'bank', balance: '' as any, name: '' })
    billForm.reset({ dueDate: today, isRecurring: false, title: '', amount: '' as any, category: '' })
    goalForm.reset({ targetAmount: 0, currentAmount: 0, title: '', targetDate: '', category: '' })
    onClose()
  }

  const flashSaved = () => {
    setSubmitted(true)
    setTimeout(handleClose, 1400)
  }

  const onExpenseSubmit = async (data: any) => {
    try {
      const currentTime = data.time || getCurrentTime()
      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        const txId = generateUUID()
        await db.transactions.add({
          id: txId,
          date: data.date,
          time: currentTime,
          type: 'expense',
          category: data.category,
          amount: data.amount,
          accountId: data.accountId,
          description: data.description,
          tags: data.tags,
          isRecurring: data.isRecurring,
          recurrenceRule: undefined,
          receiptImage: data.receiptImage || undefined,
        } as any)

        const account = await db.accounts.get(data.accountId)
        if (account) {
          const newBalance = account.balance - data.amount
          await db.accounts.update(data.accountId, { balance: newBalance })
          await syncAssetBalance(account.name, newBalance)
        }

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'transaction',
          description: `Logged expense: ${data.description} (${formatCurrency(data.amount)})`,
          amount: -data.amount,
        } as any)
      })
      try {
        const unpaidBills = await db.bills.filter(b => !b.isPaid).toArray()
        const matchingBill = unpaidBills.find(b =>
          b.title.toLowerCase().includes(data.description?.toLowerCase() || '') ||
          (data.description && data.description.toLowerCase().includes(b.title.toLowerCase())) ||
          (b.category.toLowerCase() === data.category.toLowerCase() && Math.abs(b.amount - data.amount) < 1)
        )
        if (matchingBill) await db.bills.update(matchingBill.id, { isPaid: true })
      } catch {}
      flashSaved()
    } catch (err) {
      console.error('Error saving expense:', err)
    }
  }

  const onIncomeSubmit = async (data: any) => {
    try {
      const currentTime = data.time || getCurrentTime()
      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        const txId = generateUUID()
        await db.transactions.add({
          id: txId,
          date: data.date,
          time: currentTime,
          type: 'income',
          category: data.category,
          amount: data.amount,
          accountId: data.accountId,
          description: data.description,
          tags: data.tags,
          isRecurring: data.isRecurring,
          recurrenceRule: undefined,
        } as any)

        const account = await db.accounts.get(data.accountId)
        if (account) {
          const newBalance = account.balance + data.amount
          await db.accounts.update(data.accountId, { balance: newBalance })
          await syncAssetBalance(account.name, newBalance)
        }

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'transaction',
          description: `Logged income: ${data.description} (${formatCurrency(data.amount)})`,
          amount: data.amount,
        } as any)
      })
      try {
        const goals = await db.goals.toArray()
        const autoSaveGoals = goals.filter(g => g.autoSave && g.autoSaveAmount && g.currentAmount < g.targetAmount)
        for (const goal of autoSaveGoals) {
          const contribution = Math.min(goal.autoSaveAmount!, goal.targetAmount - goal.currentAmount)
          if (contribution > 0) await db.goals.update(goal.id, { currentAmount: goal.currentAmount + contribution })
        }
      } catch {}
      flashSaved()
    } catch (err) {
      console.error('Error saving income:', err)
    }
  }

  // Transfer = money moving between two of the user's own accounts.
  // Modeled as a linked expense (from) + income (to) pair.
  const onTransferSubmit = async (data: any) => {
    try {
      if (data.fromAccountId === data.toAccountId) {
        transferForm.setError('toAccountId', { message: 'Pick a different account' })
        return
      }
      const currentTime = data.time || getCurrentTime()
      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        const from = await db.accounts.get(data.fromAccountId)
        const to = await db.accounts.get(data.toAccountId)
        const note = data.description || `Transfer ${from?.name ?? ''} → ${to?.name ?? ''}`.trim()

        await db.transactions.add({
          id: generateUUID(),
          date: data.date,
          time: currentTime,
          type: 'expense',
          category: 'Transfer',
          amount: data.amount,
          accountId: data.fromAccountId,
          description: note,
          isRecurring: false,
        } as any)
        await db.transactions.add({
          id: generateUUID(),
          date: data.date,
          time: currentTime,
          type: 'income',
          category: 'Transfer',
          amount: data.amount,
          accountId: data.toAccountId,
          description: note,
          isRecurring: false,
        } as any)

        if (from) {
          const nb = from.balance - data.amount
          await db.accounts.update(from.id, { balance: nb })
          await syncAssetBalance(from.name, nb)
        }
        if (to) {
          const nb = to.balance + data.amount
          await db.accounts.update(to.id, { balance: nb })
          await syncAssetBalance(to.name, nb)
        }

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'transaction',
          description: `Transfer ${from?.name ?? ''} → ${to?.name ?? ''} (${formatCurrency(data.amount)})`,
        } as any)
      })
      flashSaved()
    } catch (err) {
      console.error('Error saving transfer:', err)
    }
  }

  const onLendingSubmit = async (data: any) => {
    try {
      await db.lending.add({
        id: generateUUID(), contactName: data.contactName, type: 'lent', amount: data.amount,
        interestRate: data.interestRate, interestType: data.interestType,
        expectedRepaymentDate: data.expectedRepaymentDate || '', status: 'active',
        createdAt: new Date().toISOString(), description: data.description,
      } as any)
      flashSaved()
    } catch (err) { console.error('Error saving lending:', err) }
  }

  const onAssetSubmit = async (data: any) => {
    try {
      await db.assets.add({
        id: generateUUID(), name: data.name, type: data.type, balance: data.balance,
        valuationHistory: [{ date: new Date().toISOString().split('T')[0], value: data.balance }],
      } as any)
      await syncAccountToAsset(data.name, data.balance)
      flashSaved()
    } catch (err) { console.error('Error saving asset:', err) }
  }

  const onBillSubmit = async (data: any) => {
    try {
      await db.bills.add({
        id: generateUUID(), title: data.title, amount: data.amount, dueDate: data.dueDate,
        category: data.category, isPaid: false, isRecurring: data.isRecurring, recurrenceRule: undefined,
      } as any)
      flashSaved()
    } catch (err) { console.error('Error saving bill:', err) }
  }

  const onGoalSubmit = async (data: any) => {
    try {
      await db.goals.add({
        id: generateUUID(), title: data.title, targetAmount: data.targetAmount,
        currentAmount: data.currentAmount, targetDate: data.targetDate, category: data.category,
      } as any)
      flashSaved()
    } catch (err) { console.error('Error saving goal:', err) }
  }

  const onPlannedSubmit = async (draft: PlannedPaymentDraft) => {
    try {
      await PlannedPaymentService.create(draft)
      // Close the modal and take the user to their planned cash flow.
      handleClose()
      onNavigateToTab?.('plannedpayments')
    } catch (err) {
      console.error('Error saving planned payment:', err)
    }
  }

  const primaryForm = primary === 'expense' ? expenseForm : primary === 'income' ? incomeForm : transferForm
  const primarySubmit = primary === 'expense' ? onExpenseSubmit : primary === 'income' ? onIncomeSubmit : onTransferSubmit

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-full h-[100dvh] sm:h-[90vh] sm:max-h-[860px] overflow-hidden p-0 rounded-none sm:rounded-3xl flex flex-col bg-background">
        <DialogHeader>
          <DialogClose className="hidden" />
        </DialogHeader>

        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-1 flex-col items-center justify-center gap-3 px-6"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-[16px] font-semibold text-foreground">Saved</p>
              <p className="text-[13px] text-muted-foreground text-center">Your {mode} has been recorded</p>
            </motion.div>
          ) : step === 'transaction' ? (
            <TransactionScreen
              key="transaction"
              primary={primary}
              setPrimary={setPrimary}
              form={primaryForm}
              onSubmit={primarySubmit}
              accounts={accounts}
              onBack={handleClose}
              onMore={() => setStep('select')}
              onNavigateToTab={onNavigateToTab}
            />
          ) : step === 'select' ? (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 overflow-y-auto px-6 pt-5 pb-8 space-y-6"
            >
              <div className="flex items-center gap-3">
                <button onClick={() => setStep('transaction')} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-[22px] font-bold text-foreground tracking-tight leading-tight">More to add</h2>
                  <p className="text-[13px] text-muted-foreground">Track more than just transactions</p>
                </div>
              </div>

              <div className="space-y-3">
                {MORE_TO_ADD.map((item, i) => {
                  const Icon = item.icon
                  return (
                    <motion.button
                      key={item.key}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, type: 'spring', stiffness: 380, damping: 30 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => item.key === 'planned' ? setStep('planned') : handleModeSelect(item.key)}
                      className="group relative w-full flex items-center gap-4 p-4 rounded-[1.4rem] bg-card border border-border/60 overflow-hidden text-left transition-all hover:border-transparent hover:shadow-card"
                    >
                      {/* Soft gradient glow that reveals on hover */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: `linear-gradient(120deg, ${item.color}1f, transparent 70%)` }}
                      />
                      {/* Accent edge */}
                      <span aria-hidden className="absolute left-0 top-3 bottom-3 w-1 rounded-full" style={{ backgroundColor: item.color }} />

                      {/* Icon tile */}
                      <span
                        className="relative flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm"
                        style={{ background: `linear-gradient(145deg, ${item.color}2e, ${item.color}14)` }}
                      >
                        <Icon className="w-[22px] h-[22px]" strokeWidth={2.1} style={{ color: item.color }} />
                      </span>

                      {/* Text */}
                      <span className="relative flex-1 min-w-0">
                        <span className="block text-[15px] font-bold text-foreground">{item.label}</span>
                        <span className="block text-[12px] text-muted-foreground leading-snug mt-0.5">{item.desc}</span>
                      </span>

                      <ChevronRight className="relative w-5 h-5 text-muted-foreground/60 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          ) : step === 'planned' ? (
            <PlannedPaymentForm
              key="planned"
              onBack={() => setStep('select')}
              onSave={onPlannedSubmit}
              onNavigateToTab={onNavigateToTab}
            />
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 overflow-y-auto px-6 pt-5 pb-10 space-y-5"
            >
              <div className="flex items-center gap-3 mb-1">
                <button onClick={() => setStep('select')} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h3 className="text-[17px] font-semibold text-foreground">Add {MODE_CONFIG[mode as keyof typeof MODE_CONFIG]?.label}</h3>
              </div>

              {mode === 'lending' && <LendingForm form={lendingForm} onSubmit={onLendingSubmit} />}
              {mode === 'asset' && <AssetForm form={assetForm} onSubmit={onAssetSubmit} />}
              {mode === 'bill' && <BillForm form={billForm} onSubmit={onBillSubmit} />}
              {mode === 'goal' && <GoalForm form={goalForm} onSubmit={onGoalSubmit} />}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

/** Keep any matching asset's balance in sync with an account balance change. */
async function syncAssetBalance(accountName: string, newBalance: number) {
  const matchingAsset = await db.assets.where('name').equalsIgnoreCase(accountName).first()
  if (!matchingAsset) return
  const todayStr = new Date().toISOString().split('T')[0]
  const updatedHistory = [...matchingAsset.valuationHistory]
  const existingIndex = updatedHistory.findIndex(v => v.date === todayStr)
  if (existingIndex >= 0) updatedHistory[existingIndex].value = newBalance
  else updatedHistory.push({ date: todayStr, value: newBalance })
  await db.assets.update(matchingAsset.id, { balance: newBalance, valuationHistory: updatedHistory })
}

/* ------------------------------------------------------------------ *
 * Primary transaction screen (Expense / Income / Transfer)
 * Matches the reference UI: header, segmented tabs, date/time row,
 * big amount field, row-style selects, "Other details", floating save.
 * ------------------------------------------------------------------ */
function TransactionScreen({ primary, setPrimary, form, onSubmit, accounts, onBack, onMore, onNavigateToTab }: {
  primary: PrimaryMode
  setPrimary: (m: PrimaryMode) => void
  form: any
  onSubmit: (data: any) => void
  accounts: any[]
  onBack: () => void
  onMore: () => void
  onNavigateToTab?: (tab: string) => void
}) {
  const accent = PRIMARY_ACCENTS[primary]
  const [clockOpen, setClockOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const [categorySheetOpen, setCategorySheetOpen] = useState(false)
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false)
  const [fromSheetOpen, setFromSheetOpen] = useState(false)
  const [toSheetOpen, setToSheetOpen] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const currency = getCurrencySymbol()

  // Saved tags from the DB, merged with the built-in suggestions (no dupes).
  // `createdAt` is not an indexed key on the tags store, so we fetch all and
  // sort in memory (orderBy on an unindexed key throws a Dexie SchemaError).
  const savedTags = useLiveQuery(
    async () => {
      const all = await db.tags.toArray()
      return all.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    },
    [],
  ) || []
  // Suggested (built-in) tags the user has dismissed. Persisted so they stay
  // hidden across sessions, since there is no DB record to delete for them.
  const [hiddenSuggested, setHiddenSuggested] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('hiddenSuggestedTags') || '[]') }
    catch { return [] }
  })
  const tagOptions = React.useMemo(() => {
    const hidden = new Set(hiddenSuggested.map(t => t.toLowerCase()))
    const seen = new Set<string>()
    const list: string[] = []
    for (const t of SUGGESTED_TAGS) {
      const key = t.toLowerCase()
      if (hidden.has(key) || seen.has(key)) continue
      seen.add(key); list.push(t)
    }
    for (const t of savedTags.map(s => s.name)) {
      const key = t.toLowerCase()
      if (!seen.has(key)) { seen.add(key); list.push(t) }
    }
    return list
  }, [savedTags, hiddenSuggested])

  const date = form.watch('date') || ''
  const time = form.watch('time') || ''

  // Reset local state when switching tabs so stale tags/receipts don't leak over
  useEffect(() => { setTags([]); setReceiptPreview(null) }, [primary])

  // Tag the user is being asked to confirm deletion for (null = none).
  const [tagToDelete, setTagToDelete] = useState<string | null>(null)

  const toggleTag = (t: string) => {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  // Every tag can be removed: DB tags are deleted from the DB, built-in
  // suggested tags are hidden via a persisted dismiss list.
  const isDeletable = (_t: string) => true

  const deleteTag = async (t: string) => {
    const match = savedTags.find(s => s.name === t)
    if (match) {
      try { await db.tags.delete(match.id) }
      catch (err) { console.error('Error deleting tag:', err) }
    } else {
      // A built-in suggested tag: remember it as dismissed so it stays hidden.
      setHiddenSuggested(prev => {
        if (prev.some(x => x.toLowerCase() === t.toLowerCase())) return prev
        const next = [...prev, t]
        try { localStorage.setItem('hiddenSuggestedTags', JSON.stringify(next)) }
        catch { /* ignore */ }
        return next
      })
    }
    // Drop it from the current selection too
    setTags(prev => prev.filter(x => x !== t))
    setTagToDelete(null)
  }

  const createTag = async () => {
    const name = newTag.trim()
    if (!name) return
    // Reuse an existing option (case-insensitive) rather than duplicating it
    const existing = tagOptions.find(t => t.toLowerCase() === name.toLowerCase())
    const label = existing ?? name
    if (!existing) {
      try {
        await db.tags.add({
          id: generateUUID(),
          name,
          color: accent.color,
          createdAt: new Date().toISOString(),
        } as any)
      } catch (err) {
        console.error('Error adding tag:', err)
      }
    }
    setTags(prev => prev.includes(label) ? prev : [...prev, label])
    setNewTag('')
  }

  const handleReceiptAttach = async () => {
    const { compressImageToBase64 } = await import('@/lib/receipt-utils')
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try { setReceiptPreview(await compressImageToBase64(file)) }
      catch (err) { console.error('Receipt compression failed:', err) }
    }
    input.click()
  }

  const formatDate = (d: string) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Select date'

  const formatTime = (t: string) => {
    if (!t) return 'Set time'
    const [h, m] = t.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return 'Set time'
    const hr12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${hr12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  const submit = form.handleSubmit((data: any) =>
    onSubmit({ ...data, tags: tags.length ? tags : undefined, receiptImage: receiptPreview })
  )

  const amountError = form.formState.errors.amount?.message as string | undefined

  return (
    <motion.div
      key="transaction"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="relative flex flex-1 flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-colors" aria-label="Close">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-[20px] font-bold text-foreground tracking-tight">Add transaction</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-32">
        {/* Segmented tabs */}
        <div className="grid grid-cols-3 rounded-full bg-secondary/70 p-1 mb-6">
          {(['expense', 'income', 'transfer'] as PrimaryMode[]).map((t) => {
            const active = primary === t
            return (
              <button
                key={t}
                onClick={() => setPrimary(t)}
                className={cn(
                  'relative h-10 rounded-full text-[14px] font-semibold capitalize transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tx-tab"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-background shadow-sm"
                  />
                )}
                <span className="relative z-10">{t}</span>
              </button>
            )
          })}
        </div>

        {/* Date + Time row */}
        <div className="flex items-center justify-between mb-6">
          <button type="button" onClick={() => setDateOpen(true)} className="flex items-center gap-2.5">
            <span className="w-6 flex justify-center" style={{ color: accent.color }}><Calendar className="w-[22px] h-[22px]" /></span>
            <span className="text-[17px] font-semibold text-foreground">{formatDate(date)}</span>
          </button>
          <button
            type="button"
            onClick={() => setClockOpen(true)}
            className="flex items-center gap-2.5"
          >
            <span className="w-6 flex justify-center" style={{ color: accent.color }}><Clock className="w-[22px] h-[22px]" /></span>
            <span className="text-[17px] font-semibold text-foreground">{formatTime(time)}</span>
          </button>
        </div>

        {/* Amount */}
        <div className="flex items-start gap-3 mb-6">
          <span className="mt-2 text-[22px] font-bold" style={{ color: accent.color }}>{currency}</span>
          <div className="flex-1">
            <p className="text-[12px] text-muted-foreground mb-0.5">Amount</p>
            <BigAmountInput
              value={form.watch('amount') || ''}
              onChange={(v) => form.setValue('amount', v, { shouldValidate: true })}
            />
            {amountError && <p className="text-[12px] text-destructive mt-1">{amountError}</p>}
          </div>
          <button
            type="button"
            onClick={() => setCalcOpen(true)}
            className="mt-1 w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            aria-label="Open calculator"
          >
            <Calculator className="w-5 h-5" />
          </button>
        </div>

        {/* Category / From-To rows — tapping opens a full bottom sheet */}
        {primary === 'transfer' ? (
          <>
            <FieldRow icon={Wallet} accent={accent.color} label="From" error={form.formState.errors.fromAccountId?.message as string}>
              <SheetTrigger
                placeholder="Select account"
                value={accounts.find((a: any) => a.id === form.watch('fromAccountId'))?.name}
                onClick={() => setFromSheetOpen(true)}
              />
            </FieldRow>
            <FieldRow icon={Wallet} accent={accent.color} label="To" error={form.formState.errors.toAccountId?.message as string}>
              <SheetTrigger
                placeholder="Select account"
                value={accounts.find((a: any) => a.id === form.watch('toAccountId'))?.name}
                onClick={() => setToSheetOpen(true)}
              />
            </FieldRow>
          </>
        ) : (
          <>
            <FieldRow icon={primary === 'income' ? Wallet : Utensils} accent={accent.color} label="Category" error={form.formState.errors.category?.message as string}>
              <SheetTrigger
                placeholder="Select category"
                value={form.watch('category')}
                icon={form.watch('category')
                  ? <CategoryIcon name={form.watch('category')} type={primary === 'income' ? 'income' : 'expense'} size={24} iconSize={13} />
                  : undefined}
                onClick={() => setCategorySheetOpen(true)}
              />
            </FieldRow>
            <FieldRow icon={Wallet} accent={accent.color} label="Payment mode" error={form.formState.errors.accountId?.message as string}>
              <SheetTrigger
                placeholder="Select account"
                value={accounts.find((a: any) => a.id === form.watch('accountId'))?.name}
                onClick={() => setPaymentSheetOpen(true)}
              />
            </FieldRow>
          </>
        )}

        {/* Other details */}
        <h3 className="text-[16px] font-bold text-foreground mt-8 mb-4">Other details</h3>

        <div className="flex items-center gap-3 mb-5">
          <AlignLeft className="w-5 h-5 flex-shrink-0" style={{ color: accent.color }} />
          <input
            {...form.register('description')}
            placeholder="Write a note"
            className="flex-1 bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        <div className="mb-5">
          <div className="flex items-center gap-3 mb-3">
            <Hash className="w-5 h-5 flex-shrink-0" style={{ color: accent.color }} />
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); createTag() }
              }}
              placeholder="Add tags"
              className="flex-1 bg-transparent text-[13px] font-semibold text-foreground placeholder:text-muted-foreground placeholder:font-normal focus:outline-none"
            />
            {newTag.trim() && (
              <button
                type="button"
                onClick={createTag}
                className="h-8 px-3 rounded-full text-[13px] font-semibold text-background flex-shrink-0"
                style={{ backgroundColor: accent.color }}
              >
                Add
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-8">
            {tagOptions.map((t) => (
              <TagChip
                key={t}
                label={t}
                selected={tags.includes(t)}
                accent={accent}
                deletable={isDeletable(t)}
                onToggle={() => toggleTag(t)}
                onLongPress={() => setTagToDelete(t)}
              />
            ))}
          </div>
          <p className="pl-8 mt-2 text-[11px] text-muted-foreground/70">Type a tag (emojis ok) and press Enter · tap to select · long-press to delete</p>
        </div>

        {/* Delete-tag confirmation */}
        <AnimatePresence>
          {tagToDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10001] flex items-center justify-center p-6"
            >
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setTagToDelete(null)} />
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative w-full max-w-[300px] rounded-3xl bg-card border border-border p-5 shadow-elevated"
              >
                <p className="text-[15px] font-semibold text-foreground">Delete tag?</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Remove <span className="font-semibold text-foreground">{tagToDelete}</span> from your saved tags.
                </p>
                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setTagToDelete(null)}
                    className="text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTag(tagToDelete)}
                    className="h-9 px-4 rounded-full bg-destructive text-destructive-foreground text-[13px] font-semibold active:scale-[0.97] transition-transform"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <button type="button" onClick={handleReceiptAttach} className="flex items-center gap-3 w-full">
          <Paperclip className="w-5 h-5 flex-shrink-0" style={{ color: accent.color }} />
          <span className="flex-1 text-left text-[16px] text-muted-foreground">
            {receiptPreview ? 'Attachment added' : 'Add attachment'}
          </span>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
        {receiptPreview && (
          <div className="mt-3 ml-8 flex items-center gap-3">
            <img src={receiptPreview} alt="Attachment" className="w-14 h-14 rounded-lg object-cover border border-border/40" />
            <button type="button" onClick={() => setReceiptPreview(null)} className="text-[12px] font-semibold text-destructive">Remove</button>
          </div>
        )}

        {/* More record types */}
        <button type="button" onClick={onMore} className="mt-8 text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
          + Add lending, asset, bill or goal
        </button>
      </div>

      {/* Floating save FAB */}
      <button
        type="button"
        onClick={submit}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center shadow-xl active:scale-95 transition-transform"
        aria-label="Save transaction"
      >
        <Save className="w-6 h-6" />
      </button>

      {/* Calendar date picker */}
      <CalendarDatePicker
        open={dateOpen}
        value={date}
        accent={accent.color}
        onConfirm={(d) => { form.setValue('date', d, { shouldValidate: true }); setDateOpen(false) }}
        onCancel={() => setDateOpen(false)}
      />

      {/* Clock time picker */}
      <ClockTimePicker
        open={clockOpen}
        value={time}
        accent={accent.color}
        onConfirm={(t) => { form.setValue('time', t, { shouldValidate: true }); setClockOpen(false) }}
        onCancel={() => setClockOpen(false)}
      />

      {/* Calculator */}
      <CalculatorSheet
        open={calcOpen}
        initialValue={String(form.watch('amount') || '')}
        onCancel={() => setCalcOpen(false)}
        onDone={(value) => {
          form.setValue('amount', value, { shouldValidate: true })
          setCalcOpen(false)
        }}
      />

      {/* Category picker — full bottom sheet */}
      <CategorySheet
        open={categorySheetOpen}
        type={primary === 'income' ? 'income' : 'expense'}
        value={form.watch('category') || ''}
        onClose={() => setCategorySheetOpen(false)}
        onSelect={(v) => { form.setValue('category', v, { shouldValidate: true }); setCategorySheetOpen(false) }}
      />

      {/* Payment mode picker — full bottom sheet */}
      <PaymentModeSheet
        open={paymentSheetOpen}
        accounts={accounts}
        value={form.watch('accountId') || ''}
        onClose={() => setPaymentSheetOpen(false)}
        onSelect={(v) => { form.setValue('accountId', v, { shouldValidate: true }); setPaymentSheetOpen(false) }}
        onManage={() => { setPaymentSheetOpen(false); onNavigateToTab?.('accounts') }}
      />

      {/* Transfer from/to pickers */}
      <PaymentModeSheet
        open={fromSheetOpen}
        title="From account"
        accounts={accounts}
        value={form.watch('fromAccountId') || ''}
        onClose={() => setFromSheetOpen(false)}
        onSelect={(v) => { form.setValue('fromAccountId', v, { shouldValidate: true }); setFromSheetOpen(false) }}
        onManage={() => { setFromSheetOpen(false); onNavigateToTab?.('accounts') }}
      />
      <PaymentModeSheet
        open={toSheetOpen}
        title="To account"
        accounts={accounts}
        value={form.watch('toAccountId') || ''}
        onClose={() => setToSheetOpen(false)}
        onSelect={(v) => { form.setValue('toAccountId', v, { shouldValidate: true }); setToSheetOpen(false) }}
        onManage={() => { setToSheetOpen(false); onNavigateToTab?.('accounts') }}
      />
    </motion.div>
  )
}

/** Selectable tag chip with a round checkbox and long-press-to-delete. */
export function TagChip({ label, selected, accent, deletable, onToggle, onLongPress }: {
  label: string
  selected: boolean
  accent: { color: string; soft: string }
  deletable: boolean
  onToggle: () => void
  onLongPress: () => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const clear = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  const startPress = () => {
    if (!deletable) return
    firedRef.current = false
    clear()
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      onLongPress()
    }, 500)
  }

  const endPress = () => {
    clear()
  }

  const handleClick = () => {
    // Ignore the click that follows a long-press so we don't also toggle.
    if (firedRef.current) { firedRef.current = false; return }
    onToggle()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onContextMenu={(e) => { if (deletable) { e.preventDefault(); firedRef.current = true; onLongPress() } }}
      className={cn(
        'flex items-center gap-1.5 pl-2 pr-3.5 py-1.5 rounded-full text-[13px] font-semibold border-[1.5px] transition-colors select-none',
        selected ? 'text-foreground' : 'text-foreground/80'
      )}
      style={selected
        ? { backgroundColor: accent.soft, borderColor: accent.color }
        : { backgroundColor: accent.soft, borderColor: `${accent.color}66` }}
    >
      {/* Round checkbox */}
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] transition-colors',
          selected ? 'border-transparent text-white' : ''
        )}
        style={selected
          ? { backgroundColor: accent.color }
          : { borderColor: accent.color }}
      >
        {selected && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
      </span>
      {label}
    </button>
  )
}

/** Large, borderless numeric amount input (the "0" in the reference). */
/**
 * Safely evaluate a simple arithmetic expression (digits, . + - * / and
 * parentheses only). Returns the numeric result rounded to 2 decimals, or
 * null if the expression is invalid. No eval() — a tiny shunting-yard parser.
 */
export function evaluateAmount(expr: string): number | null {
  const clean = expr.replace(/\s+/g, '')
  if (!clean || !/^[0-9.+\-*/()]+$/.test(clean)) return null
  try {
    const tokens = clean.match(/(\d+\.?\d*|[+\-*/()])/g)
    if (!tokens) return null
    const out: (number | string)[] = []
    const ops: string[] = []
    const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }
    for (const t of tokens) {
      if (/^\d/.test(t)) out.push(parseFloat(t))
      else if (t === '(') ops.push(t)
      else if (t === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()!)
        ops.pop()
      } else {
        while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop()!)
        ops.push(t)
      }
    }
    while (ops.length) out.push(ops.pop()!)
    const st: number[] = []
    for (const tok of out) {
      if (typeof tok === 'number') st.push(tok)
      else {
        const b = st.pop(); const a = st.pop()
        if (a === undefined || b === undefined) return null
        st.push(tok === '+' ? a + b : tok === '-' ? a - b : tok === '*' ? a * b : a / b)
      }
    }
    const result = st[0]
    if (st.length !== 1 || !isFinite(result)) return null
    return Math.round(result * 100) / 100
  } catch {
    return null
  }
}

/** A single calculator key. `variant` controls the background style. */
function CalcKey({
  label,
  onClick,
  variant = 'default',
}: {
  label: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'muted' | 'accent'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center text-[24px] font-semibold select-none active:scale-95 transition-transform',
        variant === 'muted' ? 'bg-secondary/40 text-foreground' : 'text-foreground',
      )}
      style={variant === 'accent' ? { backgroundColor: '#ffffff', color: '#000' } : undefined}
    >
      {label}
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Full on-screen calculator keypad (bottom sheet)
 * Supports: digits, decimal, + - × ÷, %, backspace, clear, and =.
 * The running expression is evaluated live so "Done" always returns a
 * clean numeric string ready for the amount field.
 * ------------------------------------------------------------------ */
export function CalculatorSheet({
  open,
  initialValue,
  onCancel,
  onDone,
}: {
  open: boolean
  initialValue: string
  onCancel: () => void
  onDone: (value: string) => void
}) {
  // `expr` is the raw expression string (e.g. "200+50*2"). It only ever
  // contains digits, a single leading-safe decimal per number, and operators.
  const [expr, setExpr] = useState('')

  // Seed the keypad with whatever is already in the amount field each time
  // the sheet is opened. Tracking the previous `open` flag lets us run the
  // seed exactly on the open transition without a setState-in-effect warning.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setExpr(String(initialValue ?? '').replace(/[^0-9.+\-*/%]/g, ''))
    }
    wasOpen.current = open
  }, [open, initialValue])

  // Live preview of the evaluated result (null while the expression is
  // incomplete, e.g. trailing operator).
  const preview = evaluateAmount(expr.replace(/%/g, '/100'))
  const display = expr === '' ? '0' : expr
  const endsWithOperator = /[+\-*/]$/.test(expr)

  const press = (key: string) => {
    setExpr((prev) => {
      switch (key) {
        case 'C':
          return ''
        case 'back':
          return prev.slice(0, -1)
        case '%':
          // Append a percent marker only after a number.
          return /[0-9]$/.test(prev) ? prev + '%' : prev
        case '+':
        case '-':
        case '*':
        case '/':
          if (prev === '') return key === '-' ? '-' : prev
          // Replace a trailing operator instead of stacking them.
          return /[+\-*/]$/.test(prev) ? prev.slice(0, -1) + key : prev + key
        case '.': {
          // Prevent a second decimal point within the current number.
          const currentNumber = prev.split(/[+\-*/]/).pop() || ''
          if (currentNumber.includes('.')) return prev
          return currentNumber === '' ? prev + '0.' : prev + '.'
        }
        case '=': {
          const result = evaluateAmount(prev.replace(/%/g, '/100'))
          return result !== null ? String(result) : prev
        }
        default:
          return prev + key
      }
    })
  }

  const handleDone = () => {
    const result = evaluateAmount(expr.replace(/%/g, '/100'))
    if (result !== null && result >= 0) onDone(String(result))
    else if (expr === '') onDone('')
    else onCancel()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex flex-col justify-end bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            className="rounded-t-3xl bg-background overflow-hidden"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-1.5 rounded-full bg-secondary text-[15px] font-semibold text-foreground active:scale-95 transition-transform"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDone}
                className="px-4 py-1.5 rounded-full text-[15px] font-semibold text-foreground active:scale-95 transition-transform"
              >
                Done
              </button>
            </div>

            {/* Display */}
            <div className="px-6 pb-3 pt-2 text-right">
              <div className="text-[44px] leading-none font-bold text-foreground truncate">{display}</div>
              <div className="mt-1 text-[16px] text-muted-foreground h-5">
                {preview !== null && !endsWithOperator ? preview : ''}
              </div>
            </div>

            {/* Keypad: 4 columns. Last column holds the operators. */}
            <div className="grid grid-cols-4 gap-px bg-border/40 [&>button]:h-16">
              <CalcKey label="C" variant="muted" onClick={() => press('C')} />
              <CalcKey label={<ArrowLeft className="w-6 h-6" />} variant="muted" onClick={() => press('back')} />
              <CalcKey label="%" variant="muted" onClick={() => press('%')} />
              <CalcKey label="÷" variant="accent" onClick={() => press('/')} />

              <CalcKey label="7" onClick={() => press('7')} />
              <CalcKey label="8" onClick={() => press('8')} />
              <CalcKey label="9" onClick={() => press('9')} />
              <CalcKey label="×" variant="accent" onClick={() => press('*')} />

              <CalcKey label="4" onClick={() => press('4')} />
              <CalcKey label="5" onClick={() => press('5')} />
              <CalcKey label="6" onClick={() => press('6')} />
              <CalcKey label="−" variant="accent" onClick={() => press('-')} />

              <CalcKey label="1" onClick={() => press('1')} />
              <CalcKey label="2" onClick={() => press('2')} />
              <CalcKey label="3" onClick={() => press('3')} />
              <CalcKey label="+" variant="accent" onClick={() => press('+')} />

              <CalcKey label="00" onClick={() => press('00')} />
              <CalcKey label="0" onClick={() => press('0')} />
              <CalcKey label="." onClick={() => press('.')} />
              <CalcKey label="=" variant="accent" onClick={() => press('=')} />
            </div>
            <div className="h-[env(safe-area-inset-bottom)] bg-background" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Large, borderless numeric amount input. Accepts basic math (e.g. 200+50*2). */
export function BigAmountInput({ value, onChange }: { value: string | number; onChange: (v: string) => void }) {
  const display = String(value ?? '')
  return (
    <input
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        // Allow digits, one-level decimals, and arithmetic operators so the
        // calculator button has something to evaluate.
        const raw = e.target.value.replace(/[^0-9.+\-*/()]/g, '')
        onChange(raw)
      }}
      placeholder="0"
      className="w-full bg-transparent text-[30px] font-bold text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
    />
  )
}

/** Row-style field: left icon, label on top, inline control, chevron. */
export function FieldRow({ icon: Icon, accent, label, error, children }: {
  icon: React.ElementType
  accent: string
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/40">
      <Icon className="w-6 h-6 flex-shrink-0 mt-1.5" style={{ color: accent }} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-muted-foreground mb-0.5">{label}</p>
        {children}
        {error && <p className="text-[12px] text-destructive mt-1">{error}</p>}
      </div>
    </div>
  )
}

/** Tappable row that shows the selected value (or placeholder) + chevron. */
export function SheetTrigger({ value, placeholder, icon, onClick }: {
  value?: string
  placeholder: string
  icon?: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 text-left"
    >
      <span className="flex items-center gap-2 min-w-0">
        {icon}
        <span className={cn('truncate text-[16px] font-semibold', value ? 'text-foreground' : 'text-muted-foreground')}>
          {value || placeholder}
        </span>
      </span>
      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Shared full-height bottom sheet shell (frame-width on desktop)
 * ------------------------------------------------------------------ */
function FullSheet({ open, title, onClose, headerAction, children }: {
  open: boolean
  title: string
  onClose: () => void
  headerAction?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[10000]" onClick={onClose}
          />
          <div className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="pointer-events-auto w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl flex flex-col h-[88vh] sm:h-[80vh]"
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h3 className="text-[18px] font-bold text-foreground">{title}</h3>
                <div className="flex items-center gap-2">
                  {headerAction}
                  <button onClick={onClose} className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center" aria-label="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-6">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ *
 * Category picker — full bottom sheet with search + grid
 * ------------------------------------------------------------------ */
export function CategorySheet({ open, type, value, onClose, onSelect }: {
  open: boolean
  type: 'expense' | 'income'
  value: string
  onClose: () => void
  onSelect: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  const customCategories = useLiveQuery(
    () => db.customCategories.where('type').equals(type).toArray(),
    [type],
  ) ?? []

  const categories = React.useMemo(() => {
    const defaults = type === 'income' ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES
    const customNames = customCategories.map(c => c.name.toLowerCase())
    const list: { name: string; isCustom: boolean; icon?: string; color?: string }[] = []
    defaults.forEach(name => {
      if (!customNames.includes(name.toLowerCase())) list.push({ name, isCustom: false })
    })
    customCategories.forEach(c => list.push({ name: c.name, isCustom: true, icon: c.icon, color: c.color }))
    return list
  }, [customCategories, type])

  const filtered = query.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : categories

  return (
    <FullSheet open={open} title="Select category" onClose={onClose}>
      <div className="flex items-center gap-2 h-11 px-3 rounded-2xl bg-secondary border border-border/50 mb-4">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search"
          className="flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {filtered.map(cat => (
          <button
            key={cat.name}
            type="button"
            onClick={() => onSelect(cat.name)}
            className={cn(
              'flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl transition-colors',
              cat.name === value ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-secondary/60'
            )}
          >
            <CategoryIcon name={cat.name} type={type} isCustom={cat.isCustom} icon={cat.icon} color={cat.color} size={46} />
            <span className="text-[10px] font-medium text-foreground text-center leading-tight line-clamp-2">{cat.name}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-4 text-center text-[13px] text-muted-foreground py-8">No categories found.</p>
        )}
      </div>
    </FullSheet>
  )
}

/* ------------------------------------------------------------------ *
 * Payment mode picker — full bottom sheet (image 4 style)
 * ------------------------------------------------------------------ */
export function PaymentModeSheet({ open, title = 'Select payment mode', accounts, value, onClose, onSelect, onManage }: {
  open: boolean
  title?: string
  accounts: any[]
  value: string
  onClose: () => void
  onSelect: (id: string) => void
  /** Optional: jump to the full Accounts tab. The pencil icon only shows when provided. */
  onManage?: () => void
}) {
  const typeColors: Record<string, string> = {
    bank: 'bg-blue-500/12 text-blue-600',
    cash: 'bg-emerald-500/12 text-emerald-600',
    card: 'bg-purple-500/12 text-purple-600',
    investment: 'bg-amber-500/12 text-amber-600',
    crypto: 'bg-orange-500/12 text-orange-600',
  }

  // Add-account happens inline so the user never leaves the transaction they
  // were in the middle of entering. On create we auto-select the new account
  // and close the add sheet, dropping them right back into the picker.
  const [addOpen, setAddOpen] = useState(false)

  return (
    <FullSheet
      open={open}
      title={title}
      onClose={onClose}
      headerAction={
        onManage ? (
          <button
            onClick={onManage}
            className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-foreground"
            aria-label="Manage accounts"
          >
            <Pencil className="w-[15px] h-[15px]" />
          </button>
        ) : undefined
      }
    >
      <div className="space-y-2">
        {accounts.length > 0 ? (
          accounts.map((acc: any) => {
            const sel = acc.id === value
            const initials = acc.name.slice(0, 2).toUpperCase()
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => onSelect(acc.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors border',
                  sel ? 'border-primary/50 bg-primary/5' : 'border-border/50 bg-secondary/30 hover:bg-secondary/50'
                )}
              >
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border-2 flex-shrink-0',
                  sel ? 'border-primary' : 'border-border')}>
                  {sel && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </span>
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-bold flex-shrink-0', typeColors[acc.type] || 'bg-secondary text-muted-foreground')}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-foreground truncate">{acc.name}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{acc.type}</p>
                </div>
                <p className="text-[15px] font-bold text-foreground flex-shrink-0">{formatCurrency(acc.balance)}</p>
              </button>
            )
          })
        ) : (
          <div className="text-center py-8">
            <Wallet className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-[13px] text-muted-foreground">No accounts yet.</p>
          </div>
        )}

        {/* Add new account — opens inline, keeps the transaction in progress */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex w-full items-center gap-2 rounded-2xl p-3.5 text-[14px] font-semibold text-primary hover:bg-primary/5 transition-colors border border-dashed border-primary/40 mt-1"
        >
          <Plus className="w-4 h-4" />
          Add new account
        </button>
      </div>

      {/* Inline add-account bottom sheet (reused from the Accounts tab). On
          create we auto-select the freshly added account so the user can carry
          straight on with the expense/income they were entering. */}
      <AnimatePresence>
        {addOpen && (
          <AddAccountSheet
            key="quick-add-account"
            editingId={null}
            accounts={accounts}
            onClose={() => setAddOpen(false)}
            onCreated={(id) => onSelect(id)}
          />
        )}
      </AnimatePresence>
    </FullSheet>
  )
}

/* ------------------------------------------------------------------ *
 * Secondary record forms (lending / asset / bill / goal)
 * ------------------------------------------------------------------ */
function LendingForm({ form, onSubmit }: any) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Name</label>
        <Input placeholder="Friend's name" {...form.register('contactName')} className="mt-1" />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Amount</label>
        <AmountInput value={form.watch('amount') || ''} onChange={(val) => form.setValue('amount', val, { shouldValidate: true })} placeholder="0" className="mt-1 text-lg" />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Interest Rate (%)</label>
        <Input type="number" placeholder="0" {...form.register('interestRate')} className="mt-1" step="0.1" />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Interest Type</label>
        <Select value={form.watch('interestType')} onChange={(e) => form.setValue('interestType', e.target.value, { shouldValidate: true })}>
          <option value="none">None</option>
          <option value="simple">Simple</option>
          <option value="compound">Compound</option>
        </Select>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Expected Repayment</label>
        <DatePicker value={form.watch('expectedRepaymentDate') || ''} onChange={(d) => form.setValue('expectedRepaymentDate', d)} className="mt-1" />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Notes</label>
        <Input placeholder="Optional notes" {...form.register('description')} className="mt-1" />
      </div>
      <Button type="submit" className="w-full">Save Lending</Button>
    </form>
  )
}

function AssetForm({ form, onSubmit }: any) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Asset Name</label>
        <Input placeholder="e.g., Apple Stock" {...form.register('name')} className="mt-1" />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Type</label>
        <Select value={form.watch('type')} onChange={(e) => form.setValue('type', e.target.value, { shouldValidate: true })}>
          <option value="bank">Bank Account</option>
          <option value="cash">Cash</option>
          <option value="stock">Stock</option>
          <option value="crypto">Crypto</option>
          <option value="real_estate">Real Estate</option>
          <option value="gold">Gold</option>
        </Select>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Current Value</label>
        <Input type="number" placeholder="0.00" {...form.register('balance')} className="mt-1 text-lg" step="0.01" />
      </div>
      <Button type="submit" className="w-full">Save Asset</Button>
    </form>
  )
}

function BillForm({ form, onSubmit }: any) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Bill Name</label>
        <Input placeholder="e.g., Netflix Subscription" {...form.register('title')} className="mt-2" />
        {form.formState.errors.title && <p className="text-xs text-destructive mt-1">{form.formState.errors.title.message}</p>}
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Amount</label>
        <AmountInput value={form.watch('amount') || ''} onChange={(val) => form.setValue('amount', val, { shouldValidate: true })} placeholder="0" className="mt-2 text-lg" />
        {form.formState.errors.amount && <p className="text-xs text-destructive mt-1">{form.formState.errors.amount.message}</p>}
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Category</label>
        <CategorySelect type="bill" value={form.watch('category') || ''} onChange={(val) => form.setValue('category', val, { shouldValidate: true })} placeholder="Select Category" error={form.formState.errors.category?.message} />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Due Date</label>
        <DatePicker value={form.watch('dueDate') || ''} onChange={(d) => form.setValue('dueDate', d, { shouldValidate: true })} className="mt-2" />
        {form.formState.errors.dueDate && <p className="text-xs text-destructive mt-1">{form.formState.errors.dueDate.message}</p>}
      </div>
      <div className="flex items-center gap-3 bg-secondary/50 p-3 rounded-2xl border border-border/50">
        <input type="checkbox" {...form.register('isRecurring')} id="recurring-bill" className="w-4 h-4 rounded cursor-pointer" />
        <label htmlFor="recurring-bill" className="text-xs font-medium text-foreground cursor-pointer">Mark as recurring bill</label>
      </div>
      <Button type="submit" className="w-full">Save Bill</Button>
    </form>
  )
}

function GoalForm({ form, onSubmit }: any) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Goal Name</label>
        <Input placeholder="e.g., Emergency Fund" {...form.register('title')} className="mt-1" />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Target Amount</label>
        <AmountInput value={form.watch('targetAmount') || ''} onChange={(val) => form.setValue('targetAmount', val, { shouldValidate: true })} placeholder="0" className="mt-1 text-lg" />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Current Amount</label>
        <AmountInput value={form.watch('currentAmount') || ''} onChange={(val) => form.setValue('currentAmount', val, { shouldValidate: true })} placeholder="0" className="mt-1 text-lg" />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Target Date</label>
        <DatePicker value={form.watch('targetDate') || ''} onChange={(d) => form.setValue('targetDate', d, { shouldValidate: true })} className="mt-1" />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Category</label>
        <Input placeholder="e.g., Savings" {...form.register('category')} className="mt-1" />
      </div>
      <Button type="submit" className="w-full">Save Goal</Button>
    </form>
  )
}
