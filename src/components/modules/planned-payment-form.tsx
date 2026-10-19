'use client'

/* ------------------------------------------------------------------ *
 * Planned Payment form screen
 * ------------------------------------------------------------------ *
 * Mirrors the Add-transaction flow (quick-add-modal) 1:1 — same segmented
 * income/expense tabs, big amount input + calculator, category sheet, payment
 * mode sheet, date/time pickers, note and labels — and adds a Frequency
 * control (one-time / recurring) for future cash-flow planning.
 *
 * It is intentionally UI-only: it collects a value and hands a PlannedPayment
 * draft to `onSave`. Persistence lives in PlannedPaymentService so the same
 * form can be used from Quick Add (create) and the Planned Payments page (edit).
 * ------------------------------------------------------------------ */

import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID } from '@/db/schema'
import type { PlannedPayment, PlannedPaymentFrequency } from '@/db/schema'
import { cn, getCurrencySymbol } from '@/lib/utils'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Calendar, Clock, Calculator, Utensils, Wallet, AlignLeft,
  Hash, Save, Plus, Repeat, CalendarCheck, Zap,
} from 'lucide-react'
import { CalendarDatePicker } from '@/components/ui/calendar-date-picker'
import { ClockTimePicker } from '@/components/ui/clock-time-picker'
import { CategoryIcon } from '@/components/ui/category-icon'
import {
  BigAmountInput, CalculatorSheet, CategorySheet, PaymentModeSheet,
  FieldRow, SheetTrigger, TagChip, PRIMARY_ACCENTS, SUGGESTED_TAGS,
} from '@/components/modules/quick-add-modal'

type PlannedType = 'expense' | 'income'
type RecurrenceRule = 'weekly' | 'monthly' | 'yearly'

const plannedSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  category: z.string().min(1, 'Category required'),
  accountId: z.string().min(1, 'Account required'),
  description: z.string().optional().default(''),
  date: z.string().min(1, 'Date required'),
  time: z.string().optional().default(''),
})

export interface PlannedPaymentDraft {
  id?: string
  type: PlannedType
  amount: number
  category: string
  accountId: string
  date: string
  time?: string
  description: string
  frequency: PlannedPaymentFrequency
  recurrenceRule?: RecurrenceRule
  tags?: string[]
  autoExecute: boolean
}

interface PlannedPaymentFormProps {
  /** Back / close affordance (top-left arrow). */
  onBack: () => void
  /** Called with a validated draft when the user taps save. */
  onSave: (draft: PlannedPaymentDraft) => void | Promise<void>
  /** When provided, the form opens in edit mode pre-filled with this record. */
  initial?: PlannedPayment
  onNavigateToTab?: (tab: string) => void
}

const RECURRENCE_OPTIONS: { key: RecurrenceRule; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
]

export function PlannedPaymentForm({ onBack, onSave, initial, onNavigateToTab }: PlannedPaymentFormProps) {
  const accounts = useLiveQuery(() => db.accounts.toArray()) || []

  const getCurrentTime = () => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }

  const [primary, setPrimary] = useState<PlannedType>(initial?.type ?? 'expense')
  const [frequency, setFrequency] = useState<PlannedPaymentFrequency>(initial?.frequency ?? 'one-time')
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>(initial?.recurrenceRule ?? 'monthly')
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [autoExecute, setAutoExecute] = useState<boolean>(initial?.autoExecute ?? true)

  const form = useForm<z.infer<typeof plannedSchema>>({
    resolver: zodResolver(plannedSchema),
    defaultValues: {
      amount: (initial?.amount ?? '') as any,
      category: initial?.category ?? '',
      accountId: initial?.accountId ?? '',
      description: initial?.description ?? '',
      date: initial?.date ?? new Date().toISOString().split('T')[0],
      time: initial?.time ?? getCurrentTime(),
    },
  })

  // Sheet / picker visibility
  const [dateOpen, setDateOpen] = useState(false)
  const [clockOpen, setClockOpen] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const [categorySheetOpen, setCategorySheetOpen] = useState(false)
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false)

  // Tags
  const dbTags = useLiveQuery(() => db.tags.toArray()) || []
  const [addingTag, setAddingTag] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [tagToDelete, setTagToDelete] = useState<string | null>(null)

  const tagOptions = React.useMemo(() => {
    const names = new Set<string>()
    const out: string[] = []
    const push = (name: string) => {
      const key = name.toLowerCase()
      if (!names.has(key)) { names.add(key); out.push(name) }
    }
    SUGGESTED_TAGS.forEach(push)
    dbTags.forEach(t => push(t.name))
    tags.forEach(push)
    return out
  }, [dbTags, tags])

  const builtInTags = new Set(SUGGESTED_TAGS.map(t => t.toLowerCase()))
  const isDeletable = (t: string) => !builtInTags.has(t.toLowerCase())

  const accent = PRIMARY_ACCENTS[primary]
  const currency = getCurrencySymbol()

  const toggleTag = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const createTag = async () => {
    const name = newTag.trim()
    if (!name) return
    const existing = tagOptions.find(t => t.toLowerCase() === name.toLowerCase())
    const label = existing ?? name
    if (!existing) {
      try {
        await db.tags.add({ id: generateUUID(), name, color: accent.color, createdAt: new Date().toISOString() } as any)
      } catch (err) {
        console.error('Error adding tag:', err)
      }
    }
    setTags(prev => prev.includes(label) ? prev : [...prev, label])
    setNewTag('')
    setAddingTag(false)
  }

  const deleteTag = async (t: string) => {
    try {
      const match = dbTags.find(x => x.name.toLowerCase() === t.toLowerCase())
      if (match) await db.tags.delete(match.id)
    } catch (err) {
      console.error('Error deleting tag:', err)
    }
    setTags(prev => prev.filter(x => x !== t))
    setTagToDelete(null)
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

  const date = form.watch('date') || ''
  const time = form.watch('time') || ''
  const amountError = form.formState.errors.amount?.message as string | undefined

  const submit = form.handleSubmit((data) => {
    onSave({
      id: initial?.id,
      type: primary,
      amount: Number(data.amount),
      category: data.category,
      accountId: data.accountId,
      date: data.date,
      time: data.time || undefined,
      description: data.description || '',
      frequency,
      recurrenceRule: frequency === 'recurring' ? recurrenceRule : undefined,
      tags: tags.length ? tags : undefined,
      autoExecute,
    })
  })

  return (
    <motion.div
      key="planned-form"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="relative flex flex-1 flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-foreground hover:bg-secondary/80 transition-colors" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-[20px] font-bold text-foreground tracking-tight">{initial ? 'Edit planned payment' : 'Planned payment'}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-32">
        {/* Segmented tabs — expense / income */}
        <div className="grid grid-cols-2 rounded-full bg-secondary/70 p-1 mb-6">
          {(['expense', 'income'] as PlannedType[]).map((t) => {
            const active = primary === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setPrimary(t)}
                className={cn(
                  'relative h-10 rounded-full text-[14px] font-semibold capitalize transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="planned-tab"
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
          <button type="button" onClick={() => setClockOpen(true)} className="flex items-center gap-2.5">
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
              onChange={(v) => form.setValue('amount', v as any, { shouldValidate: true })}
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

        {/* Category + payment mode */}
        <FieldRow icon={primary === 'income' ? Wallet : Utensils} accent={accent.color} label="Category" error={form.formState.errors.category?.message as string}>
          <SheetTrigger
            placeholder="Select category"
            value={form.watch('category')}
            icon={form.watch('category')
              ? <CategoryIcon name={form.watch('category')} type={primary} size={24} iconSize={13} />
              : undefined}
            onClick={() => setCategorySheetOpen(true)}
          />
        </FieldRow>
        <FieldRow icon={Wallet} accent={accent.color} label="Account" error={form.formState.errors.accountId?.message as string}>
          <SheetTrigger
            placeholder="Select account"
            value={accounts.find((a: any) => a.id === form.watch('accountId'))?.name}
            onClick={() => setPaymentSheetOpen(true)}
          />
        </FieldRow>

        {/* Frequency */}
        <h3 className="text-[16px] font-bold text-foreground mt-8 mb-4">Frequency</h3>
        <div className="grid grid-cols-2 rounded-full bg-secondary/70 p-1 mb-4">
          {([
            { key: 'one-time' as PlannedPaymentFrequency, label: 'One-time', icon: CalendarCheck },
            { key: 'recurring' as PlannedPaymentFrequency, label: 'Recurring', icon: Repeat },
          ]).map(({ key, label, icon: Icon }) => {
            const active = frequency === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFrequency(key)}
                className={cn(
                  'relative h-10 rounded-full text-[14px] font-semibold transition-colors flex items-center justify-center gap-2',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="planned-freq"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-background shadow-sm"
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5"><Icon className="w-4 h-4" />{label}</span>
              </button>
            )
          })}
        </div>

        {/* Recurrence rule — only when recurring */}
        {frequency === 'recurring' && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {RECURRENCE_OPTIONS.map(({ key, label }) => {
              const active = recurrenceRule === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRecurrenceRule(key)}
                  className={cn(
                    'h-10 rounded-2xl text-[13px] font-semibold border transition-colors',
                    active ? 'text-background' : 'text-foreground border-border/60 bg-secondary/40'
                  )}
                  style={active ? { backgroundColor: accent.color, borderColor: accent.color } : undefined}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground/70 mb-2">
          {frequency === 'one-time'
            ? 'A single planned payment on the chosen date.'
            : `Repeats ${recurrenceRule} from the chosen date until you cancel it.`}
        </p>

        {/* Auto-execute toggle */}
        <button
          type="button"
          onClick={() => setAutoExecute(v => !v)}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-secondary/40 border border-border/60 p-3.5 text-left"
          role="switch"
          aria-checked={autoExecute}
        >
          <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: accent.soft }}>
            <Zap className="w-[18px] h-[18px]" style={{ color: accent.color }} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-semibold text-foreground">Auto-log on due date</span>
            <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">
              {autoExecute
                ? 'Logs the transaction and updates your balance automatically when due.'
                : 'Reminder only — you tap “Mark done” to log it.'}
            </span>
          </span>
          <span
            className={cn('relative w-11 h-6 rounded-full flex-shrink-0 transition-colors', autoExecute ? '' : 'bg-secondary')}
            style={autoExecute ? { backgroundColor: accent.color } : undefined}
          >
            <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', autoExecute ? 'left-[22px]' : 'left-0.5')} />
          </span>
        </button>

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

        {/* Labels / tags */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-3">
            <Hash className="w-5 h-5 flex-shrink-0" style={{ color: accent.color }} />
            <span className="text-[16px] text-muted-foreground">Add labels</span>
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

            {addingTag ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); createTag() }
                    if (e.key === 'Escape') { setAddingTag(false); setNewTag('') }
                  }}
                  onBlur={() => { if (!newTag.trim()) setAddingTag(false) }}
                  placeholder="New label"
                  className="h-8 w-28 rounded-full bg-secondary border border-border/60 px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={createTag}
                  disabled={!newTag.trim()}
                  className="h-8 px-3 rounded-full text-[13px] font-semibold text-background disabled:opacity-40"
                  style={{ backgroundColor: accent.color }}
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingTag(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-semibold border-[1.5px] border-dashed transition-colors"
                style={{ borderColor: `${accent.color}80`, color: accent.color }}
              >
                <Plus className="w-3.5 h-3.5" />
                New label
              </button>
            )}
          </div>
          <p className="pl-8 mt-2 text-[11px] text-muted-foreground/70">Tap to select · long-press a label to delete</p>
        </div>

        {/* Delete-tag confirmation */}
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
              <p className="text-[15px] font-semibold text-foreground">Delete label?</p>
              <p className="text-[13px] text-muted-foreground mt-1">
                Remove <span className="font-semibold text-foreground">{tagToDelete}</span> from your saved labels.
              </p>
              <div className="mt-5 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setTagToDelete(null)} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2">
                  Cancel
                </button>
                <button type="button" onClick={() => deleteTag(tagToDelete)} className="h-9 px-4 rounded-full bg-destructive text-destructive-foreground text-[13px] font-semibold active:scale-[0.97] transition-transform">
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* Floating save FAB */}
      <button
        type="button"
        onClick={submit}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center shadow-xl active:scale-95 transition-transform"
        aria-label="Save planned payment"
      >
        <Save className="w-6 h-6" />
      </button>

      {/* Pickers / sheets — reused from the add-transaction flow */}
      <CalendarDatePicker
        open={dateOpen}
        value={date}
        accent={accent.color}
        onConfirm={(d) => { form.setValue('date', d, { shouldValidate: true }); setDateOpen(false) }}
        onCancel={() => setDateOpen(false)}
      />
      <ClockTimePicker
        open={clockOpen}
        value={time}
        accent={accent.color}
        onConfirm={(t) => { form.setValue('time', t, { shouldValidate: true }); setClockOpen(false) }}
        onCancel={() => setClockOpen(false)}
      />
      <CalculatorSheet
        open={calcOpen}
        initialValue={String(form.watch('amount') || '')}
        onCancel={() => setCalcOpen(false)}
        onDone={(value) => { form.setValue('amount', value as any, { shouldValidate: true }); setCalcOpen(false) }}
      />
      <CategorySheet
        open={categorySheetOpen}
        type={primary}
        value={form.watch('category') || ''}
        onClose={() => setCategorySheetOpen(false)}
        onSelect={(v) => { form.setValue('category', v, { shouldValidate: true }); setCategorySheetOpen(false) }}
      />
      <PaymentModeSheet
        open={paymentSheetOpen}
        title="Select account"
        accounts={accounts}
        value={form.watch('accountId') || ''}
        onClose={() => setPaymentSheetOpen(false)}
        onSelect={(v) => { form.setValue('accountId', v, { shouldValidate: true }); setPaymentSheetOpen(false) }}
        onManage={() => { setPaymentSheetOpen(false); onNavigateToTab?.('accounts') }}
      />
    </motion.div>
  )
}
