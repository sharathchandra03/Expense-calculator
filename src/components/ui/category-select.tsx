'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID } from '@/db/schema'
import { cn } from '@/lib/utils'
import { ChevronDown, Check, Plus, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const COLOR_OPTIONS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

const DEFAULT_EXPENSE = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Utilities', 'Rent', 'Healthcare', 'Education', 'Subscriptions', 'Other']
const DEFAULT_INCOME = ['Salary', 'Freelance', 'Investment', 'Bonus', 'Gift', 'Rental Income', 'Interest', 'Other']
const DEFAULT_BILL = ['Utilities', 'Subscription', 'Insurance', 'Rent', 'Healthcare', 'Transport', 'Internet', 'Phone', 'Other']

interface CategorySelectProps {
  type: 'expense' | 'income' | 'bill'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
}

export function CategorySelect({ type, value, onChange, placeholder, className, error }: CategorySelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const customCategories = useLiveQuery(() =>
    db.customCategories.where('type').equals(type === 'bill' ? 'expense' : type).toArray()
  ) ?? []

  const defaults = type === 'expense' ? DEFAULT_EXPENSE : type === 'income' ? DEFAULT_INCOME : DEFAULT_BILL

  // Get hidden categories from localStorage
  const hiddenDefaults = React.useMemo(() => {
    if (typeof window === 'undefined') return [] as string[]
    try {
      const stored = localStorage.getItem('pennyflow-hidden-categories')
      if (stored) return JSON.parse(stored) as string[]
    } catch {}
    return [] as string[]
  }, [isOpen]) // recalculate when dropdown opens

  const allCategories = React.useMemo(() => {
    const customNames = customCategories.map(c => c.name.toLowerCase())
    const result: { name: string; color?: string; isCustom: boolean }[] = []
    defaults.forEach(name => {
      if (!customNames.includes(name.toLowerCase()) && !hiddenDefaults.includes(name)) {
        result.push({ name, color: undefined, isCustom: false })
      }
    })
    customCategories.forEach(c => {
      result.push({ name: c.name, color: c.color, isCustom: true })
    })
    return result
  }, [defaults, customCategories, hiddenDefaults])

  const selectedCat = allCategories.find(c => c.name === value)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handle = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setIsAdding(false)
      }
    }
    document.addEventListener('mousedown', handle, true)
    return () => document.removeEventListener('mousedown', handle, true)
  }, [isOpen])

  useEffect(() => {
    if (isAdding && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isAdding])

  const handleSelect = (name: string) => {
    onChange(name)
    setIsOpen(false)
    setIsAdding(false)
  }

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    const exists = allCategories.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (exists) {
      handleSelect(exists.name)
      setNewName('')
      return
    }
    try {
      await db.customCategories.add({
        id: generateUUID(),
        name,
        type: type === 'bill' ? 'expense' : type,
        color: newColor,
        createdAt: new Date().toISOString(),
      })
      handleSelect(name)
      setNewName('')
      setNewColor(COLOR_OPTIONS[0])
      setIsAdding(false)
    } catch (err) {
      console.error('Error adding category:', err)
    }
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-2xl border border-border/70 bg-secondary px-4 py-2 text-sm transition-all",
          "focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring/80",
          isOpen && "ring-1 ring-ring border-ring/80",
          error && "border-destructive focus:ring-destructive",
          !value && "text-muted-foreground",
          value && "text-foreground",
          className
        )}
      >
        <div className="flex items-center gap-2 truncate">
          {selectedCat?.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedCat.color }} />}
          <span className="truncate font-medium text-[13px]">{value || placeholder || 'Select Category'}</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0 ml-2", isOpen && "rotate-180")} />
      </button>

      {error && <span className="text-xs text-destructive px-1 mt-1 block">{error}</span>}

      {/* Dropdown - inline flow, pushes content down */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-1 rounded-2xl border border-border/60 bg-card shadow-lg overflow-hidden"
          >
            <div className="max-h-[240px] overflow-y-auto p-1.5">
              {allCategories.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => handleSelect(cat.name)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-colors",
                    cat.name === value
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-secondary/80 active:bg-secondary"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {cat.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />}
                    <span>{cat.name}</span>
                  </div>
                  {cat.name === value && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                </button>
              ))}
            </div>

            {/* Add new section */}
            <div className="border-t border-border/40 p-1.5">
              {!isAdding ? (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-primary hover:bg-primary/5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add new category</span>
                </button>
              ) : (
                <div className="px-2 py-2 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
                      placeholder="Category name"
                      className="flex-1 h-9 px-3 rounded-xl border border-border/70 bg-secondary text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button type="button" onClick={() => { setIsAdding(false); setNewName('') }} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewColor(color)}
                        className={cn('w-6 h-6 rounded-full transition-transform', newColor === color ? 'ring-2 ring-offset-1 ring-offset-background ring-foreground scale-110' : '')}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!newName.trim()}
                    className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider disabled:opacity-50"
                  >
                    Add Category
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
