'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID } from '@/db/schema'
import { cn } from '@/lib/utils'
import { ChevronDown, Check, Plus, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Bank Account' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Credit Card' },
  { value: 'investment', label: 'Investment' },
  { value: 'crypto', label: 'Crypto' },
]

interface AccountSelectProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  error?: string
}

export function AccountSelect({ value, onChange, placeholder, className, error }: AccountSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<string>('bank')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const safeAccounts = Array.isArray(accounts) ? accounts : []

  const selectedAccount = safeAccounts.find(a => a.id === value)

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

  const handleSelect = (id: string) => {
    onChange(id)
    setIsOpen(false)
    setIsAdding(false)
  }

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return

    try {
      const id = generateUUID()
      await db.accounts.add({
        id,
        name,
        type: newType as any,
        balance: 0,
      })
      handleSelect(id)
      setNewName('')
      setNewType('bank')
      setIsAdding(false)
    } catch (err) {
      console.error('Error adding account:', err)
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
        <span className="truncate font-medium text-[13px]">
          {selectedAccount?.name || placeholder || 'Select Account'}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0 ml-2", isOpen && "rotate-180")} />
      </button>

      {error && <span className="text-xs text-destructive px-1 mt-1 block">{error}</span>}

      {/* Dropdown - inline flow */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-1 rounded-2xl border border-border/60 bg-card shadow-lg overflow-hidden"
          >
            <div className="max-h-[220px] overflow-y-auto p-1.5">
              {safeAccounts.length > 0 ? (
                safeAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => handleSelect(acc.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-colors",
                      acc.id === value
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-secondary/80 active:bg-secondary"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground uppercase font-semibold">{acc.type}</span>
                      <span>{acc.name}</span>
                    </div>
                    {acc.id === value && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-3">No accounts yet. Add one below.</p>
              )}
            </div>

            {/* Add new */}
            <div className="border-t border-border/40 p-1.5">
              {!isAdding ? (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-primary hover:bg-primary/5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add new account</span>
                </button>
              ) : (
                <div className="px-2 py-2 space-y-2.5">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
                    placeholder="Account name"
                    className="w-full h-9 px-3 rounded-xl border border-border/70 bg-secondary text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {ACCOUNT_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setNewType(t.value)}
                        className={cn(
                          "text-[10px] px-2.5 py-1 rounded-full font-semibold transition-colors",
                          newType === t.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={!newName.trim()}
                      className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsAdding(false); setNewName('') }}
                      className="h-9 px-3 rounded-xl bg-secondary text-muted-foreground text-xs font-semibold hover:bg-secondary/80"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
