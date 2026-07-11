'use client'

import React, { useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Transaction, SystemLog, generateUUID, syncAccountToAsset } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Trash2, Search, ArrowUpRight, ArrowDownRight, Tag, Calendar, Layers, ShieldCheck, Sparkles, Wallet, Copy, Edit2, X, Check, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from 'framer-motion'
import { useUndo } from '@/components/ui/undo-toast'
import { getCategoryConfig } from '@/lib/category-icons'

export function TransactionsLedger() {
  const [subTab, setSubTab] = useState<'ledger' | 'timeline'>('ledger')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<{ amount: string; description: string; category: string }>({ amount: '', description: '', category: '' })
  const [receiptLightbox, setReceiptLightbox] = useState<string | null>(null)

  const { showUndo } = useUndo()

  // Dexie Queries with null safety
  const rawTransactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const systemLogs = useLiveQuery(() => db.systemLogs.orderBy('timestamp').reverse().toArray()) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []

  // Ensure arrays are never undefined
  const safeTransactions = Array.isArray(rawTransactions) ? rawTransactions : []
  const safeLogs = Array.isArray(systemLogs) ? systemLogs : []
  const safeAccounts = Array.isArray(accounts) ? accounts : []

  // Filter & Search Transactions
  const filteredTransactions = safeTransactions
    .filter((tx) => {
      const matchSearch = tx.description.toLowerCase().includes(search.toLowerCase()) || 
                          tx.category.toLowerCase().includes(search.toLowerCase())
      const matchType = typeFilter === 'all' || tx.type === typeFilter
      const matchCategory = !categoryFilter || tx.category === categoryFilter
      return matchSearch && matchType && matchCategory
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Categories list
  const categories = Array.from(new Set(safeTransactions.map((tx) => tx.category)))

  // Handle Delete Transaction with Undo (Phase 0.4 + 0.6)
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

      // Undo: re-add the transaction
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

  // Handle Duplicate Transaction (Phase 0.4: swipe right)
  const handleDuplicateTransaction = async (tx: Transaction) => {
    const todayStr = new Date().toISOString().split('T')[0]
    const newId = generateUUID()

    try {
      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        await db.transactions.add({
          ...tx,
          id: newId,
          date: todayStr,
        })

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

  // Handle Edit Save (Phase 0.4: inline edit)
  const handleEditSave = async (tx: Transaction) => {
    const newAmount = parseFloat(editData.amount)
    if (isNaN(newAmount) || newAmount <= 0) return

    const amountDiff = newAmount - tx.amount
    const balanceDelta = tx.type === 'expense' ? -amountDiff : amountDiff

    try {
      await db.transaction('rw', [db.transactions, db.accounts, db.assets], async () => {
        await db.transactions.update(tx.id, {
          amount: newAmount,
          description: editData.description || tx.description,
          category: editData.category || tx.category,
        })

        if (amountDiff !== 0) {
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

  // Group transactions by date
  const groupedTransactions: { [key: string]: Transaction[] } = {}
  filteredTransactions.forEach((tx) => {
    if (!groupedTransactions[tx.date]) {
      groupedTransactions[tx.date] = []
    }
    groupedTransactions[tx.date].push(tx)
  })

  // Date formatter helper
  const formatDateHeader = (dateStr: string) => {
    const dateObj = new Date(dateStr + 'T00:00:00') // prevent timezone shift
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    if (dateObj.toDateString() === today.toDateString()) return 'Today'
    if (dateObj.toDateString() === yesterday.toDateString()) return 'Yesterday'

    return dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  // System Log Icon
  const getLogIcon = (type: string) => {
    switch (type) {
      case 'transaction': return <Wallet className="h-4 w-4 text-primary" />
      case 'lending': return <Layers className="h-4 w-4 text-yellow-500" />
      case 'asset': return <ShieldCheck className="h-4 w-4 text-emerald-500" />
      case 'goal': return <Sparkles className="h-4 w-4 text-indigo-400" />
      default: return <Calendar className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <div className="flex flex-col space-y-5 pb-28">
      {/* Module Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Ledger Operations</h1>
        <p className="text-xs text-muted-foreground">Monitor transaction records and audit logs.</p>
      </div>

      {/* Switch Sub-tabs */}
      <div className="flex p-1 bg-secondary rounded-2xl w-full max-w-xs mx-auto">
        <button
          onClick={() => setSubTab('ledger')}
          className={cn(
            "flex-1 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-center transition-all",
            subTab === 'ledger'
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Transactions
        </button>
        <button
          onClick={() => setSubTab('timeline')}
          className={cn(
            "flex-1 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-center transition-all",
            subTab === 'timeline'
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Timeline Logs
        </button>
      </div>

      {subTab === 'ledger' ? (
        <div className="space-y-4">
          {/* Filters Card */}
          <Card>
            <div className="flex flex-col space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <input
                  type="text"
                  placeholder="Search descriptions, memos..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex h-11 w-full rounded-2xl border border-border bg-secondary pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Select
                  value={typeFilter}
                  onChange={(e: any) => setTypeFilter(e.target.value)}
                >
                  <option value="all">All Types</option>
                  <option value="income">Income Only</option>
                  <option value="expense">Expenses Only</option>
                </Select>

                <Select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>

          {/* Transactions List */}
          <div className="space-y-5">
            {Object.keys(groupedTransactions).length > 0 ? (
              Object.keys(groupedTransactions).map((date) => (
                <div key={date} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {formatDateHeader(date)}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] font-bold">
                      {(() => {
                        const dayTx = groupedTransactions[date]
                        const dayIncome = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
                        const dayExpense = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
                        return (
                          <>
                            {dayIncome > 0 && <span className="text-emerald-500">+{formatCurrency(dayIncome)}</span>}
                            {dayExpense > 0 && <span className="text-red-400">-{formatCurrency(dayExpense)}</span>}
                          </>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {groupedTransactions[date].map((tx) => {
                      const account = safeAccounts.find((a) => a.id === tx.accountId)
                      const isEditing = editingId === tx.id

                      return (
                        <div key={tx.id} className="relative overflow-hidden rounded-2xl">
                          {/* Swipe background indicators */}
                          <div className="absolute inset-0 flex items-center justify-between px-4 rounded-2xl">
                            <div className="flex items-center gap-1 text-emerald-500">
                              <Copy className="w-4 h-4" />
                              <span className="text-[10px] font-bold">Duplicate</span>
                            </div>
                            <div className="flex items-center gap-1 text-red-500">
                              <Trash2 className="w-4 h-4" />
                              <span className="text-[10px] font-bold">Delete</span>
                            </div>
                          </div>

                          {/* Swipeable card */}
                          <motion.div
                            drag="x"
                            dragConstraints={{ left: -100, right: 100 }}
                            dragElastic={0.1}
                            onDragEnd={(_, info: PanInfo) => {
                              if (info.offset.x < -80) {
                                handleDeleteTransaction(tx)
                              } else if (info.offset.x > 80) {
                                handleDuplicateTransaction(tx)
                              }
                            }}
                            className="relative bg-card border border-border/50 shadow-sm rounded-2xl cursor-grab active:cursor-grabbing"
                          >
                            {/* Main row - tap to expand edit */}
                            <div
                              onClick={() => {
                                if (isEditing) return
                                setEditingId(tx.id)
                                setEditData({
                                  amount: tx.amount.toString(),
                                  description: tx.description,
                                  category: tx.category,
                                })
                              }}
                              className="flex items-center justify-between p-3 group hover:border-primary/20 transition-all"
                            >
                              <div className="flex items-center space-x-3">
                                <div className={cn(
                                  "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg",
                                  getCategoryConfig(tx.category).bg
                                )}>
                                  {getCategoryConfig(tx.category).emoji}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs font-bold text-foreground line-clamp-1">{tx.description}</p>
                                    {tx.receiptImage && (
                                      <span className="inline-flex items-center px-1 py-0.5 rounded bg-amber-500/10 text-amber-500">
                                        <Camera className="w-2.5 h-2.5" />
                                      </span>
                                    )}
                                    {tx.isAutoGenerated && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[8px] font-bold">AUTO</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground">
                                    {tx.category} • {account ? account.name : 'Unknown'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center space-x-2">
                                <span className={cn(
                                  "text-xs font-bold",
                                  tx.type === 'income' ? 'text-emerald-500' : 'text-foreground'
                                )}>
                                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                                </span>
                                <Edit2 className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>

                            {/* Inline Edit Panel (Phase 0.4) */}
                            <AnimatePresence>
                              {isEditing && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden border-t border-border/30"
                                >
                                  <div className="p-3 space-y-2">
                                    <div className="flex gap-2">
                                      <input
                                        type="number"
                                        value={editData.amount}
                                        onChange={(e) => setEditData({ ...editData, amount: e.target.value })}
                                        className="w-24 h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                                        placeholder="Amount"
                                      />
                                      <input
                                        type="text"
                                        value={editData.description}
                                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                                        className="flex-1 h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                                        placeholder="Description"
                                      />
                                    </div>
                                    {/* Receipt thumbnail in edit mode */}
                                    {tx.receiptImage && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setReceiptLightbox(tx.receiptImage!) }}
                                        className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 transition-colors"
                                      >
                                        <img src={tx.receiptImage} alt="Receipt" className="w-8 h-8 rounded object-cover" />
                                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">View Receipt</span>
                                      </button>
                                    )}
                                    <div className="flex items-center justify-between">
                                      <input
                                        type="text"
                                        value={editData.category}
                                        onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                                        className="w-32 h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                                        placeholder="Category"
                                      />
                                      <div className="flex gap-1.5">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleEditSave(tx) }}
                                          className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold hover:opacity-90"
                                        >
                                          <Check className="w-3 h-3 inline mr-1" />Save
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setEditingId(null) }}
                                          className="h-8 px-2 rounded-lg bg-secondary text-muted-foreground text-[10px] font-bold hover:text-foreground"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
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
                </div>
              ))
            ) : (
              <div className="text-center py-10 bg-secondary/20 rounded-3xl border border-dashed border-border/50">
                <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs font-bold text-muted-foreground">No matching records found</p>
                <p className="text-[10px] text-muted-foreground/75 mt-1">Try relaxing filters or adjusting query.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Unified Timeline */
        <div className="relative pl-6 border-l border-border/80 space-y-6">
          {safeLogs.length > 0 ? (
            safeLogs.map((log) => {
              const logDate = new Date(log.timestamp)
              return (
                <div key={log.id} className="relative group">
                  {/* Timeline bullet */}
                  <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-background border-2 border-border flex items-center justify-center group-hover:border-primary transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/70 group-hover:bg-primary transition-colors" />
                  </div>

                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      {getLogIcon(log.type)}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground leading-snug">
                        {log.description}
                      </p>
                      <p className="text-[9px] text-muted-foreground/80 mt-0.5">
                        {logDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} •{' '}
                        {logDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {log.amount !== undefined && (
                      <span className={cn(
                        "ml-auto text-xs font-bold self-center pr-1",
                        log.amount >= 0 ? "text-emerald-500" : "text-foreground"
                      )}>
                        {log.amount >= 0 ? '+' : ''}{formatCurrency(log.amount)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-10 bg-secondary/20 rounded-3xl border border-dashed border-border/50 -ml-6">
              <Calendar className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs font-bold text-muted-foreground">Timeline is quiet</p>
              <p className="text-[10px] text-muted-foreground/75 mt-1">Actions you take will be logged here chronologically.</p>
            </div>
          )}
        </div>
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
