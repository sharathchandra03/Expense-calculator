'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Transaction, SystemLog } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Trash2, Search, ArrowUpRight, ArrowDownRight, Tag, Calendar, Layers, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

export function TransactionsLedger() {
  const [subTab, setSubTab] = useState<'ledger' | 'timeline'>('ledger')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [categoryFilter, setCategoryFilter] = useState('')

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

  // Handle Delete Transaction (and rollback account balance)
  const handleDeleteTransaction = async (id: string, amount: number, type: 'income' | 'expense', accountId: string) => {
    try {
      const multiplier = type === 'expense' ? 1 : -1 // Rollback means we add back expense, subtract back income
      const delta = amount * multiplier

      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        await db.transactions.delete(id)
        
        const account = await db.accounts.get(accountId)
        if (account) {
          const newBalance = account.balance + delta
          await db.accounts.update(accountId, {
            balance: newBalance
          })
          
          // CRITICAL: Sync account balance to matching asset
          const matchingAsset = await db.assets.where('name').equalsIgnoreCase(account.name).first()
          if (matchingAsset) {
            const todayStr = new Date().toISOString().split('T')[0]
            const updatedHistory = [...matchingAsset.valuationHistory]
            const existingIndex = updatedHistory.findIndex(v => v.date === todayStr)
            
            if (existingIndex >= 0) {
              updatedHistory[existingIndex].value = newBalance
            } else {
              updatedHistory.push({ date: todayStr, value: newBalance })
            }
            
            await db.assets.update(matchingAsset.id, {
              balance: newBalance,
              valuationHistory: updatedHistory
            })
          }
        }

        await db.systemLogs.add({
          id: Math.random().toString(36).substring(2),
          timestamp: new Date().toISOString(),
          type: 'system',
          description: `Deleted ${type} record of ${formatCurrency(amount)}. Balance restored.`,
          amount: delta
        })
      })
    } catch (err) {
      console.error('Failed to delete transaction:', err)
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
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                    {formatDateHeader(date)}
                  </h3>

                  <div className="space-y-2.5">
                    {groupedTransactions[date].map((tx) => {
                      const account = safeAccounts.find((a) => a.id === tx.accountId)
                      return (
                        <motion.div
                          key={tx.id}
                          layout
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border/50 shadow-sm group hover:border-primary/20 transition-all"
                        >
                          <div className="flex items-center space-x-3">
                            <div className={cn(
                              "w-9 h-9 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0",
                              tx.type === 'income' ? 'text-emerald-500' : 'text-foreground'
                            )}>
                              {tx.type === 'income' ? <ArrowUpRight className="h-4.5 w-4.5" /> : <ArrowDownRight className="h-4.5 w-4.5" />}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-foreground line-clamp-1">{tx.description}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {tx.category} • {account ? account.name : 'Unknown Account'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <span className={cn(
                              "text-xs font-bold mr-1",
                              tx.type === 'income' ? 'text-emerald-500' : 'text-foreground'
                            )}>
                              {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                            </span>
                            <button
                              onClick={() => handleDeleteTransaction(tx.id, tx.amount, tx.type, tx.accountId)}
                              className="p-2 rounded-xl text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Delete Record"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </motion.div>
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
    </div>
  )
}
