'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, CustomCategory, generateUUID } from '@/db/schema'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Plus, Tag, Trash2, Edit2, X, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

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
  const [formData, setFormData] = useState<{
    name: string
    type: 'income' | 'expense'
    color: string
  }>({ name: '', type: 'expense', color: COLOR_OPTIONS[0] })

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
    setFormData({ name: '', type: 'expense', color: COLOR_OPTIONS[0] })
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
      alert('A category with that name already exists.')
      return
    }

    try {
      if (editingId) {
        await db.customCategories.update(editingId, {
          name,
          type: formData.type,
          color: formData.color,
        })
      } else {
        await db.customCategories.add({
          id: generateUUID(),
          name,
          type: formData.type,
          color: formData.color,
          createdAt: new Date().toISOString(),
        })
      }
      resetForm()
    } catch (err) {
      console.error('Error saving category:', err)
    }
  }

  const handleEdit = (cat: CustomCategory) => {
    setFormData({ name: cat.name, type: cat.type, color: cat.color || COLOR_OPTIONS[0] })
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

  const renderCategoryList = (list: CustomCategory[], type: 'income' | 'expense') => (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {list.map((cat) => (
          <motion.div
            key={cat.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border/50"
          >
            <div className="flex items-center gap-3">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${cat.color}22` }}
              >
                <Tag className="w-4 h-4" style={{ color: cat.color }} />
              </span>
              <div>
                <p className="text-sm font-semibold">{cat.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {usageCount[cat.name] || 0} transactions
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => handleEdit(cat)}
                className="p-2 hover:bg-secondary/60 rounded-lg transition-colors"
              >
                <Edit2 className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => handleDelete(cat.id, cat.name)}
                className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )

  const renderDefaultPills = (defaults: string[], type: 'expense' | 'income') => (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {defaults.map((c) => (
        <span key={c} className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground group">
          {c}
          <button
            onClick={() => handleHideDefault(c)}
            className="ml-0.5 opacity-40 hover:opacity-100 hover:text-destructive transition-opacity"
            title={`Remove ${c}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {defaults.length === 0 && (
        <p className="text-[10px] text-muted-foreground/50">All defaults removed.</p>
      )}
    </div>
  )

  // Hidden defaults that can be restored
  const hiddenExpense = ALL_DEFAULT_EXPENSE.filter(c => hiddenDefaults.includes(c))
  const hiddenIncome = ALL_DEFAULT_INCOME.filter(c => hiddenDefaults.includes(c))

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Categories</h1>
        <p className="text-xs text-muted-foreground">Manage expense and income categories. Tap X to remove defaults.</p>
      </div>

      {/* Add / Edit form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-secondary/50 border border-border/50 rounded-3xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">{editingId ? 'Edit Category' : 'New Category'}</h3>
              <button onClick={resetForm} className="p-2 hover:bg-secondary rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Name</label>
              <Input
                placeholder="e.g., Gym Membership"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-2"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Type</label>
              <Select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'income' | 'expense' })}
                className="mt-2"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Color</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setFormData({ ...formData, color })}
                    className={cn(
                      'w-8 h-8 rounded-full transition-transform',
                      formData.color === color ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110' : ''
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={`Color ${color}`}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={handleSave}
              className="w-full h-10 rounded-full bg-foreground text-background font-semibold text-xs uppercase tracking-wider"
            >
              {editingId ? 'Update Category' : 'Save Category'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expense categories */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ArrowDownRight className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-bold">Expense Categories</h3>
        </div>
        {renderDefaultPills(visibleExpenseDefaults, 'expense')}
        {renderCategoryList(expenseCategories, 'expense')}
      </div>

      {/* Income categories */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-bold">Income Categories</h3>
        </div>
        {renderDefaultPills(visibleIncomeDefaults, 'income')}
        {renderCategoryList(incomeCategories, 'income')}
      </div>

      {/* Restore hidden defaults */}
      {(hiddenExpense.length > 0 || hiddenIncome.length > 0) && (
        <div className="space-y-2 pt-2 border-t border-border/40">
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Removed defaults (tap to restore)</h3>
          <div className="flex flex-wrap gap-1.5">
            {[...hiddenExpense, ...hiddenIncome].map((c) => (
              <button
                key={c}
                onClick={() => handleRestoreDefault(c)}
                className="text-[10px] px-2.5 py-1 rounded-full bg-secondary/30 text-muted-foreground/60 hover:bg-secondary/60 hover:text-foreground transition-colors line-through"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isAdding && (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full h-11 rounded-full bg-foreground text-background font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
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
