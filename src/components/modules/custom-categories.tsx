'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, CustomCategory, generateUUID } from '@/db/schema'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Plus, Tag, Trash2, Edit2, X, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

const COLOR_OPTIONS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

const DEFAULT_EXPENSE = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Utilities', 'Other']
const DEFAULT_INCOME = ['Salary', 'Freelance', 'Investment', 'Bonus', 'Gift', 'Other']

export function CustomCategories() {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    type: 'income' | 'expense'
    color: string
  }>({ name: '', type: 'expense', color: COLOR_OPTIONS[0] })

  const categories = useLiveQuery(() => db.customCategories.toArray()) ?? []
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []

  const safeCategories = Array.isArray(categories) ? categories : []
  const safeTransactions = Array.isArray(transactions) ? transactions : []

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

    // Prevent duplicates (same name + type)
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

  const handleDelete = async (id: string) => {
    if (confirm('Delete this category? Existing transactions keep their label.')) {
      await db.customCategories.delete(id)
    }
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
                onClick={() => handleDelete(cat.id)}
                className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {list.length === 0 && (
        <p className="text-xs text-muted-foreground/70 px-1 py-2">
          No custom {type} categories yet. Defaults are always available.
        </p>
      )}
    </div>
  )

  return (
    <div className="flex flex-col space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Categories</h1>
        <p className="text-xs text-muted-foreground">Create custom categories for smarter tracking.</p>
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
        <div className="flex flex-wrap gap-1.5 mb-2">
          {DEFAULT_EXPENSE.map((c) => (
            <span key={c} className="text-[10px] px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground">
              {c}
            </span>
          ))}
        </div>
        {renderCategoryList(expenseCategories, 'expense')}
      </div>

      {/* Income categories */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-bold">Income Categories</h3>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {DEFAULT_INCOME.map((c) => (
            <span key={c} className="text-[10px] px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground">
              {c}
            </span>
          ))}
        </div>
        {renderCategoryList(incomeCategories, 'income')}
      </div>

      {!isAdding && (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full h-11 rounded-full bg-foreground text-background font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      )}
    </div>
  )
}
