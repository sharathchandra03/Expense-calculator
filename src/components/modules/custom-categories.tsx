'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, CustomCategory, generateUUID } from '@/db/schema'
import { Input } from '@/components/ui/input'
import { Plus, Edit2, X, ArrowDownRight, ArrowUpRight, Ban, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast-notification'
import { sortCategories, setCategoryOrder, CategoryType } from '@/lib/category-order'

const COLOR_OPTIONS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

const ALL_DEFAULT_EXPENSE = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Utilities', 'Rent', 'Healthcare', 'Education', 'Subscriptions', 'Other']
const ALL_DEFAULT_INCOME = ['Salary', 'Freelance', 'Investment', 'Bonus', 'Gift', 'Rental Income', 'Interest', 'Other']

// A pill in the management screen — either a built-in default or a DB custom category.
interface CategoryPill {
  name: string
  isCustom: boolean
  color?: string
  createdAt?: string
  cat?: CustomCategory
}

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
  const [orderVersion, setOrderVersion] = useState(0)
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

  // Unified, ordered list per type (defaults + customs), matching the dropdown order.
  // This is what gets rendered as draggable pills, so reordering here syncs with the
  // CategorySelect dropdown (both read the same 'pennyflow-category-order' key).
  const buildOrderedItems = (
    type: CategoryType,
    visibleDefaults: string[],
    customs: CustomCategory[],
  ): CategoryPill[] => {
    const items: CategoryPill[] = [
      ...visibleDefaults.map((name) => ({ name, isCustom: false as const })),
      ...customs.map((c) => ({ name: c.name, isCustom: true as const, color: c.color, createdAt: c.createdAt, cat: c })),
    ]
    return sortCategories(items, type, usageCount)
  }

  const expenseItems = React.useMemo(
    () => buildOrderedItems('expense', visibleExpenseDefaults, expenseCategories),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleExpenseDefaults, expenseCategories, usageCount, orderVersion],
  )
  const incomeItems = React.useMemo(
    () => buildOrderedItems('income', visibleIncomeDefaults, incomeCategories),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleIncomeDefaults, incomeCategories, usageCount, orderVersion],
  )

  const handleReorder = (type: CategoryType, items: CategoryPill[]) => {
    setCategoryOrder(type, items.map((i) => i.name))
    setOrderVersion((v) => v + 1)
  }

  const resetForm = () => {
    setFormData({ name: '', type: 'expense', color: '' })
    setEditingId(null)
    setPromotingDefault(null)
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
        // If we were editing a built-in default, hide the original so it isn't
        // duplicated, and swap its name in the manual order to keep its position.
        if (promotingDefault) {
          // Hide the original default so the promoted custom category replaces it
          // (whether the name changed or only the color did).
          if (!hiddenDefaults.includes(promotingDefault)) {
            const updated = [...hiddenDefaults, promotingDefault]
            setHiddenDefaults(updated)
            saveHiddenDefaults(updated)
          }
          setOrderVersion((v) => v + 1)
        }
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

  // Editing a built-in default: promote it to a real DB category so the edit persists,
  // then hide the original default name to avoid a duplicate. We store the original
  // default name so handleSave can hide it once the promoted category is created.
  const [promotingDefault, setPromotingDefault] = useState<string | null>(null)
  const handleEditDefault = (name: string, type: CategoryType) => {
    setFormData({ name, type, color: '' })
    setEditingId(null)
    setPromotingDefault(name)
    setIsAdding(true)
  }

  // Generic pill edit dispatcher used by the ordered list.
  const handlePillEdit = (pill: CategoryPill, type: CategoryType) => {
    if (pill.isCustom && pill.cat) {
      handleEdit(pill.cat)
    } else {
      handleEditDefault(pill.name, type)
    }
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
          <span className="text-[10px] text-muted-foreground ml-auto">{expenseItems.length}</span>
        </div>
        <p className="text-[10px] text-muted-foreground/70 -mt-1">Drag the handle to reorder. This order is used when adding expenses.</p>
        {expenseItems.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/50 py-1">No categories yet.</p>
        ) : (
          <Reorder.Group
            axis="y"
            values={expenseItems}
            onReorder={(items) => handleReorder('expense', items as CategoryPill[])}
            className="flex flex-col gap-2"
          >
            {expenseItems.map((pill) => (
              <CategoryPillRow
                key={pill.name}
                pill={pill}
                onEdit={() => handlePillEdit(pill, 'expense')}
                onRemove={() =>
                  pill.isCustom && pill.cat
                    ? handleDelete(pill.cat.id, pill.name)
                    : handleHideDefault(pill.name)
                }
              />
            ))}
          </Reorder.Group>
        )}
      </div>

      {/* Income categories card */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-card">
        <div className="flex items-center gap-2 pb-2 border-b border-border/50">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <h3 className="text-[13px] font-bold text-foreground">Income Categories</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">{incomeItems.length}</span>
        </div>
        <p className="text-[10px] text-muted-foreground/70 -mt-1">Drag the handle to reorder. This order is used when adding income.</p>
        {incomeItems.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/50 py-1">No categories yet.</p>
        ) : (
          <Reorder.Group
            axis="y"
            values={incomeItems}
            onReorder={(items) => handleReorder('income', items as CategoryPill[])}
            className="flex flex-col gap-2"
          >
            {incomeItems.map((pill) => (
              <CategoryPillRow
                key={pill.name}
                pill={pill}
                onEdit={() => handlePillEdit(pill, 'income')}
                onRemove={() =>
                  pill.isCustom && pill.cat
                    ? handleDelete(pill.cat.id, pill.name)
                    : handleHideDefault(pill.name)
                }
              />
            ))}
          </Reorder.Group>
        )}
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

// A single draggable category pill row. Uses a dedicated drag handle so the edit /
// remove buttons stay clickable and dragging only starts from the grip.
function CategoryPillRow({
  pill,
  onEdit,
  onRemove,
}: {
  pill: CategoryPill
  onEdit: () => void
  onRemove: () => void
}) {
  const controls = useDragControls()
  const hasColor = !!pill.color

  return (
    <Reorder.Item
      value={pill}
      dragListener={false}
      dragControls={controls}
      className={cn(
        'flex items-center gap-2 text-[12px] font-medium px-2.5 py-2 rounded-xl transition-colors group select-none',
        hasColor ? 'border border-border/40' : 'bg-secondary/60 text-foreground'
      )}
      style={hasColor ? { backgroundColor: `${pill.color}12`, borderColor: `${pill.color}30` } : undefined}
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none"
        title="Drag to reorder"
        aria-label={`Reorder ${pill.name}`}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {hasColor && (
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pill.color }} />
      )}
      <span className="flex-1 truncate">{pill.name}</span>

      {!pill.isCustom && (
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground/40 font-semibold">default</span>
      )}

      <button
        type="button"
        onClick={onEdit}
        className="opacity-50 hover:opacity-100 hover:text-primary transition-opacity"
        title={`Edit ${pill.name}`}
      >
        <Edit2 className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="opacity-40 hover:opacity-100 hover:text-destructive transition-opacity"
        title={pill.isCustom ? `Delete ${pill.name}` : `Remove ${pill.name}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </Reorder.Item>
  )
}
