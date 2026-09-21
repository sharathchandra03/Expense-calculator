'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, CustomCategory, generateUUID } from '@/db/schema'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Edit2, X, ArrowDownRight, ArrowUpRight, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast-notification'

const COLOR_OPTIONS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

const ALL_DEFAULT_EXPENSE = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Utilities', 'Rent', 'Healthcare', 'Education', 'Subscriptions', 'Other']
const ALL_DEFAULT_INCOME = ['Salary', 'Freelance', 'Investment', 'Bonus', 'Gift', 'Rental Income', 'Interest', 'Other']

function getHiddenDefaults(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem('pennyflow-hidden-categories')
    if (stored) return JSON.parse(stored)
  } catch {}
  return []
}

function saveHiddenDefaults(hidden: string[]) {
  localStorage.setItem('pennyflow-hidden-categories', JSON.stringify(hidden))
}

export function CustomCategories() {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hiddenDefaults, setHiddenDefaults] = useState<string[]>(getHiddenDefaults)
  const [confirmState, setConfirmState] = useState<{ open: boolean; id?: string; name?: string; isDefault?: boolean }>({ open: false })
  const { showToast } = useToast()
  const [formData, setFormData] = useState<{
    name: string
    type: 'income' | 'expense'
    color: string
  }>({ name: '', type: 'expense', color: '' })

  const categories = useLiveQuery(() => db.customCategories.toArray()) ?? []
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []

  const safeCategories = Array.isArray(categories) ? categories : []
  const safeTransactions = Array.isArray(transactions) ? transactions : []

  // Visible defaults (filtered by hidden)
  const visibleExpenseDefaults = ALL_DEFAULT_EXPENSE.filter(c => !hiddenDefaults.includes(c))
  const visibleIncomeDefaults = ALL_DEFAULT_INCOME.filter(c => !hiddenDefaults.includes(c))

  // Usage count per category name
  const usageCount = React.useMemo(() => {
    const map: Record<string, number> = {}
    safeTransactions.forEach((tx) => {
      map[tx.category] = (map[tx.category] || 0) + 1
    })
    return map
  }, [safeTransactions])

  const expenseCategories = safeCategories.filter((c) => c.type === 'expense')
  const incomeCategories = safeCategories.filter((c) => c.type === 'income')

  const resetForm = () => {
    setFormData({ name: '', type: 'expense', color: '' })
    setEditingId(null)
    setIsAdding(false)
  }

  const handleSave = async () => {
    const name = formData.name.trim()
    if (!name) return

    const duplicate = safeCategories.find(
      (c) => c.name.toLowerCase() === name.toLowerCase() && c.type === formData.type && c.id !== editingId
    )
    if (duplicate) {
      showToast('A category with that name already exists')
      return
    }

    try {
      if (editingId) {
        await db.customCategories.update(editingId, {
          name,
          type: formData.type,
          color: formData.color || undefined,
        })
      } else {
        await db.customCategories.add({
          id: generateUUID(),
          name,
          type: formData.type,
          color: formData.color || undefined,
          createdAt: new Date().toISOString(),
        })
      }
      resetForm()
    } catch (err) {
      console.error('Error saving category:', err)
    }
  }

  const handleEdit = (cat: CustomCategory) => {
    setFormData({ name: cat.name, type: cat.type, color: cat.color || '' })
    setEditingId(cat.id)
    setIsAdding(true)
  }

  const handleDelete = async (id: string, name: string) => {
    setConfirmState({ open: true, id, name, isDefault: false })
  }

  const handleConfirmDelete = async () => {
    if (confirmState.id) {
      await db.customCategories.delete(confirmState.id)
    }
    setConfirmState({ open: false })
  }

  const handleHideDefault = (name: string) => {
    setConfirmState({ open: true, name, isDefault: true })
  }

  const handleConfirmHideDefault = () => {
    if (confirmState.name) {
      const updated = [...hiddenDefaults, confirmState.name]
      setHiddenDefaults(updated)
      saveHiddenDefaults(updated)
    }
    setConfirmState({ open: false })
  }

  const handleRestoreDefault = (name: string) => {
    const updated = hiddenDefaults.filter(h => h !== name)
    setHiddenDefaults(updated)
    saveHiddenDefaults(updated)
  }

  // Hidden defaults that can be restored
  const hiddenExpense = ALL_DEFAULT_EXPENSE.filter(c => hiddenDefaults.includes(c))
  const hiddenIncome = ALL_DEFAULT_INCOME.filter(c => hiddenDefaults.includes(c))

  return (
    <div className="flex flex-col space-y-5 pb-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Categories</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Manage your expense and income categories.</p>
      </div>

      {/* Add / Edit form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-card"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">{editingId ? 'Edit Category' : 'New Category'}</h3>
              <button onClick={resetForm} className="p-2 hover:bg-secondary rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase">Name</label>
              <Input
                placeholder="e.g., Gym Membership"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1.5"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase">Type</label>
              <div className="flex gap-2 mt-1.5">
                <button
                  onClick={() => setFormData({ ...formData, type: 'expense' })}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all',
                    formData.type === 'expense'
                      ? 'bg-red-500/10 text-red-500 border border-red-500/30'
                      : 'bg-secondary/60 text-muted-foreground border border-transparent hover:text-foreground'
                  )}
                >
                  Expense
                </button>
                <button
                  onClick={() => setFormData({ ...formData, type: 'income' })}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all',
                    formData.type === 'income'
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                      : 'bg-secondary/60 text-muted-foreground border border-transparent hover:text-foreground'
                  )}
                >
                  Income
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase">Color <span className="normal-case font-normal opacity-60">(optional)</span></label>
              <div className="flex flex-wrap gap-2.5 mt-2">
                {/* No color option */}
                <button
                  onClick={() => setFormData({ ...formData, color: '' })}
                  className={cn(
                    'w-7 h-7 rounded-full transition-all border-2 border-dashed flex items-center justify-center',
                    formData.color === ''
                      ? 'border-foreground/60 ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110'
                      : 'border-muted-foreground/30 hover:border-muted-foreground/50'
                  )}
                  aria-label="No color"
                  title="No color"
                >
                  <Ban className="w-3 h-3 text-muted-foreground/50" />
                </button>
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setFormData({ ...formData, color })}
                    className={cn(
                      'w-7 h-7 rounded-full transition-all',
                      formData.color === color ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110' : 'hover:scale-105'
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={`Color ${color}`}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={handleSave}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity"
            >
              {editingId ? 'Update Category' : 'Add Category'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expense categories card */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-card">
        <div className="flex items-center gap-2 pb-2 border-b border-border/50">
          <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
            <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
          </div>
          <h3 className="text-[13px] font-bold text-foreground">Expense Categories</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">{visibleExpenseDefaults.length + expenseCategories.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleExpenseDefaults.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-secondary/60 text-foreground group">
              {c}
              <button
                onClick={() => { setFormData({ name: c, type: 'expense', color: '' }); setEditingId(null); setIsAdding(true) }}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-primary transition-opacity"
                title={`Edit ${c}`}
              >
                <Edit2 className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={() => handleHideDefault(c)}
                className="opacity-40 hover:opacity-100 hover:text-destructive transition-opacity"
                title={`Remove ${c}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <AnimatePresence mode="popLayout">
            {expenseCategories.map((cat) => {
              const hasColor = !!cat.color
              return (
                <motion.span
                  key={cat.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors group",
                    hasColor
                      ? "border border-border/40"
                      : "bg-secondary/60 text-foreground"
                  )}
                  style={hasColor ? { backgroundColor: `${cat.color}12`, borderColor: `${cat.color}30` } : undefined}
                >
                  {hasColor && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  )}
                  <span className={hasColor ? "text-foreground" : ""}>{cat.name}</span>
                  <button
                    onClick={() => handleEdit(cat)}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-primary transition-opacity ml-0.5"
                    title={`Edit ${cat.name}`}
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id, cat.name)}
                    className="opacity-40 hover:opacity-100 hover:text-destructive transition-opacity"
                    title={`Delete ${cat.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.span>
              )
            })}
          </AnimatePresence>
          {visibleExpenseDefaults.length === 0 && expenseCategories.length === 0 && (
            <p className="text-[11px] text-muted-foreground/50 py-1">No categories yet.</p>
          )}
        </div>
      </div>

      {/* Income categories card */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-card">
        <div className="flex items-center gap-2 pb-2 border-b border-border/50">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <h3 className="text-[13px] font-bold text-foreground">Income Categories</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">{visibleIncomeDefaults.length + incomeCategories.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleIncomeDefaults.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-secondary/60 text-foreground group">
              {c}
              <button
                onClick={() => { setFormData({ name: c, type: 'income', color: '' }); setEditingId(null); setIsAdding(true) }}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-primary transition-opacity"
                title={`Edit ${c}`}
              >
                <Edit2 className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={() => handleHideDefault(c)}
                className="opacity-40 hover:opacity-100 hover:text-destructive transition-opacity"
                title={`Remove ${c}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <AnimatePresence mode="popLayout">
            {incomeCategories.map((cat) => {
              const hasColor = !!cat.color
              return (
                <motion.span
                  key={cat.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors group",
                    hasColor
                      ? "border border-border/40"
                      : "bg-secondary/60 text-foreground"
                  )}
                  style={hasColor ? { backgroundColor: `${cat.color}12`, borderColor: `${cat.color}30` } : undefined}
                >
                  {hasColor && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  )}
                  <span className={hasColor ? "text-foreground" : ""}>{cat.name}</span>
                  <button
                    onClick={() => handleEdit(cat)}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-primary transition-opacity ml-0.5"
                    title={`Edit ${cat.name}`}
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id, cat.name)}
                    className="opacity-40 hover:opacity-100 hover:text-destructive transition-opacity"
                    title={`Delete ${cat.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.span>
              )
            })}
          </AnimatePresence>
          {visibleIncomeDefaults.length === 0 && incomeCategories.length === 0 && (
            <p className="text-[11px] text-muted-foreground/50 py-1">No categories yet.</p>
          )}
        </div>
      </div>

      {/* Restore hidden defaults */}
      {(hiddenExpense.length > 0 || hiddenIncome.length > 0) && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-card">
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Removed (tap to restore)</h3>
          <div className="flex flex-wrap gap-2">
            {[...hiddenExpense, ...hiddenIncome].map((c) => (
              <button
                key={c}
                onClick={() => handleRestoreDefault(c)}
                className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-secondary/40 text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition-colors line-through"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isAdding && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setIsAdding(true)}
          className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-[13px] tracking-wide flex items-center justify-center gap-2 shadow-card hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </motion.button>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.open}
        title={confirmState.isDefault ? 'Remove category?' : 'Delete category?'}
        message={confirmState.isDefault
          ? `"${confirmState.name}" will be removed from defaults. You can restore it later.`
          : `"${confirmState.name}" will be deleted. Existing transactions keep their label.`
        }
        confirmLabel={confirmState.isDefault ? 'Remove' : 'Delete'}
        variant={confirmState.isDefault ? 'warning' : 'danger'}
        onConfirm={confirmState.isDefault ? handleConfirmHideDefault : handleConfirmDelete}
        onCancel={() => setConfirmState({ open: false })}
      />
    </div>
  )
}
