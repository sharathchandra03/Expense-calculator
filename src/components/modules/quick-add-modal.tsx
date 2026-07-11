'use client'

import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID, syncAccountToAsset } from '@/db/schema'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { CategorySelect } from '@/components/ui/category-select'
import { AccountSelect } from '@/components/ui/account-select'
import { formatCurrency, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowDownRight, ArrowUpRight, Heart, Home, Target, Zap, 
  X, ChevronRight, Check, Sparkles, TrendingUp, Wallet, Camera
} from 'lucide-react'

// Validation schemas
const transactionSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  category: z.string().min(1, 'Category required'),
  accountId: z.string().min(1, 'Account required'),
  description: z.string().optional().default(''),
  date: z.string().min(1, 'Date required'),
  isRecurring: z.boolean().default(false),
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

type ModeType = 'expense' | 'income' | 'lending' | 'asset' | 'bill' | 'goal'

interface QuickAddModalProps {
  isOpen: boolean
  onClose: () => void
}

const MODE_CONFIG = {
  expense: { label: 'Expense', icon: ArrowDownRight, color: 'from-red-500/20 to-red-500/5', accent: 'text-red-500', bg: 'bg-red-500/10' },
  income: { label: 'Income', icon: ArrowUpRight, color: 'from-emerald-500/20 to-emerald-500/5', accent: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  lending: { label: 'Lending', icon: Heart, color: 'from-pink-500/20 to-pink-500/5', accent: 'text-pink-500', bg: 'bg-pink-500/10' },
  asset: { label: 'Asset', icon: Home, color: 'from-amber-500/20 to-amber-500/5', accent: 'text-amber-500', bg: 'bg-amber-500/10' },
  bill: { label: 'Bill', icon: Zap, color: 'from-amber-500/20 to-amber-500/5', accent: 'text-amber-500', bg: 'bg-amber-500/10' },
  goal: { label: 'Goal', icon: Target, color: 'from-indigo-500/20 to-indigo-500/5', accent: 'text-indigo-500', bg: 'bg-indigo-500/10' },
}

export function QuickAddModal({ isOpen, onClose }: QuickAddModalProps) {
  const [mode, setMode] = useState<ModeType>('expense')
  const [step, setStep] = useState<'select' | 'form'>('select')
  const [submitted, setSubmitted] = useState(false)
  const accounts = useLiveQuery(() => db.accounts.toArray()) || []

  const expenseForm = useForm<z.infer<typeof transactionSchema>>({
    resolver: zodResolver(transactionSchema),
    defaultValues: { date: new Date().toISOString().split('T')[0], isRecurring: false }
  })

  const incomeForm = useForm<z.infer<typeof transactionSchema>>({
    resolver: zodResolver(transactionSchema),
    defaultValues: { date: new Date().toISOString().split('T')[0], isRecurring: false }
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

  const handleBack = () => {
    setStep('select')
    setSubmitted(false)
  }

  const handleClose = () => {
    setStep('select')
    setSubmitted(false)
    onClose()
  }

  const onExpenseSubmit = async (data: any) => {
    try {
      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        const txId = generateUUID()
        await db.transactions.add({
          id: txId,
          date: data.date,
          type: 'expense',
          category: data.category,
          amount: data.amount,
          accountId: data.accountId,
          description: data.description,
          isRecurring: data.isRecurring,
          recurrenceRule: undefined,
          receiptImage: data.receiptImage || undefined,
        } as any)

        const account = await db.accounts.get(data.accountId)
        if (account) {
          const newBalance = account.balance - data.amount
          await db.accounts.update(data.accountId, { balance: newBalance })
          
          // CRITICAL: Sync account balance to matching asset
          const matchingAsset = await db.assets.where('name').equalsIgnoreCase(account.name).first()
          if (matchingAsset) {
            const todayStr = new Date().toISOString().split('T')[0]
            const updatedHistory = [...matchingAsset.valuationHistory]
            const existingIndex = updatedHistory.findIndex(v => v.date === todayStr)
            
            if (existingIndex >= 0) {
              updatedHistory[existingIndex].value = newBalance
            } else {
              updatedHistory.push({ date: todayStr, value: newBalance })
            }
            
            await db.assets.update(matchingAsset.id, {
              balance: newBalance,
              valuationHistory: updatedHistory
            })
          }
        }

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'transaction',
          description: `Logged expense: ${data.description} (${formatCurrency(data.amount)})`,
          amount: -data.amount,
        } as any)
      })
      setSubmitted(true)
      setTimeout(handleClose, 2000)
    } catch (err) {
      console.error('Error saving expense:', err)
    }
  }

  const onIncomeSubmit = async (data: z.infer<typeof transactionSchema>) => {
    try {
      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        const txId = generateUUID()
        await db.transactions.add({
          id: txId,
          date: data.date,
          type: 'income',
          category: data.category,
          amount: data.amount,
          accountId: data.accountId,
          description: data.description,
          isRecurring: data.isRecurring,
          recurrenceRule: undefined,
        } as any)

        const account = await db.accounts.get(data.accountId)
        if (account) {
          const newBalance = account.balance + data.amount
          await db.accounts.update(data.accountId, { balance: newBalance })
          
          // CRITICAL: Sync account balance to matching asset
          const matchingAsset = await db.assets.where('name').equalsIgnoreCase(account.name).first()
          if (matchingAsset) {
            const todayStr = new Date().toISOString().split('T')[0]
            const updatedHistory = [...matchingAsset.valuationHistory]
            const existingIndex = updatedHistory.findIndex(v => v.date === todayStr)
            
            if (existingIndex >= 0) {
              updatedHistory[existingIndex].value = newBalance
            } else {
              updatedHistory.push({ date: todayStr, value: newBalance })
            }
            
            await db.assets.update(matchingAsset.id, {
              balance: newBalance,
              valuationHistory: updatedHistory
            })
          }
        }

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'transaction',
          description: `Logged income: ${data.description} (${formatCurrency(data.amount)})`,
          amount: data.amount,
        } as any)
      })
      setSubmitted(true)
      setTimeout(handleClose, 2000)
    } catch (err) {
      console.error('Error saving income:', err)
    }
  }

  const onLendingSubmit = async (data: z.infer<typeof lendingSchema>) => {
    try {
      await db.lending.add({
        id: generateUUID(),
        contactName: data.contactName,
        type: 'lent',
        amount: data.amount,
        interestRate: data.interestRate,
        interestType: data.interestType,
        expectedRepaymentDate: data.expectedRepaymentDate || '',
        status: 'active',
        createdAt: new Date().toISOString(),
        description: data.description,
      } as any)
      setSubmitted(true)
      setTimeout(handleClose, 2000)
    } catch (err) {
      console.error('Error saving lending:', err)
    }
  }

  const onAssetSubmit = async (data: z.infer<typeof assetSchema>) => {
    try {
      await db.assets.add({
        id: generateUUID(),
        name: data.name,
        type: data.type,
        balance: data.balance,
        valuationHistory: [{ date: new Date().toISOString().split('T')[0], value: data.balance }],
      } as any)
      await syncAccountToAsset(data.name, data.balance)
      setSubmitted(true)
      setTimeout(handleClose, 2000)
    } catch (err) {
      console.error('Error saving asset:', err)
    }
  }

  const onBillSubmit = async (data: z.infer<typeof billSchema>) => {
    try {
      await db.bills.add({
        id: generateUUID(),
        title: data.title,
        amount: data.amount,
        dueDate: data.dueDate,
        category: data.category,
        isPaid: false,
        isRecurring: data.isRecurring,
        recurrenceRule: undefined,
      } as any)
      setSubmitted(true)
      setTimeout(handleClose, 2000)
    } catch (err) {
      console.error('Error saving bill:', err)
    }
  }

  const onGoalSubmit = async (data: z.infer<typeof goalSchema>) => {
    try {
      await db.goals.add({
        id: generateUUID(),
        title: data.title,
        targetAmount: data.targetAmount,
        currentAmount: data.currentAmount,
        targetDate: data.targetDate,
        category: data.category,
      } as any)
      setSubmitted(true)
      setTimeout(handleClose, 2000)
    } catch (err) {
      console.error('Error saving goal:', err)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogClose className="absolute right-4 top-4" />
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 'select' ? (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-foreground">What are you tracking?</h2>
                <p className="text-xs text-muted-foreground mt-1">Quick record your activities</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {Object.entries(MODE_CONFIG).map(([key, config]) => {
                  const Icon = config.icon
                  return (
                    <motion.button
                      key={key}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleModeSelect(key as ModeType)}
                      className={cn(
                        "p-4 rounded-2xl border border-border/50 transition-all duration-300",
                        "hover:border-primary/50 hover:bg-primary/5",
                        "bg-gradient-to-br", config.color,
                      )}
                    >
                      <Icon className={cn("w-6 h-6 mb-2 mx-auto", config.accent)} />
                      <p className="text-sm font-semibold text-foreground">{config.label}</p>
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          ) : submitted ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-12 space-y-4"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5 }}
                className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center"
              >
                <Check className="w-8 h-8 text-emerald-500" />
              </motion.div>
              <p className="text-lg font-bold text-foreground">Perfect!</p>
              <p className="text-xs text-muted-foreground text-center">Your {mode} has been recorded</p>
              {(mode === 'expense' || mode === 'income') && (
                <button
                  onClick={async () => {
                    const formData = mode === 'expense' ? expenseForm.getValues() : incomeForm.getValues()
                    if (formData.amount && formData.category) {
                      const account = accounts.find(a => a.id === formData.accountId)
                      await db.templates.add({
                        id: generateUUID(),
                        name: formData.description || formData.category,
                        amount: Number(formData.amount),
                        category: formData.category,
                        accountId: formData.accountId || '',
                        type: mode,
                        createdAt: new Date().toISOString(),
                        usageCount: 0,
                      })
                    }
                    handleClose()
                  }}
                  className="mt-2 px-4 py-2 rounded-xl bg-secondary text-xs font-semibold text-foreground hover:bg-secondary/80 transition-colors border border-border/50"
                >
                  Save as Template
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 mb-2"
              >
                ← Back
              </button>

              <div className="text-center mb-4">
                <h3 className="text-xl font-bold text-foreground">Add {MODE_CONFIG[mode].label}</h3>
              </div>

              {mode === 'expense' && <ExpenseForm form={expenseForm} onSubmit={onExpenseSubmit} accounts={accounts} />}
              {mode === 'income' && <IncomeForm form={incomeForm} onSubmit={onIncomeSubmit} accounts={accounts} />}
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

// Form components
function ExpenseForm({ form, onSubmit, accounts }: any) {
  const [receiptPreview, setReceiptPreview] = React.useState<string | null>(null)

  const handleReceiptAttach = async () => {
    const { compressImageToBase64 } = await import('@/lib/receipt-utils')
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const base64 = await compressImageToBase64(file)
        setReceiptPreview(base64)
        form.setValue('receiptImage', base64)
      } catch (err) {
        console.error('Receipt compression failed:', err)
      }
    }
    input.click()
  }

  return (
    <form onSubmit={form.handleSubmit((data: any) => onSubmit({ ...data, receiptImage: receiptPreview }))} className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Amount</label>
        <Input
          type="number"
          placeholder="0.00"
          {...form.register('amount')}
          className="mt-1 text-lg"
          step="0.01"
        />
        {form.formState.errors.amount && <p className="text-xs text-red-500 mt-1">{form.formState.errors.amount.message}</p>}
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Category</label>
        <CategorySelect
          type="expense"
          value={form.watch('category') || ''}
          onChange={(val) => form.setValue('category', val, { shouldValidate: true })}
          placeholder="Select Category"
          error={form.formState.errors.category?.message}
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Account</label>
        <AccountSelect
          value={form.watch('accountId') || ''}
          onChange={(val) => form.setValue('accountId', val, { shouldValidate: true })}
          placeholder="Select Account"
          error={form.formState.errors.accountId?.message}
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Description</label>
        <Input placeholder="e.g., Coffee at Starbucks" {...form.register('description')} className="mt-1" />
        {form.formState.errors.description && <p className="text-xs text-red-500 mt-1">{form.formState.errors.description.message}</p>}
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Date</label>
        <Input type="date" {...form.register('date')} className="mt-1" />
      </div>

      {/* Receipt Attachment */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Receipt</label>
        <div className="mt-1.5">
          {receiptPreview ? (
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-secondary/50 border border-border/50">
              <img src={receiptPreview} alt="Receipt" className="w-12 h-12 rounded-lg object-cover border border-border/30 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">Receipt attached</p>
                <p className="text-[10px] text-muted-foreground">Tap to change or remove</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleReceiptAttach}
                  className="px-2.5 py-1.5 rounded-lg bg-secondary border border-border/50 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => { setReceiptPreview(null); form.setValue('receiptImage', undefined) }}
                  className="px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-[10px] font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleReceiptAttach}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-secondary border border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              Attach Receipt (up to 10MB)
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" {...form.register('isRecurring')} id="recurring" />
        <label htmlFor="recurring" className="text-xs text-muted-foreground">Mark as recurring</label>
      </div>

      <Button type="submit" className="w-full">
        Save Expense
      </Button>
    </form>
  )
}

function IncomeForm({ form, onSubmit, accounts }: any) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Amount</label>
        <Input type="number" placeholder="0.00" {...form.register('amount')} className="mt-1 text-lg" step="0.01" />
        {form.formState.errors.amount && <p className="text-xs text-red-500 mt-1">{form.formState.errors.amount.message}</p>}
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Source</label>
        <CategorySelect
          type="income"
          value={form.watch('category') || ''}
          onChange={(val) => form.setValue('category', val, { shouldValidate: true })}
          placeholder="Select Source"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">To Account</label>
        <AccountSelect
          value={form.watch('accountId') || ''}
          onChange={(val) => form.setValue('accountId', val, { shouldValidate: true })}
          placeholder="Select Account"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Description</label>
        <Input placeholder="e.g., Monthly Salary" {...form.register('description')} className="mt-1" />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Date</label>
        <Input type="date" {...form.register('date')} className="mt-1" />
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" {...form.register('isRecurring')} id="recurring" />
        <label htmlFor="recurring" className="text-xs text-muted-foreground">Mark as recurring</label>
      </div>

      <Button type="submit" className="w-full">
        Save Income
      </Button>
    </form>
  )
}

function LendingForm({ form, onSubmit }: any) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Name</label>
        <Input placeholder="Friend's name" {...form.register('contactName')} className="mt-1" />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Amount</label>
        <Input type="number" placeholder="0.00" {...form.register('amount')} className="mt-1 text-lg" step="0.01" />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Interest Rate (%)</label>
        <Input type="number" placeholder="0" {...form.register('interestRate')} className="mt-1" step="0.1" />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Interest Type</label>
        <Select
          value={form.watch('interestType')}
          onChange={(e) => form.setValue('interestType', e.target.value, { shouldValidate: true })}
        >
          <option value="none">None</option>
          <option value="simple">Simple</option>
          <option value="compound">Compound</option>
        </Select>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Expected Repayment</label>
        <Input type="date" {...form.register('expectedRepaymentDate')} className="mt-1" />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Notes</label>
        <Input placeholder="Optional notes" {...form.register('description')} className="mt-1" />
      </div>

      <Button type="submit" className="w-full">
        Save Lending
      </Button>
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
        <Select
          value={form.watch('type')}
          onChange={(e) => form.setValue('type', e.target.value, { shouldValidate: true })}
        >
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

      <Button type="submit" className="w-full">
        Save Asset
      </Button>
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
        <Input type="number" placeholder="0.00" {...form.register('amount')} className="mt-2 text-lg" step="0.01" />
        {form.formState.errors.amount && <p className="text-xs text-destructive mt-1">{form.formState.errors.amount.message}</p>}
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Category</label>
        <CategorySelect
          type="bill"
          value={form.watch('category') || ''}
          onChange={(val) => form.setValue('category', val, { shouldValidate: true })}
          placeholder="Select Category"
          error={form.formState.errors.category?.message}
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Due Date</label>
        <Input type="date" {...form.register('dueDate')} className="mt-2" />
        {form.formState.errors.dueDate && <p className="text-xs text-destructive mt-1">{form.formState.errors.dueDate.message}</p>}
      </div>

      <div className="flex items-center gap-3 bg-secondary/50 p-3 rounded-2xl border border-border/50">
        <input type="checkbox" {...form.register('isRecurring')} id="recurring" className="w-4 h-4 rounded cursor-pointer" />
        <label htmlFor="recurring" className="text-xs font-medium text-foreground cursor-pointer">Mark as recurring bill</label>
      </div>

      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="w-full h-11 rounded-full bg-foreground text-background font-semibold text-sm uppercase tracking-wider hover:opacity-90 active:scale-[0.97] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md"
      >
        <Check className="w-4 h-4" />
        {form.formState.isSubmitting ? 'Saving...' : 'Save Bill'}
      </button>
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
        <Input type="number" placeholder="0.00" {...form.register('targetAmount')} className="mt-1 text-lg" step="0.01" />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Current Amount</label>
        <Input type="number" placeholder="0.00" {...form.register('currentAmount')} className="mt-1 text-lg" step="0.01" />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Target Date</label>
        <Input type="date" {...form.register('targetDate')} className="mt-1" />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase">Category</label>
        <Input placeholder="e.g., Savings" {...form.register('category')} className="mt-1" />
      </div>

      <Button type="submit" className="w-full">
        <Check className="w-4 h-4 mr-2" />
        Save Goal
      </Button>
    </form>
  )
}
