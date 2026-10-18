'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { cn } from '@/lib/utils'
import { ChevronDown, Check, LayoutGrid, List, Pencil, X, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { sortCategories } from '@/lib/category-order'
import { CategoryIcon } from '@/components/ui/category-icon'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { CustomCategories } from '@/components/modules/custom-categories'
import {
  DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, getDefaultCategory,
} from '@/lib/category-meta'

const DEFAULT_BILL = ['Utilities', 'Subscriptions', 'Insurance', 'Rent', 'Healthcare', 'Transport', 'Internet', 'Phone', 'Other']

interface CategorySelectProps {
  type: 'expense' | 'income' | 'bill'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
}

interface PickItem {
  name: string
  isCustom: boolean
  icon?: string
  color?: string
  createdAt?: string
}

export function CategorySelect({ type, value, onChange, placeholder, className, error }: CategorySelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [query, setQuery] = useState('')
  const [managerOpen, setManagerOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // 'bill' shares the 'expense' category pool
  const effectiveType: 'expense' | 'income' = type === 'bill' ? 'expense' : type

  const customCategories = useLiveQuery(() =>
    db.customCategories.where('type').equals(effectiveType).toArray()
  ) ?? []
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []

  const defaults =
    type === 'expense' ? DEFAULT_EXPENSE_CATEGORIES
    : type === 'income' ? DEFAULT_INCOME_CATEGORIES
    : DEFAULT_BILL

  const usageCount = useMemo(() => {
    const map: Record<string, number> = {}
    const list = Array.isArray(transactions) ? transactions : []
    list.forEach((tx) => { if (tx?.category) map[tx.category] = (map[tx.category] || 0) + 1 })
    return map
  }, [transactions])

  const hiddenDefaults = useMemo(() => {
    if (typeof window === 'undefined') return [] as string[]
    try {
      const stored = localStorage.getItem('pennyflow-hidden-categories')
      if (stored) return JSON.parse(stored) as string[]
    } catch {}
    return [] as string[]
    // Recompute when the dropdown or manager opens so hidden-category edits reflect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, managerOpen])

  const allCategories = useMemo<PickItem[]>(() => {
    const customNames = customCategories.map((c) => c.name.toLowerCase())
    const result: PickItem[] = []
    defaults.forEach((name) => {
      if (!customNames.includes(name.toLowerCase()) && !hiddenDefaults.includes(name)) {
        result.push({ name, isCustom: false })
      }
    })
    customCategories.forEach((c) => {
      result.push({ name: c.name, icon: c.icon, color: c.color, isCustom: true, createdAt: c.createdAt })
    })
    return sortCategories(result, effectiveType, usageCount)
  }, [defaults, customCategories, hiddenDefaults, effectiveType, usageCount])

  // Apply a sensible default selection when none is chosen yet.
  useEffect(() => {
    if (value || allCategories.length === 0) return
    const preferred = getDefaultCategory(effectiveType)
    if (preferred && allCategories.some((c) => c.name === preferred)) {
      onChange(preferred)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCategories.length])

  const filtered = useMemo(() => {
    if (!query.trim()) return allCategories
    const q = query.toLowerCase()
    return allCategories.filter((c) => c.name.toLowerCase().includes(q))
  }, [allCategories, query])

  const selectedCat = allCategories.find((c) => c.name === value)

  useEffect(() => {
    if (!isOpen) return
    const handle = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handle, true)
    return () => document.removeEventListener('mousedown', handle, true)
  }, [isOpen])

  const handleSelect = (name: string) => {
    onChange(name)
    setIsOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex h-11 w-full items-center justify-between rounded-2xl border border-border/70 bg-secondary px-4 py-2 text-sm transition-all',
          'focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring/80',
          isOpen && 'ring-1 ring-ring border-ring/80',
          error && 'border-destructive focus:ring-destructive',
          !value && 'text-muted-foreground',
          value && 'text-foreground',
          className
        )}
      >
        <div className="flex items-center gap-2.5 truncate">
          {value && (
            <CategoryIcon
              name={value}
              type={effectiveType}
              isCustom={selectedCat?.isCustom}
              icon={selectedCat?.icon}
              color={selectedCat?.color}
              size={26}
              iconSize={14}
            />
          )}
          <span className="truncate font-medium text-[13px]">{value || placeholder || 'Select Category'}</span>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0 ml-2', isOpen && 'rotate-180')} />
      </button>

      {error && <span className="text-xs text-destructive px-1 mt-1 block">{error}</span>}

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-1 rounded-2xl border border-border/60 bg-card shadow-lg overflow-hidden"
          >
            {/* Toolbar: title, grid/list toggle, edit */}
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <span className="text-[13px] font-bold text-foreground">Select Category</span>
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5 p-0.5 rounded-full bg-secondary/80">
                  <button
                    type="button"
                    onClick={() => setLayout('grid')}
                    className={cn('p-1.5 rounded-full transition-colors', layout === 'grid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayout('list')}
                    className={cn('p-1.5 rounded-full transition-colors', layout === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
                    aria-label="List view"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setManagerOpen(true); setIsOpen(false) }}
                  className="p-1.5 rounded-full bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Edit categories"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Search (list mode) */}
            {layout === 'list' && (
              <div className="px-3 pb-2">
                <div className="flex items-center gap-2 h-9 px-3 rounded-xl bg-secondary/70 border border-border/50">
                  <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search categories"
                    className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery('')} className="text-muted-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Items */}
            <div className="max-h-[300px] overflow-y-auto p-3 pt-1">
              {filtered.length === 0 ? (
                <p className="text-[12px] text-muted-foreground/60 text-center py-6">No categories found.</p>
              ) : layout === 'grid' ? (
                <div className="grid grid-cols-4 gap-2">
                  {filtered.map((cat) => (
                    <button
                      key={cat.name}
                      type="button"
                      onClick={() => handleSelect(cat.name)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl transition-colors',
                        cat.name === value ? 'bg-primary/10' : 'hover:bg-secondary/70'
                      )}
                    >
                      <CategoryIcon name={cat.name} type={effectiveType} isCustom={cat.isCustom} icon={cat.icon} color={cat.color} size={40} />
                      <span className="text-[10px] font-medium text-foreground text-center leading-tight line-clamp-2">{cat.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {filtered.map((cat) => (
                    <button
                      key={cat.name}
                      type="button"
                      onClick={() => handleSelect(cat.name)}
                      className={cn(
                        'flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-colors',
                        cat.name === value ? 'bg-primary/10' : 'hover:bg-secondary/70'
                      )}
                    >
                      <CategoryIcon name={cat.name} type={effectiveType} isCustom={cat.isCustom} icon={cat.icon} color={cat.color} size={34} iconSize={18} />
                      <span className="flex-1 text-left text-[13px] font-medium text-foreground">{cat.name}</span>
                      {cat.name === value && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full category manager overlay (opened via the pencil) */}
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-5 rounded-t-3xl rounded-b-none sm:rounded-3xl">
          <CustomCategories />
        </DialogContent>
      </Dialog>
    </div>
  )
}
