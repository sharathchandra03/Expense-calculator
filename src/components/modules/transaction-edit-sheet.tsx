'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'framer-motion'
import {
  X, ChevronRight, Calendar, Clock, Wallet, AlignLeft, Tag, Check, Lock, Receipt,
} from 'lucide-react'
import { db, type Transaction, syncAccountToAsset } from '@/db/schema'
import { cn, formatCurrency, getCurrencySymbol } from '@/lib/utils'
import { AmountInput } from '@/components/ui/amount-input'
import { Input } from '@/components/ui/input'
import { AccountSelect } from '@/components/ui/account-select'
import { CategoryIcon } from '@/components/ui/category-icon'
import { CalendarDatePicker } from '@/components/ui/calendar-date-picker'
import { ClockTimePicker } from '@/components/ui/clock-time-picker'
import { useToast } from '@/components/ui/toast-notification'
import { useCategoryItems } from '@/components/modules/custom-categories'
import { CategorySheet } from '@/components/modules/quick-add-modal'
import { ImportService } from '@/services/ImportService'

type TxType = 'income' | 'expense'

const ACCENT: Record<TxType, string> = {
  expense: '#ef4444',
  income: '#10b981',
}

/** Row with a leading icon and a small label, matching the Quick Add look. */
function Row({
  icon: Icon,
  label,
  accent,
  children,
}: {
  icon: React.ElementType
  label: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/40 py-3">
      <Icon className="mt-1.5 h-5 w-5 flex-shrink-0" style={{ color: accent }} />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[12px] text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  )
}

function Trigger({ value, placeholder, onClick, disabled }: {
  value?: string
  placeholder: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-2 text-left disabled:opacity-60"
    >
      <span className={cn('truncate text-[16px] font-semibold', value ? 'text-foreground' : 'text-muted-foreground')}>
        {value || placeholder}
      </span>
      {!disabled && <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />}
    </button>
  )
}

/**
 * Edit a transaction in a proper bottom sheet: switch income/expense, pick a
 * category from your live category list, change amount, account, date, time
 * and note. Account balances are corrected for whatever changed.
 */
export function TransactionEditSheet({
  tx,
  onClose,
  onViewReceipt,
}: {
  tx: Transaction
  onClose: () => void
  onViewReceipt?: (image: string) => void
}) {
  const { showToast } = useToast()
  const { expenseItems, incomeItems } = useCategoryItems()
  const customCategories = useLiveQuery(() => db.customCategories.toArray())
  const accounts = useLiveQuery(() => db.accounts.toArray())

  // Transfers are two linked rows; changing type or category would break the pair.
  const isTransfer = tx.category === 'Transfer'
  // Rows imported from a bank: amount, date, account and direction come from the bank and the
  // account balance is the bank's own figure, so only the category and note are editable.
  const isImported = tx.source === 'imported'

  const [type, setType] = useState<TxType>(tx.type)
  const [amount, setAmount] = useState(String(tx.amount))
  const [category, setCategory] = useState(tx.category)
  const [accountId, setAccountId] = useState(tx.accountId)
  const [date, setDate] = useState(tx.date)
  const [time, setTime] = useState(tx.time || '')
  const [description, setDescription] = useState(tx.description || '')
  const [dateOpen, setDateOpen] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const accent = ACCENT[type]
  const amountNum = parseFloat(amount) || 0
  const items = type === 'income' ? incomeItems : expenseItems
  const selectedItem = items.find(i => i.name.toLowerCase() === category.toLowerCase())
  // A category that came from a custom row (or isn't in the live list) still needs its icon.
  const customRow = Array.isArray(customCategories)
    ? customCategories.find(c => c.name.toLowerCase() === category.toLowerCase() && c.type === type)
    : undefined

  const switchType = (next: TxType) => {
    if (next === type || isTransfer || isImported) return
    setType(next)
    // Keep the category only if it also exists for the other type.
    const nextItems = next === 'income' ? incomeItems : expenseItems
    if (!nextItems.some(i => i.name.toLowerCase() === category.toLowerCase())) setCategory('')
  }

  const prettyDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : ''
  const prettyTime = time
    ? new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : ''

  const handleSave = async () => {
    if (amountNum <= 0) { showToast('Enter an amount greater than zero'); return }
    if (!category) { showToast('Choose a category'); return }
    if (!accountId) { showToast('Choose an account'); return }

    setSaving(true)
    try {
      if (isImported) {
        // Note first (the ledger row may disappear if the new category is not income/expense),
        // then the category, which is stored as a user override and learned for this merchant.
        await db.transactions.update(tx.id, { description: description.trim() || tx.description })
        if (tx.importedId && category !== tx.category) {
          const similar = await ImportService.setUserCategory(tx.importedId, category)
          showToast(similar > 0 ? `Updated. ${similar} similar transaction${similar > 1 ? 's' : ''} also changed.` : 'Updated. PennyFlow will remember this category.', 'success')
        } else {
          showToast('Transaction updated', 'success')
        }
        onClose()
        return
      }
      await db.transaction('rw', [db.transactions, db.accounts, db.assets], async () => {
        await db.transactions.update(tx.id, {
          type,
          amount: amountNum,
          category,
          accountId,
          date: date || tx.date,
          time: time || undefined,
          description: description.trim() || (isTransfer ? tx.description : category),
        })

        const financialChange = type !== tx.type || amountNum !== tx.amount || accountId !== tx.accountId
        if (!financialChange) return

        // 1) Undo the original effect on the original account...
        const oldAccount = await db.accounts.get(tx.accountId)
        if (oldAccount) {
          const restored = oldAccount.balance + (tx.type === 'expense' ? tx.amount : -tx.amount)
          await db.accounts.update(oldAccount.id, { balance: restored })
          await syncAccountToAsset(oldAccount.name, restored)
        }
        // 2) ...then apply the new effect (re-read in case it's the same account).
        const newAccount = await db.accounts.get(accountId)
        if (newAccount) {
          const applied = newAccount.balance + (type === 'expense' ? -amountNum : amountNum)
          await db.accounts.update(newAccount.id, { balance: applied })
          await syncAccountToAsset(newAccount.name, applied)
        }
      })
      showToast('Transaction updated')
      onClose()
    } catch (err) {
      console.error('Failed to edit transaction:', err)
      showToast('Could not save changes')
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop + sheet. Layered below the date/time/category pickers so they open on top. */}
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
          aria-label="Edit transaction"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h3 className="text-[18px] font-bold text-foreground">Edit transaction</h3>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-4">
            {/* Type toggle */}
            <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary/70 p-1.5">
              {(['expense', 'income'] as TxType[]).map(t => {
                const active = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => switchType(t)}
                    disabled={isTransfer || isImported}
                    className={cn(
                      'relative h-10 rounded-full text-[14px] font-bold capitalize transition-colors disabled:cursor-not-allowed',
                      active ? 'text-white shadow-sm' : 'text-muted-foreground'
                    )}
                    style={active ? { background: ACCENT[t] } : undefined}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
            {isImported && (
              <p className="mt-2 flex items-start gap-1.5 text-[12px] text-muted-foreground">
                <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>Imported from your bank. Amount, date and account come from the bank. You can change the category and note; PennyFlow learns the category for this merchant.</span>
              </p>
            )}
            {isTransfer && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Transfers are linked, so type and category are locked.
              </p>
            )}

            {/* Amount */}
            <div className="mt-5">
              <p className="mb-1.5 text-[12px] text-muted-foreground">Amount</p>
              {isImported ? (
                <p className="flex h-14 items-center whitespace-nowrap text-[24px] font-bold text-foreground">{formatCurrency(tx.amount)}</p>
              ) : (
                <AmountInput
                  value={amount}
                  onChange={setAmount}
                  prefixSymbol={getCurrencySymbol()}
                  placeholder="0"
                  className="h-14 text-[24px] font-bold"
                />
              )}
              {amountNum !== tx.amount && amountNum > 0 && (
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  Was {formatCurrency(tx.amount)}. Your account balance is adjusted by the difference.
                </p>
              )}
            </div>

            {/* Fields */}
            <div className="mt-2">
              <Row icon={Tag} label="Category" accent={accent}>
                <Trigger
                  value={category || undefined}
                  placeholder="Choose a category"
                  disabled={isTransfer}
                  onClick={() => setCategoryOpen(true)}
                />
                {category && (
                  <div className="mt-2 flex items-center gap-2">
                    <CategoryIcon
                      name={category}
                      type={type}
                      isCustom={selectedItem?.isCustom ?? !!customRow}
                      icon={selectedItem?.icon ?? customRow?.icon}
                      color={selectedItem?.color ?? customRow?.color}
                      size={28}
                      iconSize={15}
                    />
                    <span className="text-[12px] text-muted-foreground">
                      {selectedItem ? 'In your categories' : 'Not in your category list anymore. You can pick another.'}
                    </span>
                  </div>
                )}
              </Row>

              <Row icon={Wallet} label="Account" accent={accent}>
                {isImported ? (
                  <p className="text-[16px] font-semibold text-foreground">{accounts?.find(a => a.id === accountId)?.name ?? 'Linked account'}</p>
                ) : (
                  <AccountSelect value={accountId} onChange={setAccountId} placeholder="Select account" />
                )}
              </Row>

              <Row icon={Calendar} label="Date" accent={accent}>
                <Trigger value={prettyDate} placeholder="Select date" disabled={isImported} onClick={() => setDateOpen(true)} />
              </Row>

              <Row icon={Clock} label="Time" accent={accent}>
                <Trigger value={prettyTime} placeholder="Set time" disabled={isImported} onClick={() => setTimeOpen(true)} />
              </Row>

              <Row icon={AlignLeft} label="Note" accent={accent}>
                <Input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Add a note"
                  className="mt-1"
                />
              </Row>

              {tx.receiptImage && onViewReceipt && (
                <Row icon={Receipt} label="Receipt" accent={accent}>
                  <button
                    type="button"
                    onClick={() => onViewReceipt(tx.receiptImage!)}
                    className="mt-1 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2 hover:bg-amber-500/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={tx.receiptImage} alt="Receipt" className="h-10 w-10 rounded-lg object-cover" />
                    <span className="text-[13px] font-medium text-amber-500">View receipt</span>
                  </button>
                </Row>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border/40 px-5 pb-6 pt-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white transition active:scale-[0.99] disabled:opacity-60"
              style={{ background: accent }}
            >
              <Check className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </motion.div>
      </div>

      <CategorySheet
        open={categoryOpen}
        type={type}
        value={category}
        onClose={() => setCategoryOpen(false)}
        onSelect={name => { setCategory(name); setCategoryOpen(false) }}
      />
      <CalendarDatePicker
        open={dateOpen}
        value={date}
        accent={accent}
        onConfirm={d => { setDate(d); setDateOpen(false) }}
        onCancel={() => setDateOpen(false)}
      />
      <ClockTimePicker
        open={timeOpen}
        value={time}
        accent={accent}
        onConfirm={t => { setTime(t); setTimeOpen(false) }}
        onCancel={() => setTimeOpen(false)}
      />
    </>
  )
}
