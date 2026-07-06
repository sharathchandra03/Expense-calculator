'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Search, X, Zap, TrendingUp, TrendingDown, Heart, Home, Target,
  Clock, AlertCircle, Sparkles, ArrowRight
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'

interface SearchResult {
  id: string
  type: 'transaction' | 'lending' | 'asset' | 'bill' | 'goal'
  title: string
  description: string
  amount?: number
  category?: string
  date?: string
  priority?: 'high' | 'normal' | 'low'
}

export function GlobalSearch({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')

  // Fetch all data
  const transactions = useLiveQuery(() => db.transactions.toArray()) || []
  const lending = useLiveQuery(() => db.lending.toArray()) || []
  const assets = useLiveQuery(() => db.assets.toArray()) || []
  const bills = useLiveQuery(() => db.bills.toArray()) || []
  const goals = useLiveQuery(() => db.goals.toArray()) || []

  // Build search results
  const results = useMemo(() => {
    if (query.length === 0) {
      return [] // Show quick suggestions instead
    }

    const q = query.toLowerCase()
    const allResults: SearchResult[] = []

    // Search transactions
    transactions.forEach((tx) => {
      if (
        tx.description.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q)
      ) {
        allResults.push({
          id: tx.id,
          type: 'transaction',
          title: tx.description,
          description: `${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.amount)} • ${tx.category}`,
          amount: tx.amount,
          category: tx.category,
          date: tx.date,
          priority: tx.type === 'expense' && tx.amount > 100 ? 'high' : 'normal',
        })
      }
    })

    // Search lending
    lending.forEach((l) => {
      if (
        l.contactName.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q)
      ) {
        allResults.push({
          id: l.id,
          type: 'lending',
          title: l.contactName,
          description: `${l.type === 'lent' ? 'Lent' : 'Borrowed'} ${formatCurrency(l.amount)}`,
          amount: l.amount,
          date: l.expectedRepaymentDate || undefined,
          priority: l.status === 'active' && l.expectedRepaymentDate && new Date(l.expectedRepaymentDate) < new Date() ? 'high' : 'normal',
        })
      }
    })

    // Search assets
    assets.forEach((a) => {
      if (a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q)) {
        allResults.push({
          id: a.id,
          type: 'asset',
          title: a.name,
          description: `${a.type} • ${formatCurrency(a.balance)}`,
          amount: a.balance,
          category: a.type,
        })
      }
    })

    // Search bills
    bills.forEach((b) => {
      if (
        b.title.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q)
      ) {
        allResults.push({
          id: b.id,
          type: 'bill',
          title: b.title,
          description: `${formatCurrency(b.amount)} • Due ${b.dueDate}`,
          amount: b.amount,
          category: b.category,
          date: b.dueDate,
          priority: !b.isPaid && new Date(b.dueDate) < new Date() ? 'high' : 'normal',
        })
      }
    })

    // Search goals
    goals.forEach((g) => {
      if (
        g.title.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q)
      ) {
        allResults.push({
          id: g.id,
          type: 'goal',
          title: g.title,
          description: `${formatCurrency(g.currentAmount)} / ${formatCurrency(g.targetAmount)}`,
          amount: g.targetAmount,
          category: g.category,
        })
      }
    })

    return allResults.sort((a, b) => {
      // Prioritize by type match
      const aMatch = a.title.toLowerCase().includes(q) ? 1 : 0
      const bMatch = b.title.toLowerCase().includes(q) ? 1 : 0
      return bMatch - aMatch
    })
  }, [query, transactions, lending, assets, bills, goals])

  // Quick suggestions (when empty)
  const suggestions = useMemo(() => {
    if (query.length > 0) return []

    const suggests: SearchResult[] = []

    // Highest expense this month
    const thisMonth = new Date()
    const highestExpense = transactions
      .filter(
        (tx) =>
          tx.type === 'expense' &&
          new Date(tx.date).getMonth() === thisMonth.getMonth()
      )
      .sort((a, b) => b.amount - a.amount)[0]

    if (highestExpense) {
      suggests.push({
        id: highestExpense.id,
        type: 'transaction',
        title: `Highest expense: ${highestExpense.description}`,
        description: formatCurrency(highestExpense.amount),
        amount: highestExpense.amount,
        priority: 'high',
      })
    }

    // Overdue bills
    const overdueBill = bills.find((b) => !b.isPaid && new Date(b.dueDate) < new Date())
    if (overdueBill) {
      suggests.push({
        id: overdueBill.id,
        type: 'bill',
        title: `Overdue: ${overdueBill.title}`,
        description: `Due ${new Date(overdueBill.dueDate).toLocaleDateString()}`,
        amount: overdueBill.amount,
        priority: 'high',
      })
    }

    // Incomplete goal closest to target
    const closestGoal = goals
      .filter((g) => g.currentAmount < g.targetAmount)
      .sort((a, b) => {
        const aPercent = (a.currentAmount / a.targetAmount) * 100
        const bPercent = (b.currentAmount / b.targetAmount) * 100
        return bPercent - aPercent
      })[0]

    if (closestGoal) {
      const percent = Math.round((closestGoal.currentAmount / closestGoal.targetAmount) * 100)
      suggests.push({
        id: closestGoal.id,
        type: 'goal',
        title: `Goal progress: ${closestGoal.title}`,
        description: `${percent}% complete`,
        amount: closestGoal.targetAmount,
      })
    }

    return suggests
  }, [query, transactions, bills, goals])

  const displayResults = query.length > 0 ? results : suggestions

  const handleClose = () => {
    setQuery('')
    onClose()
  }

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 bg-transparent border-0 shadow-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          className="w-full bg-background border border-border/50 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border/30">
            <Search className="w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search transactions, lending, goals, assets..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-lg font-medium outline-none text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
            <button
              onClick={handleClose}
              className="p-1 hover:bg-secondary rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            <AnimatePresence mode="wait">
              {displayResults.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="divide-y divide-border/30"
                >
                  {displayResults.map((result, i) => (
                    <motion.button
                      key={result.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={handleClose}
                      className="w-full px-5 py-3 hover:bg-secondary/50 transition-colors text-left flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {/* Result Icon */}
                        <div className="flex-shrink-0">
                          {result.type === 'transaction' && (
                            <div className={cn(
                              'w-10 h-10 rounded-lg flex items-center justify-center',
                              result.priority === 'high' ? 'bg-red-500/20' : 'bg-blue-500/20'
                            )}>
                              {result.category === 'Income' ? (
                                <TrendingUp className="w-5 h-5 text-emerald-500" />
                              ) : (
                                <TrendingDown className="w-5 h-5 text-red-500" />
                              )}
                            </div>
                          )}
                          {result.type === 'lending' && (
                            <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
                              <Heart className="w-5 h-5 text-pink-500" />
                            </div>
                          )}
                          {result.type === 'asset' && (
                            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                              <Home className="w-5 h-5 text-amber-500" />
                            </div>
                          )}
                          {result.type === 'bill' && (
                            <div className={cn(
                              'w-10 h-10 rounded-lg flex items-center justify-center',
                              result.priority === 'high' ? 'bg-red-500/20' : 'bg-amber-500/20'
                            )}>
                              <Zap className={cn(
                                'w-5 h-5',
                                result.priority === 'high' ? 'text-red-500' : 'text-amber-500'
                              )} />
                            </div>
                          )}
                          {result.type === 'goal' && (
                            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                              <Target className="w-5 h-5 text-indigo-500" />
                            </div>
                          )}
                        </div>

                        {/* Result Info */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground line-clamp-1">
                            {result.title}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {result.description}
                          </p>
                        </div>
                      </div>

                      {/* Result Amount */}
                      {result.amount && (
                        <div className="ml-3 text-right flex-shrink-0">
                          <p className="text-xs font-bold text-foreground">
                            {formatCurrency(result.amount)}
                          </p>
                        </div>
                      )}

                      {/* Chevron */}
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-2" />
                    </motion.button>
                  ))}
                </motion.div>
              ) : query.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-5 py-12 text-center"
                >
                  <Search className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-muted-foreground">No results found</p>
                  <p className="text-xs text-muted-foreground/75 mt-1">Try different keywords</p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-5 space-y-3"
                >
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Quick insights</p>
                  <div className="space-y-2">
                    {suggestions.map((result, i) => (
                      <motion.button
                        key={result.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={handleClose}
                        className="w-full p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left flex items-center gap-3 group"
                      >
                        <Sparkles className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground line-clamp-1">
                            {result.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {result.description}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer Hints */}
          <div className="px-5 py-3 border-t border-border/30 bg-secondary/30 flex items-center justify-between text-xs text-muted-foreground/75">
            <div className="flex items-center gap-4">
              <span>Press <kbd className="px-2 py-1 rounded bg-secondary text-foreground text-[10px] font-semibold">ESC</kbd> to close</span>
            </div>
            <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
