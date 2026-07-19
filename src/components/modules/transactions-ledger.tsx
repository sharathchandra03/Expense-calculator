'use client'

import React, { useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Transaction, SystemLog, generateUUID, syncAccountToAsset } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Trash2, Search, ArrowUpRight, ArrowDownRight, Tag, Calendar, Layers, ShieldCheck, Sparkles, Wallet, Copy, Edit2, X, Check, Camera, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from 'framer-motion'
import { useUndo } from '@/components/ui/undo-toast'
import { getCategoryConfig } from '@/lib/category-icons'

export function TransactionsLedger({ onNavigateToTab }: { onNavigateToTab?: (tab: string) => void } = {}) {
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<{ amount: string; description: string; category: string; date: string; accountId: string }>({ amount: '', description: '', category: '', date: '', accountId: '' })
  const [receiptLightbox, setReceiptLightbox] = useState<string | null>(null)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return { month: now.getMonth(), year: now.getFullYear() }
  })
  const [viewTab, setViewTab] = useState<'daily' | 'calendar' | 'monthly' | 'total' | 'note'>('daily')

  const { showUndo } = useUndo()

  // Dexie Queries with null safety
  const rawTransactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []

  // Ensure arrays are never undefined
  const safeTransactions = Array.isArray(rawTransactions) ? rawTransactions : []
  const safeAccounts = Array.isArray(accounts) ? accounts : []

  // Filter & Search Transactions
  const filteredTransactions = safeTransactions
    .filter((tx) => {
      const searchTerm = search.trim().toLowerCase()
      const matchSearch = !searchTerm || tx.description.toLowerCase().includes(searchTerm) || 
                          tx.category.toLowerCase().includes(searchTerm)
      const matchType = typeFilter === 'all' || tx.type === typeFilter
      const matchCategory = !categoryFilter || tx.category === categoryFilter
      return matchSearch && matchType && matchCategory
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Categories list
  const categories = Array.from(new Set(safeTransactions.map((tx) => tx.category)))

  // Filter transactions for current month
  const monthTransactions = filteredTransactions.filter((tx) => {
    const txDate = new Date(tx.date + 'T00:00:00')
    return txDate.getMonth() === currentMonth.month && txDate.getFullYear() === currentMonth.year
  })

  // Monthly totals
  const monthIncome = monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const monthExpense = monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const monthTotal = monthIncome - monthExpense

  // Group month transactions by date
  const monthGrouped: { [key: string]: Transaction[] } = {}
  monthTransactions.forEach((tx) => {
    if (!monthGrouped[tx.date]) monthGrouped[tx.date] = []
    monthGrouped[tx.date].push(tx)
  })

  // Sort dates descending
  const sortedDates = Object.keys(monthGrouped).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

  // Month name helper
  const getMonthName = (month: number, year: number) => {
    return new Date(year, month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  const goToPrevMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 0) return { month: 11, year: prev.year - 1 }
      return { month: prev.month - 1, year: prev.year }
    })
  }

  const goToNextMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 11) return { month: 0, year: prev.year + 1 }
      return { month: prev.month + 1, year: prev.year }
    })
  }

  // Format date for daily group header
  const formatDayHeader = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    const day = d.getDate().toString().padStart(2, '0')
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
    const monthNum = (d.getMonth() + 1).toString().padStart(2, '0')
    const year = d.getFullYear()
    return { day, weekday, monthYear: `${monthNum}.${year}` }
  }

  // Get weekday color badge
  const getWeekdayColor = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    const dayOfWeek = d.getDay()
    if (dayOfWeek === 0) return 'bg-red-500'
    if (dayOfWeek === 6) return 'bg-blue-500'
    return 'bg-zinc-600'
  }

  // Handle Delete Transaction with Undo
  const handleDeleteTransaction = async (tx: Transaction) => {
    const { id, amount, type, accountId } = tx
    const multiplier = type === 'expense' ? 1 : -1
    const delta = amount * multiplier

    try {
      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        await db.transactions.delete(id)
        const account = await db.accounts.get(accountId)
        if (account) {
          const newBalance = account.balance + delta
          await db.accounts.update(accountId, { balance: newBalance })
          await syncAccountToAsset(account.name, newBalance)
        }
        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'system',
          description: `Deleted ${type} record of ${formatCurrency(amount)}. Balance restored.`,
          amount: delta
        })
      })

      showUndo(`${tx.description || tx.category} deleted`, async () => {
        await db.transaction('rw', [db.transactions, db.accounts, db.assets], async () => {
          await db.transactions.add(tx)
          const account = await db.accounts.get(accountId)
          if (account) {
            const revertBalance = account.balance - delta
            await db.accounts.update(accountId, { balance: revertBalance })
            await syncAccountToAsset(account.name, revertBalance)
          }
        })
      })
    } catch (err) {
      console.error('Failed to delete transaction:', err)
    }
  }

  // Handle Duplicate Transaction
  const handleDuplicateTransaction = async (tx: Transaction) => {
    const todayStr = new Date().toISOString().split('T')[0]
    const newId = generateUUID()

    try {
      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        await db.transactions.add({ ...tx, id: newId, date: todayStr })
        const account = await db.accounts.get(tx.accountId)
        if (account) {
          const delta = tx.type === 'expense' ? -tx.amount : tx.amount
          const newBalance = account.balance + delta
          await db.accounts.update(tx.accountId, { balance: newBalance })
          await syncAccountToAsset(account.name, newBalance)
        }
        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'transaction',
          description: `Duplicated: ${tx.description} (${formatCurrency(tx.amount)})`,
          amount: tx.type === 'expense' ? -tx.amount : tx.amount,
        })
      })

      showUndo(`Duplicated ${tx.description || tx.category}`, async () => {
        await db.transactions.delete(newId)
        const account = await db.accounts.get(tx.accountId)
        if (account) {
          const revertDelta = tx.type === 'expense' ? tx.amount : -tx.amount
          const revertBal = account.balance + revertDelta
          await db.accounts.update(tx.accountId, { balance: revertBal })
          await syncAccountToAsset(account.name, revertBal)
        }
      })
    } catch (err) {
      console.error('Failed to duplicate:', err)
    }
  }

  // Handle Edit Save - supports date, amount, description, category, account
  const handleEditSave = async (tx: Transaction) => {
    const newAmount = parseFloat(editData.amount)
    if (isNaN(newAmount) || newAmount <= 0) return

    const amountDiff = newAmount - tx.amount
    const newAccountId = editData.accountId || tx.accountId
    const accountChanged = newAccountId !== tx.accountId

    try {
      await db.transaction('rw', [db.transactions, db.accounts, db.assets], async () => {
        await db.transactions.update(tx.id, {
          amount: newAmount,
          description: editData.description || tx.description,
          category: editData.category || tx.category,
          date: editData.date || tx.date,
          accountId: newAccountId,
        })

        if (accountChanged) {
          const oldAccount = await db.accounts.get(tx.accountId)
          if (oldAccount) {
            const restoreAmount = tx.type === 'expense' ? tx.amount : -tx.amount
            const restoredBalance = oldAccount.balance + restoreAmount
            await db.accounts.update(tx.accountId, { balance: restoredBalance })
            await syncAccountToAsset(oldAccount.name, restoredBalance)
          }
          const newAccount = await db.accounts.get(newAccountId)
          if (newAccount) {
            const deductAmount = tx.type === 'expense' ? -newAmount : newAmount
            const newBalance = newAccount.balance + deductAmount
            await db.accounts.update(newAccountId, { balance: newBalance })
            await syncAccountToAsset(newAccount.name, newBalance)
          }
        } else if (amountDiff !== 0) {
          const balanceDelta = tx.type === 'expense' ? -amountDiff : amountDiff
          const account = await db.accounts.get(tx.accountId)
          if (account) {
            const newBalance = account.balance + balanceDelta
            await db.accounts.update(tx.accountId, { balance: newBalance })
            await syncAccountToAsset(account.name, newBalance)
          }
        }
      })
      setEditingId(null)
    } catch (err) {
      console.error('Failed to edit:', err)
    }
  }

  return (
    <div className="flex flex-col pb-24 -mx-5 -mt-4">
      {/* Month Navigation Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={goToPrevMonth} className="text-muted-foreground hover:text-foreground p-1 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[15px] font-semibold text-foreground tracking-tight min-w-[100px] text-center">
            {getMonthName(currentMonth.month, currentMonth.year)}
          </span>
          <button onClick={goToNextMonth} className="text-muted-foreground hover:text-foreground p-1 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* View Tabs */}
      <div className="flex border-b border-border/50 px-4">
        {(['daily', 'calendar', 'monthly', 'total', 'note'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setViewTab(tab)}
            className={cn(
              "flex-1 py-2.5 text-[11px] font-medium text-center capitalize transition-all",
              viewTab === tab
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === 'daily' ? 'Daily' : tab}
          </button>
        ))}
      </div>

      {/* Monthly Summary Bar */}
      <div className="grid grid-cols-3 px-5 py-3.5 border-b border-border/40">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Income</p>
          <p className="text-[13px] font-semibold text-emerald-500">{formatCurrency(monthIncome)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Expenses</p>
          <p className="text-[13px] font-semibold text-foreground">{formatCurrency(monthExpense)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground mb-0.5">Net</p>
          <p className={cn("text-[13px] font-semibold", monthTotal >= 0 ? "text-emerald-500" : "text-destructive")}>
            {monthTotal < 0 ? '-' : '+'}{formatCurrency(Math.abs(monthTotal))}
          </p>
        </div>
      </div>

      {/* Search bar (collapsible) */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border/30"
          >
            <div className="px-4 py-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  className="w-full h-9 rounded-lg bg-secondary border border-border pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === TAB CONTENT === */}
      {viewTab === 'daily' && (
        <div className="flex flex-col">
          {sortedDates.length > 0 ? (
            sortedDates.map((date) => {
              const dayTx = monthGrouped[date]
              const dayIncome = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
              const dayExpense = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
              const { day, weekday, monthYear } = formatDayHeader(date)

              return (
                <div key={date}>
                  {/* Day Header Row */}
                  <div className="flex items-center justify-between px-5 py-2.5 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-foreground">{day}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {weekday}
                      </span>
                      <span className="text-[11px] text-muted-foreground/60">{monthYear}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {dayExpense > 0 && (
                        <span className="text-[11px] font-medium text-foreground">
                          -{formatCurrency(dayExpense)}
                        </span>
                      )}
                      {dayIncome > 0 && (
                        <span className="text-[11px] font-medium text-emerald-500">
                          +{formatCurrency(dayIncome)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Transaction Items */}
                  {dayTx.map((tx) => {
                    const account = safeAccounts.find((a) => a.id === tx.accountId)
                    const isEditing = editingId === tx.id
                    const catConfig = getCategoryConfig(tx.category)

                    return (
                      <div key={tx.id} className="relative">
                        <div className="absolute inset-0 flex items-center justify-between px-4">
                          <div className="flex items-center gap-1 text-emerald-500">
                            <Copy className="w-3.5 h-3.5" />
                            <span className="text-[9px] font-bold">Duplicate</span>
                          </div>
                          <div className="flex items-center gap-1 text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="text-[9px] font-bold">Delete</span>
                          </div>
                        </div>

                        <motion.div
                          drag="x"
                          dragConstraints={{ left: -100, right: 100 }}
                          dragElastic={0.1}
                          onDragEnd={(_, info: PanInfo) => {
                            if (info.offset.x < -80) handleDeleteTransaction(tx)
                            else if (info.offset.x > 80) handleDuplicateTransaction(tx)
                          }}
                          className="relative bg-background cursor-grab active:cursor-grabbing"
                        >
                          <div
                            onClick={() => {
                              if (isEditing) return
                              setEditingId(tx.id)
                              setEditData({
                                amount: tx.amount.toString(),
                                description: tx.description,
                                category: tx.category,
                                date: tx.date,
                                accountId: tx.accountId,
                              })
                            }}
                            className="flex items-center gap-3 px-5 py-3.5 border-b border-border/40 group hover:bg-secondary/30 transition-colors"
                          >
                            {/* Category icon */}
                            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0", catConfig.bg)}>
                              {catConfig.emoji}
                            </div>

                            {/* Description & meta */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-semibold text-foreground truncate">{tx.description || tx.category}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 truncate capitalize">
                                {catConfig.label} · {new Date(tx.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                              </p>
                            </div>

                            {/* Amount + account */}
                            <div className="flex-shrink-0 text-right">
                              <span className={cn("text-[14px] font-bold", tx.type === 'income' ? 'text-positive' : 'text-negative')}>
                                {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                              </span>
                              {account && <p className="text-[11px] text-muted-foreground mt-0.5">{account.name}</p>}
                            </div>
                          </div>

                          <AnimatePresence>
                            {isEditing && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden border-b border-border/30 bg-secondary/50"
                              >
                                <div className="p-3 space-y-2">
                                  <div className="flex gap-2">
                                    <input type="number" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className="w-24 h-8 px-2 rounded-lg bg-secondary border border-border text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Amount" />
                                    <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className="flex-1 h-8 px-2 rounded-lg bg-secondary border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Description" />
                                  </div>
                                  <div className="flex gap-2">
                                    <input type="date" value={editData.date} onChange={(e) => setEditData({ ...editData, date: e.target.value })} className="flex-1 h-8 px-2 rounded-lg bg-secondary border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                                    <select value={editData.accountId} onChange={(e) => setEditData({ ...editData, accountId: e.target.value })} className="flex-1 h-8 px-2 rounded-lg bg-secondary border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none">
                                      {safeAccounts.map((acc) => (<option key={acc.id} value={acc.id}>{acc.name}</option>))}
                                    </select>
                                  </div>
                                  {tx.receiptImage && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setReceiptLightbox(tx.receiptImage!) }} className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 transition-colors">
                                      <img src={tx.receiptImage} alt="Receipt" className="w-8 h-8 rounded object-cover" />
                                      <span className="text-[10px] font-medium text-amber-500">View Receipt</span>
                                    </button>
                                  )}
                                  <div className="flex items-center justify-between">
                                    <input type="text" value={editData.category} onChange={(e) => setEditData({ ...editData, category: e.target.value })} className="w-32 h-8 px-2 rounded-lg bg-secondary border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Category" />
                                    <div className="flex gap-1.5">
                                      <button onClick={(e) => { e.stopPropagation(); handleEditSave(tx) }} className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-500 transition-colors"><Check className="w-3 h-3 inline mr-1" />Save</button>
                                      <button onClick={(e) => { e.stopPropagation(); setEditingId(null) }} className="h-8 px-2 rounded-lg bg-secondary text-muted-foreground text-[10px] font-bold hover:text-foreground transition-colors"><X className="w-3 h-3" /></button>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      </div>
                    )
                  })}
                </div>
              )
            })
          ) : (
            <div className="text-center py-20 px-5">
              <p className="text-[15px] font-medium text-muted-foreground">No transactions</p>
              <p className="text-[13px] text-muted-foreground/60 mt-1">Nothing recorded this month yet</p>
            </div>
          )}
        </div>
      )}

      {/* CALENDAR VIEW */}
      {viewTab === 'calendar' && (
        <CalendarView
          currentMonth={currentMonth}
          monthTransactions={monthTransactions}
          safeAccounts={safeAccounts}
        />
      )}

      {/* MONTHLY VIEW */}
      {viewTab === 'monthly' && (
        <MonthlyView
          currentMonth={currentMonth}
          filteredTransactions={filteredTransactions}
        />
      )}

      {/* TOTAL VIEW */}
      {viewTab === 'total' && (
        <TotalView
          currentMonth={currentMonth}
          monthTransactions={monthTransactions}
          monthIncome={monthIncome}
          monthExpense={monthExpense}
          safeAccounts={safeAccounts}
          filteredTransactions={filteredTransactions}
          onNavigateToTab={onNavigateToTab}
        />
      )}

      {/* NOTE VIEW */}
      {viewTab === 'note' && (
        <NoteView />
      )}

      {/* Receipt Lightbox */}
      <AnimatePresence>
        {receiptLightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setReceiptLightbox(null)}
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={receiptLightbox}
              alt="Receipt"
              className="max-w-full max-h-[80vh] rounded-2xl object-contain shadow-2xl"
            />
            <button
              onClick={() => setReceiptLightbox(null)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// === CALENDAR VIEW COMPONENT ===
function CalendarView({ currentMonth, monthTransactions, safeAccounts }: {
  currentMonth: { month: number; year: number }
  monthTransactions: Transaction[]
  safeAccounts: { id: string; name: string }[]
}) {
  const year = currentMonth.year
  const month = currentMonth.month

  // Get first day of month and total days
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  // Monday = 0, Sunday = 6 (ISO week)
  const startDayOfWeek = (firstDay.getDay() + 6) % 7

  // Build calendar grid (6 weeks max)
  const weeks: (number | null)[][] = []
  let dayCounter = 1
  for (let w = 0; w < 6; w++) {
    const week: (number | null)[] = []
    for (let d = 0; d < 7; d++) {
      if (w === 0 && d < startDayOfWeek) {
        // Previous month days
        const prevMonthLastDay = new Date(year, month, 0).getDate()
        week.push(-(prevMonthLastDay - startDayOfWeek + d + 1))
      } else if (dayCounter > daysInMonth) {
        // Next month days
        week.push(-(dayCounter - daysInMonth))
        dayCounter++
      } else {
        week.push(dayCounter)
        dayCounter++
      }
    }
    weeks.push(week)
    if (dayCounter > daysInMonth && w >= 3) break
  }

  // Group transactions by day number
  const txByDay: { [day: number]: { income: number; expense: number } } = {}
  monthTransactions.forEach(tx => {
    const d = new Date(tx.date + 'T00:00:00').getDate()
    if (!txByDay[d]) txByDay[d] = { income: 0, expense: 0 }
    if (tx.type === 'income') txByDay[d].income += tx.amount
    else txByDay[d].expense += tx.amount
  })

  const today = new Date()
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year
  const todayDate = today.getDate()

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="flex flex-col">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border/30">
        {weekDays.map((wd, i) => (
          <div key={wd} className={cn(
            "text-center py-2 text-[10px] font-bold",
            i === 5 ? "text-blue-400" : i === 6 ? "text-red-400" : "text-muted-foreground"
          )}>
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-border/20">
          {week.map((day, di) => {
            const isOutside = day !== null && day <= 0
            const actualDay = day !== null ? (isOutside ? Math.abs(day) : day) : null
            const dayData = !isOutside && day ? txByDay[day] : null
            const isToday = isCurrentMonth && !isOutside && day === todayDate
            const total = dayData ? dayData.income - dayData.expense : 0

            return (
              <div
                key={di}
                className={cn(
                  "min-h-[70px] p-1 border-r border-border/10 last:border-r-0",
                  isToday ? "bg-secondary/60" : "",
                  isOutside ? "opacity-30" : ""
                )}
              >
                <p className={cn(
                  "text-[11px] font-medium",
                  di === 5 ? "text-blue-400" : di === 6 ? "text-red-400" : "text-foreground",
                  isOutside ? "text-muted-foreground" : ""
                )}>
                  {actualDay}
                </p>
                {dayData && (
                  <div className="mt-0.5 space-y-0">
                    {dayData.income > 0 && (
                      <p className="text-[8px] font-medium text-blue-400 truncate">
                        {dayData.income.toLocaleString('en-IN')}
                      </p>
                    )}
                    {dayData.expense > 0 && (
                      <p className="text-[8px] font-medium text-red-400 truncate">
                        {dayData.expense.toLocaleString('en-IN')}
                      </p>
                    )}
                    {dayData.income > 0 && dayData.expense > 0 && (
                      <p className={cn("text-[8px] font-medium truncate", total >= 0 ? "text-muted-foreground" : "text-red-300")}>
                        {total >= 0 ? '' : '-'}{Math.abs(total).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// === MONTHLY VIEW COMPONENT ===
function MonthlyView({ currentMonth, filteredTransactions }: {
  currentMonth: { month: number; year: number }
  filteredTransactions: Transaction[]
}) {
  const [expandedMonth, setExpandedMonth] = useState<string | null>('current')
  const year = currentMonth.year
  const month = currentMonth.month

  // Helper to get weeks for any month
  const getWeeksForMonth = (m: number, y: number) => {
    const lastDay = new Date(y, m + 1, 0)
    const daysInMonth = lastDay.getDate()
    const weeks: { start: string; end: string; startDate: Date; endDate: Date }[] = []
    let weekStart = new Date(y, m, 1)
    const firstDayOfWeek = (weekStart.getDay() + 6) % 7
    if (firstDayOfWeek > 0) {
      weekStart = new Date(y, m, 1 - firstDayOfWeek)
    }
    while (weekStart <= lastDay || weeks.length === 0) {
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      const startStr = `${String(weekStart.getDate()).padStart(2, '0')}.${String(weekStart.getMonth() + 1).padStart(2, '0')}`
      const endStr = `${String(weekEnd.getDate()).padStart(2, '0')}.${String(weekEnd.getMonth() + 1).padStart(2, '0')}`
      weeks.push({ start: startStr, end: endStr, startDate: new Date(weekStart), endDate: new Date(weekEnd) })
      weekStart = new Date(weekEnd)
      weekStart.setDate(weekStart.getDate() + 1)
    }
    return weeks
  }

  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const weeks = getWeeksForMonth(month, year)

  // Current month transactions
  const currentMonthTx = filteredTransactions.filter(tx => {
    const d = new Date(tx.date + 'T00:00:00')
    return d.getMonth() === month && d.getFullYear() === year
  })
  const currentMonthIncome = currentMonthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const currentMonthExpense = currentMonthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  // Previous months summary (most recent 12)
  const monthSummaries: { month: number; year: number; label: string; income: number; expense: number; key: string }[] = []
  for (let i = 1; i <= 12; i++) {
    let m = month - i
    let y = year
    if (m < 0) { m += 12; y-- }
    const mTx = filteredTransactions.filter(tx => {
      const d = new Date(tx.date + 'T00:00:00')
      return d.getMonth() === m && d.getFullYear() === y
    })
    if (mTx.length === 0 && i > 6) continue
    const income = mTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = mTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const label = new Date(y, m).toLocaleDateString('en-US', { month: 'short' })
    monthSummaries.push({ month: m, year: y, label, income, expense, key: `${y}-${m}` })
  }

  const toggleMonth = (key: string) => {
    setExpandedMonth(prev => prev === key ? null : key)
  }

  return (
    <div className="flex flex-col">
      {/* Current month header - clickable to expand/collapse */}
      <div
        onClick={() => toggleMonth('current')}
        className="flex items-center justify-between px-4 py-3 bg-secondary/40 border-b border-border/30 cursor-pointer hover:bg-secondary/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className={cn("w-3 h-3 text-muted-foreground transition-transform", expandedMonth === 'current' ? "rotate-90" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <div>
            <span className="text-base font-bold text-foreground">
              {new Date(year, month).toLocaleDateString('en-US', { month: 'short' })}
            </span>
            <p className="text-[9px] text-muted-foreground">
              {month + 1}.1 ~ {month + 1}.{daysInMonth}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-[11px] font-semibold text-blue-400">{formatCurrency(currentMonthIncome)}</span>
          <div className="text-right">
            <span className="text-[11px] font-semibold text-red-400">{formatCurrency(currentMonthExpense)}</span>
            <p className={cn("text-[9px] font-medium", currentMonthIncome - currentMonthExpense >= 0 ? "text-muted-foreground" : "text-red-300")}>
              {formatCurrency(currentMonthIncome - currentMonthExpense)}
            </p>
          </div>
        </div>
      </div>

      {/* Weekly breakdown - collapsible */}
      <AnimatePresence>
        {expandedMonth === 'current' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {weeks.map((week, i) => {
              const weekTx = currentMonthTx.filter(tx => {
                const d = new Date(tx.date + 'T00:00:00')
                return d >= week.startDate && d <= week.endDate
              })
              const wIncome = weekTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
              const wExpense = weekTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
              const wTotal = wIncome - wExpense
              const isCurrentWeek = new Date() >= week.startDate && new Date() <= week.endDate

              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between px-4 pl-8 py-2.5 border-b border-border/20",
                    isCurrentWeek ? "bg-red-500/5 border-l-2 border-l-red-500" : ""
                  )}
                >
                  <span className="text-[11px] text-muted-foreground min-w-[100px]">
                    {week.start} ~ {week.end}
                  </span>
                  <span className="text-[11px] font-medium text-blue-400">{formatCurrency(wIncome)}</span>
                  <div className="text-right">
                    <span className="text-[11px] font-semibold text-red-400">{formatCurrency(wExpense)}</span>
                    {(wIncome > 0 || wExpense > 0) && (
                      <p className={cn("text-[9px]", wTotal >= 0 ? "text-muted-foreground" : "text-red-300")}>
                        Total {formatCurrency(wTotal)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Previous months - each clickable to expand */}
      {monthSummaries.map((ms) => {
        const total = ms.income - ms.expense
        const isExpanded = expandedMonth === ms.key
        const msWeeks = getWeeksForMonth(ms.month, ms.year)
        const msTx = filteredTransactions.filter(tx => {
          const d = new Date(tx.date + 'T00:00:00')
          return d.getMonth() === ms.month && d.getFullYear() === ms.year
        })

        return (
          <div key={ms.key}>
            {/* Month row - clickable */}
            <div
              onClick={() => toggleMonth(ms.key)}
              className="flex items-center justify-between px-4 py-3.5 border-b border-border/20 cursor-pointer hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className={cn("w-3 h-3 text-muted-foreground transition-transform", isExpanded ? "rotate-90" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <span className="text-sm font-bold text-foreground">{ms.label}</span>
              </div>
              <span className="text-[11px] font-medium text-blue-400">{formatCurrency(ms.income)}</span>
              <div className="text-right">
                <span className="text-[11px] font-semibold text-red-400">{formatCurrency(ms.expense)}</span>
                <p className={cn("text-[9px]", total >= 0 ? "text-muted-foreground" : "text-red-300")}>
                  {formatCurrency(total)}
                </p>
              </div>
            </div>

            {/* Expanded weekly breakdown */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden bg-secondary/20"
                >
                  {msWeeks.map((week, i) => {
                    const weekTx = msTx.filter(tx => {
                      const d = new Date(tx.date + 'T00:00:00')
                      return d >= week.startDate && d <= week.endDate
                    })
                    const wIncome = weekTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
                    const wExpense = weekTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
                    const wTotal = wIncome - wExpense

                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between px-4 pl-8 py-2.5 border-b border-border/10"
                      >
                        <span className="text-[10px] text-muted-foreground min-w-[100px]">
                          {week.start} ~ {week.end}
                        </span>
                        <span className="text-[10px] font-medium text-blue-400">{formatCurrency(wIncome)}</span>
                        <div className="text-right">
                          <span className="text-[10px] font-semibold text-red-400">{formatCurrency(wExpense)}</span>
                          {(wIncome > 0 || wExpense > 0) && (
                            <p className={cn("text-[9px]", wTotal >= 0 ? "text-muted-foreground" : "text-red-300")}>
                              {formatCurrency(wTotal)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

// === TOTAL VIEW COMPONENT ===
function TotalView({ currentMonth, monthTransactions, monthIncome, monthExpense, safeAccounts, filteredTransactions, onNavigateToTab }: {
  currentMonth: { month: number; year: number }
  monthTransactions: Transaction[]
  monthIncome: number
  monthExpense: number
  safeAccounts: { id: string; name: string; type?: string }[]
  filteredTransactions: Transaction[]
  onNavigateToTab?: (tab: string) => void
}) {
  const year = currentMonth.year
  const month = currentMonth.month
  const lastDay = new Date(year, month + 1, 0).getDate()

  // Get previous month expenses for comparison
  const prevMonth = month === 0 ? 11 : month - 1
  const prevYear = month === 0 ? year - 1 : year
  const prevMonthExpense = filteredTransactions
    .filter(tx => {
      const d = new Date(tx.date + 'T00:00:00')
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear && tx.type === 'expense'
    })
    .reduce((s, t) => s + t.amount, 0)

  const comparedPercent = prevMonthExpense > 0
    ? Math.round((monthExpense / prevMonthExpense) * 100)
    : 0

  // Expenses by account type - use actual account data
  const cashAccountIds = safeAccounts
    .filter(a => a.type === 'cash' || a.type === 'bank' || !a.type)
    .map(a => a.id)
  const cardAccountIds = safeAccounts
    .filter(a => a.type === 'card')
    .map(a => a.id)

  const cashExpense = monthTransactions
    .filter(tx => tx.type === 'expense' && cashAccountIds.includes(tx.accountId))
    .reduce((s, t) => s + t.amount, 0)

  const cardExpense = monthTransactions
    .filter(tx => tx.type === 'expense' && cardAccountIds.includes(tx.accountId))
    .reduce((s, t) => s + t.amount, 0)

  // Export to CSV/Excel
  const handleExport = () => {
    if (monthTransactions.length === 0) {
      alert('No transactions to export for this month.')
      return
    }

    const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Account']
    const rows = monthTransactions.map(tx => {
      const acc = safeAccounts.find(a => a.id === tx.accountId)
      // Escape commas in description
      const desc = tx.description.includes(',') ? `"${tx.description}"` : tx.description
      return [tx.date, tx.type, tx.category, desc, tx.amount.toFixed(2), acc?.name || 'Unknown']
    })

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const BOM = '\uFEFF' // UTF-8 BOM for Excel compatibility
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `PennyFlow_${year}_${String(month + 1).padStart(2, '0')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col px-4 py-4 space-y-4">
      {/* Budget section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">💰</span>
          <span className="text-base font-bold text-foreground">Budget</span>
        </div>
        <button
          onClick={() => onNavigateToTab?.('budgets')}
          className="text-[11px] text-muted-foreground border border-border/50 rounded-lg px-3 py-1.5 hover:text-foreground hover:border-primary/50 transition-colors"
        >
          Budget Setting &gt;
        </button>
      </div>

      {/* Accounts section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">💳</span>
            <span className="text-base font-bold text-foreground">Accounts</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            01.{String(month + 1).padStart(2, '0')}.{year} ~ {String(lastDay).padStart(2, '0')}.{String(month + 1).padStart(2, '0')}
          </span>
        </div>

        <div className="rounded-2xl border border-border/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Compared Expenses (Last month)</span>
            <span className="text-xs font-bold text-foreground">{comparedPercent}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Expenses (Cash, Accounts)</span>
            <span className="text-xs font-bold text-foreground">{formatCurrency(cashExpense)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Expenses (Card)</span>
            <span className="text-xs font-bold text-foreground">{formatCurrency(cardExpense)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Transfer (Cash, Accounts→)</span>
            <span className="text-xs font-bold text-foreground">{formatCurrency(0)}</span>
          </div>
        </div>
      </div>

      {/* Export button */}
      <button
        onClick={handleExport}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-border/50 text-sm font-medium text-foreground hover:bg-secondary/40 hover:border-primary/30 active:scale-[0.98] transition-all"
      >
        <span className="text-lg">📊</span> Export data to Excel
      </button>
    </div>
  )
}

// === NOTE VIEW COMPONENT ===
function NoteView() {
  const [notes, setNotes] = useState<string[]>([])
  const [newNote, setNewNote] = useState('')

  // Load notes from localStorage
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('pennyflow-notes')
      if (stored) setNotes(JSON.parse(stored))
    } catch {}
  }, [])

  const saveNote = () => {
    if (!newNote.trim()) return
    const updated = [newNote.trim(), ...notes]
    setNotes(updated)
    localStorage.setItem('pennyflow-notes', JSON.stringify(updated))
    setNewNote('')
  }

  const deleteNote = (index: number) => {
    const updated = notes.filter((_, i) => i !== index)
    setNotes(updated)
    localStorage.setItem('pennyflow-notes', JSON.stringify(updated))
  }

  if (notes.length === 0 && !newNote) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-5">
        <div className="text-5xl mb-3 opacity-30">🐱💬</div>
        <p className="text-sm text-muted-foreground/60">No data available.</p>
        <button
          onClick={() => setNewNote(' ')}
          className="mt-6 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/60 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="text-base">📝</span> Add a note
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col px-4 py-4 space-y-3">
      {/* Add note input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newNote === ' ' ? '' : newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onFocus={() => { if (newNote === ' ') setNewNote('') }}
          placeholder="Write a financial note..."
          className="flex-1 h-9 px-3 rounded-lg bg-secondary border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => { if (e.key === 'Enter') saveNote() }}
        />
        <button
          onClick={saveNote}
          className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
        >
          Save
        </button>
      </div>

      {/* Notes list */}
      {notes.map((note, i) => (
        <div key={i} className="flex items-start justify-between p-3 rounded-xl bg-secondary/40 border border-border/30">
          <p className="text-xs text-foreground flex-1">{note}</p>
          <button
            onClick={() => deleteNote(i)}
            className="ml-2 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
