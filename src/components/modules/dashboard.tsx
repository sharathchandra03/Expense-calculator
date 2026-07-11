'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Transaction, Lending, Asset, Goal, Bill, generateUUID, syncAccountToAsset } from '@/db/schema'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { formatCurrency, cn } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, Sparkles, Target, Calendar, ArrowRight, ShieldCheck, AlertCircle, ShoppingBag, Plus, Zap, TrendingUp, DollarSign, Heart, Clock, GripVertical, UtensilsCrossed, Car, ShoppingCart, Receipt, MoreHorizontal, X, Check } from 'lucide-react'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import { HealthScoreService, HealthScoreBreakdown } from '@/services/HealthScoreService'
import { SyncCard } from '@/components/ui/sync-card'
import { SmartQuickAdd } from '@/components/modules/smart-quick-add'
import { useUndo } from '@/components/ui/undo-toast'
import { SmartDefaultsService } from '@/services/SmartDefaultsService'
import { SmartInsightsService, Insight } from '@/services/SmartInsightsService'
import { getCategoryConfig } from '@/lib/category-icons'

interface DashboardProps {
  onNavigateToTab: (tab: any) => void;
}

type DashCardId = 'networth' | 'health' | 'cash' | 'month' | 'bills' | 'goals' | 'lending' | 'recent'

const DEFAULT_DASH_ORDER: DashCardId[] = ['networth', 'health', 'cash', 'month', 'bills', 'goals', 'lending', 'recent']

function getDashStoredOrder(): DashCardId[] {
  if (typeof window === 'undefined') return DEFAULT_DASH_ORDER
  try {
    const stored = localStorage.getItem('pennyflow-dash-order')
    if (stored) return JSON.parse(stored)
  } catch {}
  return DEFAULT_DASH_ORDER
}

export function Dashboard({ onNavigateToTab }: DashboardProps) {
  // Read database live with null safety - use ?? for proper falsy handling
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().limit(4).toArray()) ?? []
  const allTransactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const assets = useLiveQuery(() => db.assets.toArray()) ?? []
  const lending = useLiveQuery(() => db.lending.toArray()) ?? []
  const goals = useLiveQuery(() => db.goals.toArray()) ?? []
  const bills = useLiveQuery(() => db.bills.toArray()) ?? []
  const investments = useLiveQuery(() => db.investments.toArray()) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const budgets = useLiveQuery(() => db.budgets.toArray()) ?? []

  // Quick-add state
  const [quickAddCategory, setQuickAddCategory] = useState<string | null>(null)
  const [quickAddAmount, setQuickAddAmount] = useState('')
  const [quickAddSaving, setQuickAddSaving] = useState(false)
  const [quickAddSuccess, setQuickAddSuccess] = useState(false)
  const quickAddInputRef = useRef<HTMLInputElement>(null)

  // Ensure arrays are never undefined
  const safeTransactions = Array.isArray(transactions) ? transactions : []
  const safeAllTransactions = Array.isArray(allTransactions) ? allTransactions : []
  const safeAssets = Array.isArray(assets) ? assets : []
  const safeLending = Array.isArray(lending) ? lending : []
  const safeGoals = Array.isArray(goals) ? goals : []
  const safeBills = Array.isArray(bills) ? bills : []
  const safeInvestments = Array.isArray(investments) ? investments : []
  const safeAccounts = Array.isArray(accounts) ? accounts : []
  const safeBudgets = Array.isArray(budgets) ? budgets : []

  // === PHASE 0.1: Transaction-First Home Screen Data ===

  // Today's date string for filtering
  const todayStr = new Date().toISOString().split('T')[0]

  // Today's transactions
  const todayTransactions = React.useMemo(() => {
    return safeAllTransactions
      .filter(tx => tx.date === todayStr)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [safeAllTransactions, todayStr])

  // Monthly budget: total limit across all active budgets vs total spent this month
  const monthlyBudgetData = React.useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // Sum all active monthly budget limits
    const activeBudgets = safeBudgets.filter(b => b.isActive && b.period === 'monthly')
    const totalBudgetLimit = activeBudgets.reduce((sum, b) => sum + b.limit, 0)

    // Total expenses this month
    const monthlySpent = safeAllTransactions
      .filter(tx => {
        const txDate = new Date(tx.date)
        return tx.type === 'expense' && txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear
      })
      .reduce((sum, tx) => sum + tx.amount, 0)

    const remaining = totalBudgetLimit - monthlySpent
    const percentUsed = totalBudgetLimit > 0 ? Math.min(100, (monthlySpent / totalBudgetLimit) * 100) : 0

    return { totalBudgetLimit, monthlySpent, remaining, percentUsed, hasBudget: totalBudgetLimit > 0 }
  }, [safeBudgets, safeAllTransactions])

  // Today's total spending
  const todaySpent = React.useMemo(() => {
    return todayTransactions
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0)
  }, [todayTransactions])

  // Phase 2.7: Smart Insights
  const smartInsights = React.useMemo(() => {
    return SmartInsightsService.generateInsights(safeAllTransactions, safeBudgets)
  }, [safeAllTransactions, safeBudgets])

  // Quick-add category definitions
  const QUICK_ADD_CATEGORIES = [
    { id: 'Food', label: 'Food', icon: UtensilsCrossed, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { id: 'Transport', label: 'Transport', icon: Car, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { id: 'Shopping', label: 'Shopping', icon: ShoppingCart, color: 'text-pink-400', bg: 'bg-pink-500/10' },
    { id: 'Utilities', label: 'Bills', icon: Receipt, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ]

  // Quick-add handler: save expense instantly
  const { showUndo } = useUndo()

  const handleQuickAddSave = useCallback(async () => {
    if (!quickAddCategory || !quickAddAmount || isNaN(Number(quickAddAmount)) || Number(quickAddAmount) <= 0) return

    setQuickAddSaving(true)
    const amount = parseFloat(quickAddAmount)

    try {
      // Smart default: use last-used account or first bank/cash
      const lastAccountId = SmartDefaultsService.getLastUsedAccount()
      const defaultAccount = (lastAccountId && safeAccounts.find(a => a.id === lastAccountId)) 
        || safeAccounts.find(a => a.type === 'bank') 
        || safeAccounts.find(a => a.type === 'cash') 
        || safeAccounts[0]

      const txId = generateUUID()

      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        await db.transactions.add({
          id: txId,
          date: todayStr,
          type: 'expense',
          category: quickAddCategory,
          amount,
          accountId: defaultAccount?.id || '',
          description: quickAddCategory,
          isRecurring: false,
        })

        // Deduct from account
        if (defaultAccount) {
          const newBalance = defaultAccount.balance - amount
          await db.accounts.update(defaultAccount.id, { balance: newBalance })
          await syncAccountToAsset(defaultAccount.name, newBalance)
          SmartDefaultsService.setLastUsedAccount(defaultAccount.id)
        }

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'transaction',
          description: `Quick-logged ${quickAddCategory}: ${formatCurrency(amount)}`,
          amount: -amount,
        })
      })

      setQuickAddSuccess(true)

      // Phase 0.6: Show undo toast
      showUndo(`${quickAddCategory} ${formatCurrency(amount)} logged`, async () => {
        await db.transaction('rw', [db.transactions, db.accounts, db.assets], async () => {
          await db.transactions.delete(txId)
          if (defaultAccount) {
            const acc = await db.accounts.get(defaultAccount.id)
            if (acc) {
              const revert = acc.balance + amount
              await db.accounts.update(defaultAccount.id, { balance: revert })
              await syncAccountToAsset(defaultAccount.name, revert)
            }
          }
        })
      })

      setTimeout(() => {
        setQuickAddCategory(null)
        setQuickAddAmount('')
        setQuickAddSuccess(false)
        setQuickAddSaving(false)
      }, 1200)
    } catch (err) {
      console.error('Quick-add failed:', err)
      setQuickAddSaving(false)
    }
  }, [quickAddCategory, quickAddAmount, safeAccounts, todayStr])

  // Focus input when quick-add category opens
  useEffect(() => {
    if (quickAddCategory && quickAddInputRef.current) {
      setTimeout(() => quickAddInputRef.current?.focus(), 100)
    }
  }, [quickAddCategory])

  // Total live value of tracked investments (stocks/crypto/funds)
  const investmentsValue = React.useMemo(
    () => safeInvestments.reduce((sum, inv) => sum + (inv.currentValue || 0), 0),
    [safeInvestments]
  )

  // Calculate health score
  const healthScore = React.useMemo(() => {
    return HealthScoreService.calculateHealthScore(safeAllTransactions, safeLending, safeAssets, safeBills)
  }, [safeAllTransactions, safeLending, safeAssets, safeBills])

  // Calculate metrics
  const metrics = React.useMemo(() => {
    return HealthScoreService.calculateMetrics(safeAllTransactions, safeLending, safeAssets, safeBills)
  }, [safeAllTransactions, safeLending, safeAssets, safeBills])

  // Net Worth: use accounts as primary source (always updated by transactions)
  // Fall back to assets if accounts empty, plus investments + lending
  const accountsTotal = safeAccounts.reduce((sum, a) => sum + (a.balance || 0), 0)
  const assetsTotal = safeAssets.reduce((sum, a) => sum + a.balance, 0)
  const lentOut = safeLending.filter(l => l.type === 'lent' && l.status === 'active').reduce((s, l) => s + l.amount, 0)
  const borrowed = safeLending.filter(l => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + l.amount, 0)
  const netWorth = Math.max(accountsTotal, assetsTotal) + investmentsValue + lentOut - borrowed

  // Spending trend
  const spendingTrend = React.useMemo(() => {
    return HealthScoreService.getMonthlySpendingTrend(safeAllTransactions)
  }, [safeAllTransactions])

  // Cash analysis - use accounts for liquid assets
  const liquidAssets = safeAccounts
    .filter(a => a.type === 'cash' || a.type === 'bank')
    .reduce((sum, a) => sum + (a.balance || 0), 0)
  const { monthlyRecurring, monthlyExpenses } = metrics
  // Invested assets include investment accounts + tracked investments portfolio
  const investedAssets = safeAccounts
    .filter(a => a.type === 'investment' || a.type === 'crypto')
    .reduce((sum, a) => sum + (a.balance || 0), 0) + investmentsValue
  const availableCash = HealthScoreService.getAvailableCash(liquidAssets, monthlyRecurring)
  const isLowCash = HealthScoreService.isLowCash(liquidAssets, monthlyExpenses)
  const cashStatus = liquidAssets > monthlyRecurring ? 'healthy' : liquidAssets > monthlyRecurring * 0.5 ? 'warning' : 'critical'

  // Card order for reordering
  const [dashOrder, setDashOrder] = React.useState<DashCardId[]>(getDashStoredOrder)
  const [hiddenCards, setHiddenCards] = React.useState<DashCardId[]>(() => {
    if (typeof window === 'undefined') return []
    try { const s = localStorage.getItem('pennyflow-dash-hidden'); return s ? JSON.parse(s) : [] } catch { return [] }
  })
  const [compactMode, setCompactMode] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pennyflow-dash-compact') === 'true'
  })
  const [showDashSettings, setShowDashSettings] = React.useState(false)

  const handleDashReorder = (newOrder: DashCardId[]) => {
    setDashOrder(newOrder)
    try { localStorage.setItem('pennyflow-dash-order', JSON.stringify(newOrder)) } catch {}
  }
  const toggleCardVisibility = (id: DashCardId) => {
    const updated = hiddenCards.includes(id) ? hiddenCards.filter(c => c !== id) : [...hiddenCards, id]
    setHiddenCards(updated)
    try { localStorage.setItem('pennyflow-dash-hidden', JSON.stringify(updated)) } catch {}
  }
  const toggleCompactMode = () => {
    const newVal = !compactMode
    setCompactMode(newVal)
    try { localStorage.setItem('pennyflow-dash-compact', String(newVal)) } catch {}
  }
  const resetDashLayout = () => {
    setDashOrder(DEFAULT_DASH_ORDER)
    setHiddenCards([])
    setCompactMode(false)
    try {
      localStorage.setItem('pennyflow-dash-order', JSON.stringify(DEFAULT_DASH_ORDER))
      localStorage.removeItem('pennyflow-dash-hidden')
      localStorage.removeItem('pennyflow-dash-compact')
    } catch {}
    setShowDashSettings(false)
  }

  const visibleDashOrder = dashOrder.filter(id => !hiddenCards.includes(id))

  // Category Icon Resolver
  const getCategoryIcon = (category: string, type: 'income' | 'expense') => {
    switch (category.toLowerCase()) {
      case 'salary': return <ShieldCheck className="h-4.5 w-4.5 text-emerald-500" />
      case 'food': return <ShoppingBag className="h-4.5 w-4.5 text-orange-400" />
      case 'entertainment': return <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
      case 'shopping': return <ShoppingBag className="h-4.5 w-4.5 text-pink-400" />
      case 'utilities': return <Calendar className="h-4.5 w-4.5 text-blue-400" />
      case 'transport': return <ArrowRight className="h-4.5 w-4.5 text-yellow-500" />
      default: return type === 'income' 
        ? <ArrowUpRight className="h-4.5 w-4.5 text-emerald-500" /> 
        : <ArrowDownRight className="h-4.5 w-4.5 text-rose-500" />
    }
  }

  // Upcoming bills
  const upcomingBills = safeBills
    .filter(b => !b.isPaid)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 2)

  const totalBillsThisMonth = safeBills
    .filter(b => {
      const dueDate = new Date(b.dueDate)
      const now = new Date()
      return dueDate.getMonth() === now.getMonth() && dueDate.getFullYear() === now.getFullYear()
    })
    .reduce((sum, b) => sum + b.amount, 0)

  // Primary Goal
  const primaryGoal = safeGoals[0]
  const goalProgress = primaryGoal 
    ? Math.min(100, Math.round((primaryGoal.currentAmount / primaryGoal.targetAmount) * 100))
    : 0

  // Lending summary
  const totalLent = metrics.totalDebt === 0 ? 0 : metrics.totalDebt
  const activeLendingCount = safeLending.filter(l => l.status === 'active').length

  return (
    <div className="flex flex-col space-y-4 pb-28">
      {/* Background Mesh Orbs */}
      <div className="absolute top-0 left-0 right-0 h-64 -z-10 bg-radial from-primary/10 via-transparent to-transparent opacity-60 dark:opacity-40 blur-3xl pointer-events-none" />

      {/* Sync prompt */}
      <SyncCard compact />

      {/* === MONTHLY SUMMARY HEADER === */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/50"
      >
        <div className="text-center flex-1">
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Expenses</p>
          <p className="text-base font-bold text-red-400 mt-0.5">
            {formatCurrency(monthlyBudgetData.monthlySpent)}
          </p>
        </div>
        <div className="w-px h-10 bg-border/50" />
        <div className="text-center flex-1">
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Income</p>
          <p className="text-base font-bold text-emerald-500 mt-0.5">
            {formatCurrency(safeAllTransactions.filter(tx => {
              const d = new Date(tx.date)
              return tx.type === 'income' && d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear()
            }).reduce((sum, tx) => sum + tx.amount, 0))}
          </p>
        </div>
        <div className="w-px h-10 bg-border/50" />
        <div className="text-center flex-1">
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Net</p>
          {(() => {
            const monthIncome = safeAllTransactions.filter(tx => {
              const d = new Date(tx.date)
              return tx.type === 'income' && d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear()
            }).reduce((sum, tx) => sum + tx.amount, 0)
            const net = monthIncome - monthlyBudgetData.monthlySpent
            return <p className={cn("text-base font-bold mt-0.5", net >= 0 ? "text-emerald-500" : "text-red-400")}>{net >= 0 ? '+' : ''}{formatCurrency(net)}</p>
          })()}
        </div>
      </motion.div>

      {/* === QUICK STATS ROW === */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => onNavigateToTab('statistics')}
          className="p-3 rounded-xl bg-card border border-border/40 hover:border-primary/30 transition-all text-center"
        >
          <p className="text-sm font-bold text-foreground">
            {formatCurrency(Math.round(monthlyBudgetData.monthlySpent / Math.max(1, new Date().getDate())))}
          </p>
          <p className="text-[9px] text-muted-foreground font-semibold mt-0.5">/day avg</p>
        </button>
        <button
          onClick={() => onNavigateToTab('achievements')}
          className="p-3 rounded-xl bg-card border border-border/40 hover:border-primary/30 transition-all text-center"
        >
          <p className="text-sm font-bold text-foreground">
            {(() => {
              // Quick streak calc — same logic as achievements
              const budgetLimit = safeBudgets.filter(b => b.isActive && b.period === 'monthly').reduce((s, b) => s + b.limit, 0)
              if (budgetLimit === 0) return '—'
              const dailyLimit = budgetLimit / 30
              let streak = 0
              for (let i = 0; i < 30; i++) {
                const d = new Date(); d.setDate(d.getDate() - i)
                const dateStr = d.toISOString().split('T')[0]
                const daySpent = safeAllTransactions.filter(t => t.type === 'expense' && t.date === dateStr).reduce((s, t) => s + t.amount, 0)
                if (daySpent <= dailyLimit || daySpent === 0) streak++; else break
              }
              return `${streak}🔥`
            })()}
          </p>
          <p className="text-[9px] text-muted-foreground font-semibold mt-0.5">streak</p>
        </button>
        <button
          onClick={() => onNavigateToTab('bills')}
          className="p-3 rounded-xl bg-card border border-border/40 hover:border-primary/30 transition-all text-center"
        >
          <p className="text-sm font-bold text-foreground">
            {safeBills.filter(b => {
              if (b.isPaid) return false
              const due = new Date(b.dueDate)
              const now = new Date()
              const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
              return due >= now && due <= weekLater
            }).length} bills
          </p>
          <p className="text-[9px] text-muted-foreground font-semibold mt-0.5">due soon</p>
        </button>
      </div>

      {/* === QUICK ACTION BAR === */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {[
          { label: 'Ledger', emoji: '📒', tab: 'ledger' },
          { label: 'Statistics', emoji: '📊', tab: 'statistics' },
          { label: 'Categories', emoji: '🏷️', tab: 'categories' },
          { label: 'Receipts', emoji: '🧾', tab: 'receipts' },
          { label: 'Recurring', emoji: '🔄', tab: 'subscriptions' },
        ].map(item => (
          <button
            key={item.tab}
            onClick={() => onNavigateToTab(item.tab)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/60 border border-border/40 hover:bg-secondary hover:border-primary/30 transition-all flex-shrink-0"
          >
            <span className="text-sm">{item.emoji}</span>
            <span className="text-[10px] font-semibold text-foreground whitespace-nowrap">{item.label}</span>
          </button>
        ))}
      </div>

      {/* === QUICK ADD CATEGORY BUTTONS (core 2-tap logging) === */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Add</p>
          {todaySpent > 0 && (
            <p className="text-[10px] text-muted-foreground">Today: <span className="font-bold text-foreground">{formatCurrency(todaySpent)}</span></p>
          )}
        </div>

        <div className="grid grid-cols-5 gap-2">
          {QUICK_ADD_CATEGORIES.map(cat => {
            const Icon = cat.icon
            return (
              <motion.button
                key={cat.id}
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  setQuickAddCategory(cat.id)
                  setQuickAddAmount('')
                  setQuickAddSuccess(false)
                }}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-border/40 transition-all",
                  quickAddCategory === cat.id
                    ? "bg-primary/10 border-primary/40 shadow-sm"
                    : "bg-card hover:bg-secondary/60"
                )}
              >
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", cat.bg)}>
                  <Icon className={cn("w-4 h-4", cat.color)} />
                </div>
                <span className="text-[10px] font-semibold text-foreground leading-tight">{cat.label}</span>
              </motion.button>
            )
          })}
          {/* +More button opens the full quick-add modal (already exists via FAB) */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => onNavigateToTab('ledger')}
            className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-border/40 bg-card hover:bg-secondary/60 transition-all"
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-secondary">
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground leading-tight">More</span>
          </motion.button>
        </div>

        {/* Inline Quick-Add Amount Input */}
        <AnimatePresence>
          {quickAddCategory && !quickAddSuccess && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-secondary/50 border border-border/50">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">₹</span>
                  <input
                    ref={quickAddInputRef}
                    type="number"
                    inputMode="numeric"
                    placeholder="Amount"
                    value={quickAddAmount}
                    onChange={(e) => setQuickAddAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleQuickAddSave()
                      if (e.key === 'Escape') setQuickAddCategory(null)
                    }}
                    className="w-full h-10 pl-8 pr-3 rounded-xl bg-background border border-border/70 text-sm font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/60"
                  />
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleQuickAddSave}
                  disabled={quickAddSaving || !quickAddAmount || Number(quickAddAmount) <= 0}
                  className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-xs disabled:opacity-40 transition-opacity"
                >
                  {quickAddSaving ? '...' : 'Add'}
                </motion.button>
                <button
                  onClick={() => setQuickAddCategory(null)}
                  className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-secondary transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick-add success feedback */}
        <AnimatePresence>
          {quickAddSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-2 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30"
            >
              <Check className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Expense logged!
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Today's Transactions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-tight text-foreground">Today</h3>
          {todayTransactions.length > 0 && (
            <button onClick={() => onNavigateToTab('ledger')} className="text-xs text-primary font-semibold flex items-center gap-1">
              All <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {todayTransactions.length > 0 ? (
          <div className="space-y-2">
            {todayTransactions.slice(0, 6).map((tx) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50"
              >
                <div className="flex items-center space-x-3">
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-lg", getCategoryConfig(tx.category).bg)}>
                    {getCategoryConfig(tx.category).emoji}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">{tx.description || tx.category}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{tx.category}</p>
                  </div>
                </div>
                <p className={cn("text-xs font-bold", tx.type === 'income' ? "text-emerald-500" : "text-foreground")}>
                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                </p>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-secondary/20 border border-dashed border-border/50 text-center">
            <Sparkles className="h-6 w-6 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">Nothing logged today</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Tap a category above to log an expense</p>
          </div>
        )}
      </div>

      {/* === END PHASE 0.1 === */}

      {/* Phase 2.7: Smart Insights */}
      {smartInsights.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Insights</p>
          {smartInsights.map(insight => (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "flex items-start gap-3 p-3 rounded-2xl border",
                insight.severity === 'warning' ? "bg-amber-500/5 border-amber-500/20" :
                insight.severity === 'positive' ? "bg-emerald-500/5 border-emerald-500/20" :
                "bg-secondary/30 border-border/50"
              )}
            >
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                insight.severity === 'warning' ? "bg-amber-500/10" :
                insight.severity === 'positive' ? "bg-emerald-500/10" :
                "bg-primary/10"
              )}>
                {insight.severity === 'warning' && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                {insight.severity === 'positive' && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
                {insight.severity === 'info' && <Sparkles className="w-3.5 h-3.5 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-foreground">{insight.title}</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{insight.message}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Overview Section Divider */}
      <div className="pt-2 flex items-center justify-between">
        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Overview</p>
        <button
          onClick={() => setShowDashSettings(!showDashSettings)}
          className="text-[10px] text-primary font-semibold"
        >
          {showDashSettings ? 'Done' : 'Customize'}
        </button>
      </div>

      {/* Dashboard Layout Settings (Phase 16) */}
      <AnimatePresence>
        {showDashSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 rounded-2xl bg-secondary/30 border border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-foreground">Show/Hide Cards</p>
                <button onClick={resetDashLayout} className="text-[9px] text-destructive font-bold">Reset Default</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_DASH_ORDER.map(id => (
                  <button
                    key={id}
                    onClick={() => toggleCardVisibility(id)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-[10px] font-semibold transition-all border",
                      hiddenCards.includes(id)
                        ? "bg-secondary/50 text-muted-foreground border-border/30 opacity-50"
                        : "bg-primary/10 text-primary border-primary/20"
                    )}
                  >
                    {hiddenCards.includes(id) ? '○' : '●'} {id}
                  </button>
                ))}
              </div>
              <button
                onClick={toggleCompactMode}
                className={cn(
                  "w-full py-2 rounded-xl text-[10px] font-bold transition-all border",
                  compactMode ? "bg-primary/10 text-primary border-primary/20" : "bg-secondary text-muted-foreground border-border/30"
                )}
              >
                {compactMode ? '✓ Compact Mode ON' : 'Enable Compact Mode'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Reorder.Group axis="y" values={visibleDashOrder} onReorder={handleDashReorder} className={cn("space-y-4", compactMode && "space-y-2")}>
        {visibleDashOrder.map((cardId) => {
          switch (cardId) {
            case 'networth':
              return (
                <DashReorderCard key="networth" cardId="networth">
                  <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 relative overflow-hidden">
                    <div className="absolute -right-20 -top-20 w-48 h-48 rounded-full bg-primary/10 blur-3xl" />
                    <CardContent className="pt-6">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Net Worth</p>
                      <h2 className="text-3xl sm:text-5xl font-bold text-foreground mb-6 break-all">{formatCurrency(netWorth)}</h2>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-2xl bg-secondary/50 border border-border/50">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase">Cash & Checking</p>
                          <p className="text-base font-bold text-foreground mt-1">{formatCurrency(liquidAssets)}</p>
                        </div>
                        <div className="p-3 rounded-2xl bg-secondary/50 border border-border/50">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase">Invested</p>
                          <p className="text-base font-bold text-foreground mt-1">{formatCurrency(investedAssets)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </DashReorderCard>
              )

            case 'health':
              return (
                <DashReorderCard key="health" cardId="health">
                  <HealthCardInteractive
                    healthScore={healthScore}
                    metrics={metrics}
                    onNavigate={onNavigateToTab}
                  />
                </DashReorderCard>
              )

            case 'cash':
              return (
                <DashReorderCard key="cash" cardId="cash">
                  <CashCardInteractive
                    availableCash={availableCash}
                    liquidAssets={liquidAssets}
                    monthlyExpenses={monthlyExpenses}
                    monthlyRecurring={monthlyRecurring}
                    cashStatus={cashStatus}
                    accounts={safeAccounts}
                    onNavigate={onNavigateToTab}
                  />
                </DashReorderCard>
              )

            case 'month':
              return (
                <DashReorderCard key="month" cardId="month">
                  <MonthCardInteractive
                    metrics={metrics}
                    spendingTrend={spendingTrend}
                    transactions={safeAllTransactions}
                    onNavigate={onNavigateToTab}
                  />
                </DashReorderCard>
              )

            case 'bills':
              if (upcomingBills.length === 0) return null
              return (
                <DashReorderCard key="bills" cardId="bills">
                  <Card className="bg-gradient-to-br from-amber-950/20 to-amber-900/10 border-amber-500/30">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Bills Due</p>
                          <h3 className="text-2xl font-bold text-foreground">{formatCurrency(totalBillsThisMonth)}</h3>
                        </div>
                        <Clock className="w-6 h-6 text-amber-500" />
                      </div>
                      <div className="space-y-2">
                        {upcomingBills.map((bill, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-border/50">
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-foreground">{bill.title}</p>
                              <p className="text-[10px] text-muted-foreground">Due {new Date(bill.dueDate).toLocaleDateString()}</p>
                            </div>
                            <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{formatCurrency(bill.amount)}</p>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => onNavigateToTab('forecast')} className="w-full mt-3 py-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold hover:bg-amber-500/30 transition-colors">
                        View All Bills →
                      </button>
                    </CardContent>
                  </Card>
                </DashReorderCard>
              )

            case 'goals':
              if (!primaryGoal) return null
              return (
                <DashReorderCard key="goals" cardId="goals">
                  <Card className="bg-gradient-to-br from-indigo-950/20 to-indigo-900/10 border-indigo-500/30">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Savings Goal</p>
                          <h3 className="text-lg font-bold text-foreground">{primaryGoal.title}</h3>
                        </div>
                        <Target className="w-6 h-6 text-indigo-500" />
                      </div>
                      <div className="mb-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-muted-foreground">{formatCurrency(primaryGoal.currentAmount)} of {formatCurrency(primaryGoal.targetAmount)}</span>
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{goalProgress}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${goalProgress}%` }} />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Target: {new Date(primaryGoal.targetDate).toLocaleDateString()}</p>
                    </CardContent>
                  </Card>
                </DashReorderCard>
              )

            case 'lending':
              if (activeLendingCount === 0) return null
              return (
                <DashReorderCard key="lending" cardId="lending">
                  <Card className="bg-gradient-to-br from-pink-950/20 to-pink-900/10 border-pink-500/30">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Active Lending</p>
                          <h3 className="text-2xl font-bold text-foreground">{activeLendingCount} active</h3>
                          <p className="text-xs text-muted-foreground mt-1">Track your IOUs</p>
                        </div>
                        <Heart className="w-6 h-6 text-pink-500" />
                      </div>
                      <button onClick={() => onNavigateToTab('assets')} className="w-full mt-4 py-2 rounded-lg bg-pink-500/20 text-pink-600 dark:text-pink-400 text-xs font-semibold hover:bg-pink-500/30 transition-colors">
                        View Lending Details →
                      </button>
                    </CardContent>
                  </Card>
                </DashReorderCard>
              )

            case 'recent':
              if (safeTransactions.length === 0) return null
              return (
                <DashReorderCard key="recent" cardId="recent">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold tracking-tight text-foreground">Recent Activity</h3>
                      <button onClick={() => onNavigateToTab('ledger')} className="text-xs text-primary font-semibold flex items-center gap-1">
                        See all <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {safeTransactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                              {getCategoryIcon(tx.category, tx.type)}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-foreground">{tx.description}</p>
                              <p className="text-[10px] text-muted-foreground">{tx.category}</p>
                            </div>
                          </div>
                          <p className={cn("text-xs font-bold", tx.type === 'income' ? "text-emerald-500" : "text-foreground")}>
                            {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </DashReorderCard>
              )

            default:
              return null
          }
        })}
      </Reorder.Group>

      {/* Empty State - only show if truly nothing exists */}
      {safeTransactions.length === 0 && safeAssets.length === 0 && safeBills.length === 0 && safeGoals.length === 0 && (
        <div className="flex flex-col items-center justify-center p-8 rounded-3xl bg-secondary/30 border border-dashed border-border/60 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/60 mb-3" />
          <p className="text-xs font-semibold text-muted-foreground">Start tracking your finances</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">Add your first transaction using the + button</p>
        </div>
      )}
    </div>
  )
}

// === INTERACTIVE CARD COMPONENTS ===

function HealthCardInteractive({ healthScore, metrics, onNavigate }: { healthScore: any; metrics: any; onNavigate: (tab: any) => void }) {
  const [expanded, setExpanded] = React.useState(false)

  // Sub-scores
  const savingsRate = metrics.monthlyIncome > 0 ? Math.min(100, Math.round(((metrics.monthlyIncome - metrics.monthlyExpenses) / metrics.monthlyIncome) * 100)) : 0
  const debtRatio = metrics.totalDebt > 0 ? Math.max(0, 100 - Math.round((metrics.totalDebt / (metrics.monthlyIncome * 12)) * 100)) : 100
  const budgetAdherence = Math.max(0, Math.min(100, 100 - Math.abs(50 - healthScore.score)))
  const emergencyFund = Math.min(100, Math.round((savingsRate / 20) * 100))

  const subScores = [
    { label: 'Savings Rate', score: savingsRate, color: 'bg-emerald-500' },
    { label: 'Debt Health', score: debtRatio, color: 'bg-blue-500' },
    { label: 'Budget Adherence', score: budgetAdherence, color: 'bg-purple-500' },
    { label: 'Emergency Fund', score: emergencyFund, color: 'bg-amber-500' },
  ]

  const weakest = subScores.reduce((min, s) => s.score < min.score ? s : min, subScores[0])

  return (
    <Card className="bg-gradient-to-br from-card via-card to-secondary/40 relative overflow-hidden border-2 border-primary/30 cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <div className="absolute -right-20 -top-20 w-48 h-48 rounded-full bg-primary/8 blur-3xl" />
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Financial Health</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">{healthScore.score}</span>
              <span className="text-sm text-muted-foreground">/100</span>
            </div>
          </div>
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="54" className="stroke-muted/30" strokeWidth="8" fill="none" />
              <circle cx="60" cy="60" r="54" className="stroke-primary transition-all duration-700" strokeWidth="8" fill="none" strokeDasharray={`${(healthScore.score / 100) * 2 * Math.PI * 54} ${2 * Math.PI * 54}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl">{HealthScoreService.getHealthEmoji(healthScore.score)}</span>
            </div>
          </div>
        </div>

        <div className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
          healthScore.trend === 'improving' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
          healthScore.trend === 'declining' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
          'bg-amber-500/10 text-amber-600 dark:text-amber-400'
        )}>
          {healthScore.trend === 'improving' && <ArrowUpRight className="w-3.5 h-3.5" />}
          {healthScore.trend === 'declining' && <ArrowDownRight className="w-3.5 h-3.5" />}
          {healthScore.trend === 'stable' && <Zap className="w-3.5 h-3.5" />}
          <span className="capitalize">{healthScore.trend} this month</span>
        </div>

        {/* Expandable sub-scores */}
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
                {subScores.map(sub => (
                  <div key={sub.label} className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground font-medium">{sub.label}</span>
                      <span className="font-bold text-foreground">{sub.score}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", sub.color)} style={{ width: `${sub.score}%` }} />
                    </div>
                  </div>
                ))}
                <button
                  onClick={(e) => { e.stopPropagation(); onNavigate('debtplanner') }}
                  className="w-full mt-2 py-2 rounded-xl bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors"
                >
                  Improve: {weakest.label} ({weakest.score}%) →
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!expanded && (
          <p className="text-[10px] text-muted-foreground mt-3">Tap to see breakdown</p>
        )}
      </CardContent>
    </Card>
  )
}

function MonthCardInteractive({ metrics, spendingTrend, transactions, onNavigate }: { metrics: any; spendingTrend: any; transactions: any[]; onNavigate: (tab: any) => void }) {
  const [expanded, setExpanded] = React.useState(false)

  const dailyAvg = metrics.monthlyExpenses / Math.max(1, new Date().getDate())

  // Top 3 spending categories this month
  const now = new Date()
  const monthTx = transactions.filter((tx: any) => {
    const d = new Date(tx.date)
    return tx.type === 'expense' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const byCat: Record<string, number> = {}
  monthTx.forEach((tx: any) => { byCat[tx.category] = (byCat[tx.category] || 0) + tx.amount })
  const topCategories = Object.entries(byCat).sort(([,a], [,b]) => (b as number) - (a as number)).slice(0, 3)

  return (
    <Card className="bg-gradient-to-br from-card to-secondary/20 cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <CardContent className="pt-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">This Month</p>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Income</span>
            <span className="text-sm font-bold text-emerald-500">+{formatCurrency(metrics.monthlyIncome)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Spending</span>
            <span className={cn("text-sm font-bold", metrics.monthlyExpenses > metrics.monthlyIncome * 0.8 ? 'text-red-500' : 'text-foreground')}>
              -{formatCurrency(metrics.monthlyExpenses)}
            </span>
          </div>
          <div className="pt-2 border-t border-border/50 flex justify-between items-center">
            <span className="text-sm font-semibold">Savings</span>
            <span className={cn("text-lg font-bold", (metrics.monthlyIncome - metrics.monthlyExpenses) > 0 ? 'text-emerald-500' : 'text-red-500')}>
              {(metrics.monthlyIncome - metrics.monthlyExpenses) > 0 ? '+' : ''}{formatCurrency(metrics.monthlyIncome - metrics.monthlyExpenses)}
            </span>
          </div>

          {spendingTrend.previous > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {spendingTrend.changePercent > 0 ? '📈' : '📉'}
              <span>{Math.abs(Math.round(spendingTrend.changePercent))}% {spendingTrend.changePercent > 0 ? 'more' : 'less'} than last month</span>
            </div>
          )}
        </div>

        {/* Expandable detail */}
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Daily average</span>
                  <span className="font-bold text-foreground">{formatCurrency(Math.round(dailyAvg))}/day</span>
                </div>
                {topCategories.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Top Spending</p>
                    {topCategories.map(([cat, amt]) => (
                      <div key={cat} className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">{getCategoryConfig(cat).emoji} {cat}</span>
                        <span className="font-bold text-foreground">{formatCurrency(amt as number)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onNavigate('statistics') }}
                  className="w-full py-2 rounded-xl bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors"
                >
                  View Full Breakdown →
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!expanded && <p className="text-[10px] text-muted-foreground mt-3">Tap for details</p>}
      </CardContent>
    </Card>
  )
}

function CashCardInteractive({ availableCash, liquidAssets, monthlyExpenses, monthlyRecurring, cashStatus, accounts, onNavigate }: {
  availableCash: number; liquidAssets: number; monthlyExpenses: number; monthlyRecurring: number; cashStatus: string; accounts: any[]; onNavigate: (tab: any) => void
}) {
  const [expanded, setExpanded] = React.useState(false)

  const runwayDays = monthlyExpenses > 0 ? Math.round((liquidAssets / monthlyExpenses) * 30) : 999
  const cashAccounts = accounts.filter(a => a.type === 'cash' || a.type === 'bank')

  return (
    <Card className={cn(
      "relative overflow-hidden cursor-pointer",
      cashStatus === 'healthy' ? 'bg-gradient-to-br from-emerald-950/20 to-emerald-900/10 border-emerald-500/30' :
      cashStatus === 'warning' ? 'bg-gradient-to-br from-amber-950/20 to-amber-900/10 border-amber-500/30' :
      'bg-gradient-to-br from-red-950/20 to-red-900/10 border-red-500/30'
    )} onClick={() => setExpanded(!expanded)}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Available Cash</p>
            <h3 className="text-2xl font-bold text-foreground">{formatCurrency(availableCash)}</h3>
            <p className={cn(
              "text-xs font-medium mt-1",
              cashStatus === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' :
              cashStatus === 'warning' ? 'text-amber-600 dark:text-amber-400' :
              'text-red-600 dark:text-red-400'
            )}>
              {runwayDays > 90 ? `✓ ${Math.round(runwayDays / 30)} months runway` :
               runwayDays > 30 ? `⚡ ${runwayDays} days of expenses covered` :
               `🚨 Only ${runwayDays} days of runway`}
            </p>
          </div>
          <DollarSign className={cn(
            "w-7 h-7",
            cashStatus === 'healthy' ? 'text-emerald-500' :
            cashStatus === 'warning' ? 'text-amber-500' : 'text-red-500'
          )} />
        </div>

        {/* Expandable account breakdown */}
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                {cashAccounts.length > 0 ? cashAccounts.map(acc => (
                  <div key={acc.id} className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">{acc.icon || '🏦'} {acc.name}</span>
                    <span className="font-bold text-foreground">{formatCurrency(acc.balance)}</span>
                  </div>
                )) : (
                  <p className="text-[10px] text-muted-foreground">No accounts added yet</p>
                )}
                <div className="pt-2 border-t border-border/30 space-y-1.5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Monthly Bills</span>
                    <span className="font-semibold">{formatCurrency(monthlyRecurring)}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Avg Monthly Spend</span>
                    <span className="font-semibold">{formatCurrency(monthlyExpenses)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onNavigate('accounts') }}
                  className="w-full py-2 rounded-xl bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors"
                >
                  Manage Accounts →
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!expanded && <p className="text-[10px] text-muted-foreground mt-2">Tap to see accounts</p>}
      </CardContent>
    </Card>
  )
}

// Dashboard reorderable card with grip handle
function DashReorderCard({ cardId, children }: { cardId: DashCardId; children: React.ReactNode }) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={cardId}
      dragListener={false}
      dragControls={controls}
      className="relative"
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 50 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      {/* Drag handle */}
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        className="absolute top-4 right-4 z-10 p-2 rounded-xl cursor-grab active:cursor-grabbing touch-none bg-secondary/80 hover:bg-secondary transition-colors"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      {children}
    </Reorder.Item>
  )
}
