'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, CustomCategory, generateUUID } from '@/db/schema'
import { cn } from '@/lib/utils'
import { ChevronDown, Check, Plus, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'

const COLOR_OPTIONS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

const DEFAULT_EXPENSE = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Utilities', 'Other']
const DEFAULT_INCOME = ['Salary', 'Freelance', 'Investment', 'Bonus', 'Gift', 'Other']
const DEFAULT_BILL = ['Utilities', 'Subscription', 'Insurance', 'Rent', 'Healthcare', 'Transport', 'Other']

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
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_OPTIONS[0])
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const customCategories = useLiveQuery(() =>
    db.customCategories.where('type').equals(type === 'bill' ? 'expense' : type).toArray()
  ) ?? []

  const defaults = type === 'expense' ? DEFAULT_EXPENSE : type === 'income' ? DEFAULT_INCOME : DEFAULT_BILL

  // Combine defaults + custom categories (deduplicated)
  const allCategories = React.useMemo(() => {
    const customNames = customCategories.map(c => c.name)
    const combined = [
      ...defaults.map(name => ({ name, color: undefined, isCustom: false })),
      ...customCategories.map(c => ({ name: c.name, color: c.color, isCustom: true })),
    ]
    // Remove defaults that have a custom override
    return combined.filter((cat, idx, arr) => {
      if (!cat.isCustom) {
        return !customNames.some(cn => cn.toLowerCase() === cat.name.toLowerCase())
      }
      return true
    })
  }, [defaults, customCategories])

  const selectedCategory = allCategories.find(c => c.name === value)

  useEffect(() => {
    setMounted(true)
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
        setIsAdding(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        setIsAdding(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen])

  // Lock body scroll on mobile sheet
  useEffect(() => {
    if (isOpen && isMobile) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isOpen, isMobile])

  // Focus input when adding
  useEffect(() => {
    if (isAdding && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isAdding])

  const handleSelect = (name: string) => {
    onChange(name)
    setIsOpen(false)
    setIsAdding(false)
  }

  const handleAddCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return

    // Check for duplicates
    const exists = allCategories.some(c => c.name.toLowerCase() === name.toLowerCase())
    if (exists) {
      // Just select it
      handleSelect(name)
      setNewCategoryName('')
      setNewCategoryColor(COLOR_OPTIONS[0])
      return
    }

    try {
      await db.customCategories.add({
        id: generateUUID(),
        name,
        type: type === 'bill' ? 'expense' : type,
        color: newCategoryColor,
        createdAt: new Date().toISOString(),
      })
      handleSelect(name)
      setNewCategoryName('')
      setNewCategoryColor(COLOR_OPTIONS[0])
      setIsAdding(false)
    } catch (err) {
      console.error('Error adding category:', err)
    }
  }

  const renderOptions = () => (
    <>
      {/* Category list */}
      <div className="space-y-0.5">
        {allCategories.map((cat) => (
          <button
            key={cat.name}
            type="button"
            onClick={() => handleSelect(cat.name)}
            className={cn(
              "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-all duration-100",
              "active:scale-[0.98]",
              cat.name === value
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-secondary/80"
            )}
          >
            <div className="flex items-center gap-2.5">
              {cat.color && (
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              )}
              <span>{cat.name}</span>
              {cat.isCustom && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">custom</span>
              )}
            </div>
            {cat.name === value && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
          </button>
        ))}
      </div>

      {/* Divider + Add New */}
      <div className="border-t border-border/40 mt-2 pt-2">
        {!isAdding ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsAdding(true) }}
            className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-primary hover:bg-primary/5 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add new category</span>
          </button>
        ) : (
          <div className="px-3 py-2 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCategory()
                  }
                }}
                placeholder="Category name"
                className="flex-1 h-9 px-3 rounded-xl border border-border/70 bg-secondary text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => { setIsAdding(false); setNewCategoryName('') }}
                className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Color picker */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewCategoryColor(color)}
                  className={cn(
                    'w-6 h-6 rounded-full transition-transform',
                    newCategoryColor === color ? 'ring-2 ring-offset-1 ring-offset-background ring-foreground scale-110' : ''
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddCategory}
              disabled={!newCategoryName.trim()}
              className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider disabled:opacity-50 transition-opacity"
            >
              Add Category
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="flex flex-col space-y-1.5 w-full">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-2xl border border-border/70 bg-secondary px-4 py-2 text-sm transition-all",
          "focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring/80",
          "active:scale-[0.98]",
          isOpen && "ring-1 ring-ring border-ring/80",
          error && "border-destructive focus:ring-destructive",
          !value && "text-muted-foreground",
          value && "text-foreground",
          className
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-2 truncate">
          {selectedCategory?.color && (
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedCategory.color }} />
          )}
          <span className="truncate font-medium text-[13px]">
            {value || placeholder || 'Select Category'}
          </span>
        </div>
        <ChevronDown className={cn(
          "h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0 ml-2",
          isOpen && "rotate-180"
        )} />
      </button>

      {error && (
        <span className="text-xs text-destructive px-1">{error}</span>
      )}

      {/* Portal dropdown */}
      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            isMobile ? (
              // Mobile bottom sheet
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
                  onClick={() => { setIsOpen(false); setIsAdding(false) }}
                />
                <motion.div
                  ref={dropdownRef}
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                  className="fixed bottom-0 left-0 right-0 z-[9999] max-h-[75vh] rounded-t-3xl border-t border-border/60 bg-card shadow-2xl"
                >
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
                  </div>
                  <div className="px-6 pt-2 pb-3 border-b border-border/40">
                    <h3 className="text-sm font-bold text-foreground">
                      {type === 'expense' ? 'Expense' : type === 'income' ? 'Income' : 'Bill'} Category
                    </h3>
                  </div>
                  <div className="overflow-y-auto max-h-[calc(75vh-90px)] px-3 py-2 pb-8">
                    {renderOptions()}
                  </div>
                  <div className="h-[env(safe-area-inset-bottom,0px)]" />
                </motion.div>
              </>
            ) : (
              // Desktop dropdown
              <DesktopCategoryDropdown
                ref={dropdownRef}
                triggerRef={triggerRef}
                itemCount={allCategories.length + (isAdding ? 8 : 2)}
              >
                {renderOptions()}
              </DesktopCategoryDropdown>
            )
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

// Desktop floating dropdown wrapper
interface DesktopDropdownProps {
  triggerRef: React.RefObject<HTMLButtonElement | null>
  itemCount: number
  children: React.ReactNode
}

const DesktopCategoryDropdown = React.forwardRef<HTMLDivElement, DesktopDropdownProps>(
  ({ triggerRef, itemCount, children }, ref) => {
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })

    useEffect(() => {
      if (triggerRef?.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const dropdownHeight = Math.min(itemCount * 44 + 120, 440)
        const spaceBelow = window.innerHeight - rect.bottom
        const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight

        setPosition({
          top: showAbove ? rect.top - dropdownHeight - 4 + window.scrollY : rect.bottom + 4 + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
        })
      }
    }, [triggerRef, itemCount])

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: -4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.97 }}
        transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
        style={{ position: 'absolute', top: position.top, left: position.left, width: position.width, zIndex: 9999 }}
        className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl shadow-black/20 backdrop-blur-xl"
      >
        <div className="max-h-[400px] overflow-y-auto p-1.5">
          {children}
        </div>
      </motion.div>
    )
  }
)
DesktopCategoryDropdown.displayName = "DesktopCategoryDropdown"
