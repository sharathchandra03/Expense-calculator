'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Transaction, Lending, Asset, Goal, Bill, generateUUID, syncAccountToAsset } from '@/db/schema'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { formatCurrency, cn } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, Sparkles, Target, Calendar, ArrowRight, ShieldCheck, AlertCircle, ShoppingBag, Plus, Zap, TrendingUp, DollarSign, Heart, Clock, UtensilsCrossed, Car, ShoppingCart, Receipt, MoreHorizontal, X, Check, Settings } from 'lucide-react'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import { HealthScoreService, HealthScoreBreakdown } from '@/services/HealthScoreService'
import { SyncCard } from '@/components/ui/sync-card'
import { useUndo } from '@/components/ui/undo-toast'
import { SmartDefaultsService } from '@/services/SmartDefaultsService'
import { SmartInsightsService, Insight } from '@/services/SmartInsightsService'
import { getCategoryConfig } from '@/lib/category-icons'

interface DashboardProps {
  onNavigateToTab: (tab: any) => void;
}

type DashCardId = 'spending' | 'health' | 'topcat' | 'month' | 'bills' | 'goals' | 'lending' | 'recent'

const DEFAULT_DASH_ORDER: DashCardId[] = ['spending', 'health', 'topcat', 'month', 'bills', 'goals', 'lending', 'recent']

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
  const [quickAddDate, setQuickAddDate] = useState(new Date().toISOString().split('T')[0])
  const [quickAddTime, setQuickAddTime] = useState(new Date().toTimeString().slice(0, 5))
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
          date: quickAddDate,
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
        setQuickAddDate(new Date().toISOString().split('T')[0])
        setQuickAddTime(new Date().toTimeString().slice(0, 5))
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
  // Net Worth: use accounts as primary source if any exist, otherwise fall back to assets
  const primaryBalance = safeAccounts.length > 0 ? accountsTotal : assetsTotal
  const netWorth = primaryBalance + investmentsValue + lentOut - borrowed

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
    try {
      const s = localStorage.getItem('pennyflow-dash-hidden')
      if (s) {
        const parsed = JSON.parse(s)
        // Filter out old card IDs that no longer exist
        return parsed.filter((id: string) => DEFAULT_DASH_ORDER.includes(id as DashCardId))
      }
    } catch {}
    return []
  })
  const [compactMode, setCompactMode] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pennyflow-dash-compact') === 'true'
  })
  const [showDashSettings, setShowDashSettings] = React.useState(false)
  const [showAllInsights, setShowAllInsights] = React.useState(false)

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

  // Month income / net for hero trend line
  const monthIncomeTotal = safeAllTransactions.filter(tx => {
    const d = new Date(tx.date)
    return tx.type === 'income' && d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear()
  }).reduce((sum, tx) => sum + tx.amount, 0)
  const monthNet = monthIncomeTotal - monthlyBudgetData.monthlySpent
  const monthTrendPct = monthIncomeTotal > 0 ? Math.round((monthNet / monthIncomeTotal) * 100) : 0

  return (
    <div className="flex flex-col pb-6 bg-background">
      {/* === HERO + REPORT COMPOSITION === */}
      <div className="px-5 pt-10">
        {/* Purple hero card — same horizontal margins as report card */}
        <div className="hero-gradient px-6 pt-10 pb-8 rounded-[1.75rem] text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium text-white/70">Net balance</span>
              <Sparkles className="w-3.5 h-3.5 text-white/50" />
            </div>
            <button
              onClick={() => onNavigateToTab('settings')}
              className="h-9 w-9 rounded-full bg-white/12 flex items-center justify-center"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4 text-white/80" />
            </button>
          </div>

          {/* Balance */}
          {(() => {
            const full = formatCurrency(netWorth)
            const dot = full.lastIndexOf('.')
            const main = dot > -1 ? full.slice(0, dot) : full
            const dec = dot > -1 ? full.slice(dot) : ''
            return (
              <h1 className="text-[42px] leading-none font-bold tracking-tight">
                {main}<span className="text-[26px] text-white/60 font-semibold">{dec}</span>
              </h1>
            )
          })()}

          {/* Trend line */}
          <p className={cn("text-[12px] font-medium mt-2.5", monthNet >= 0 ? "text-emerald-300" : "text-rose-300")}>
            {monthNet >= 0 ? '+' : ''}{monthTrendPct}% · {monthNet >= 0 ? 'You crushed it this month. Keep going!' : 'Spending outpaced income this month.'}
          </p>

          {/* Account pills */}
          <div className="flex items-center gap-2 mt-5 overflow-x-auto pb-0.5">
            {safeAccounts.slice(0, 5).map(acc => (
              <button
                key={acc.id}
                onClick={() => onNavigateToTab('accounts')}
                className="flex-shrink-0 px-3.5 py-2 rounded-xl bg-white/12 text-[11px] font-semibold text-white/90 whitespace-nowrap"
              >
                {acc.name}
              </button>
            ))}
            <button
              onClick={() => onNavigateToTab('accounts')}
              className="flex-shrink-0 h-9 w-9 rounded-xl bg-white/12 flex items-center justify-center"
              aria-label="Add account"
            >
              <Plus className="w-4 h-4 text-white/80" />
            </button>
          </div>
        </div>

        {/* Report card — overlaps hero, same horizontal grid */}
        <div className="card-surface p-5 mt-4 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-foreground">Report this month</h3>
          <button onClick={() => onNavigateToTab('analytics')} className="text-[12px] font-medium text-accent-foreground">
            See details
          </button>
        </div>

        {/* Summary pills */}
        <div className="flex items-center gap-2 mb-5">
          <div className="px-3 py-1.5 rounded-full bg-secondary text-[11px] font-semibold text-foreground">All</div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span className="text-[11px] text-muted-foreground">Spent</span>
            <span className="text-[11px] font-semibold text-foreground">{formatCurrency(monthlyBudgetData.monthlySpent)}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[11px] text-muted-foreground">Income</span>
            <span className="text-[11px] font-semibold text-foreground">{formatCurrency(monthIncomeTotal)}</span>
          </div>
        </div>

        {/* Daily spend sparkline (last 14 days) */}
        {(() => {
          const days = 14
          const today = new Date()
          const series: number[] = []
          for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today); d.setDate(d.getDate() - i)
            const ds = d.toISOString().split('T')[0]
            const spent = safeAllTransactions.filter(t => t.type === 'expense' && t.date === ds).reduce((s, t) => s + t.amount, 0)
            series.push(spent)
          }
          const max = Math.max(...series, 1)
          const W = 300, H = 72
          const step = W / (days - 1)
          const pts = series.map((v, i) => `${i * step},${H - (v / max) * (H - 8) - 4}`).join(' ')
          const areaPts = `0,${H} ${pts} ${W},${H}`
          return (
            <div className="relative">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[72px]">
                <defs>
                  <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ring)" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="var(--ring)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points={areaPts} fill="url(#sparkFill)" />
                <polyline points={pts} fill="none" stroke="var(--ring)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-muted-foreground">14 days ago</span>
                <span className="text-[10px] text-muted-foreground">Today</span>
              </div>
            </div>
          )
        })()}

        {/* Budget bar */}
        {monthlyBudgetData.hasBudget && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-muted-foreground">Budget used</p>
              <p className="text-[11px] font-semibold text-foreground">{Math.round(monthlyBudgetData.percentUsed)}%</p>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500",
                  monthlyBudgetData.percentUsed > 90 ? "bg-rose-500" : monthlyBudgetData.percentUsed > 70 ? "bg-amber-500" : "bg-emerald-500")}
                style={{ width: `${Math.min(100, monthlyBudgetData.percentUsed)}%` }}
              />
            </div>
          </div>
        )}
      </div>{/* end report card */}
      </div>{/* end hero + report composition */}

      {/* Remaining content — same px-5 margin */}
      <div className="px-5 pt-4 space-y-4">
        <SyncCard compact />

      {/* === QUICK ADD === */}
      <div className="card-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-foreground">Quick add</h3>
          {todaySpent > 0 && (
            <p className="text-[12px] text-muted-foreground">Today <span className="font-semibold text-foreground">{formatCurrency(todaySpent)}</span></p>
          )}
        </div>

        <div className="grid grid-cols-5 gap-3 justify-items-center">
          {QUICK_ADD_CATEGORIES.map(cat => {
            const Icon = cat.icon
            return (
              <motion.button
                key={cat.id}
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  setQuickAddCategory(cat.id)
                  setQuickAddAmount('')
                  setQuickAddSuccess(false)
                }}
                className="flex flex-col items-center gap-2 py-2 rounded-2xl transition-colors"
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                  quickAddCategory === cat.id ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : "",
                  cat.bg
                )}>
                  <Icon className={cn("w-5 h-5", cat.color)} />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground">{cat.label}</span>
              </motion.button>
            )
          })}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => onNavigateToTab('categories')}
            className="flex flex-col items-center gap-2 py-2 rounded-2xl transition-colors"
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-secondary">
              <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">More</span>
          </motion.button>
        </div>

        {/* Inline Quick-Add Form */}
        <AnimatePresence>
          {quickAddCategory && !quickAddSuccess && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-3">
                {/* Amount row */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground font-medium">₹</span>
                    <input
                      ref={quickAddInputRef}
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={quickAddAmount}
                      onChange={(e) => setQuickAddAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickAddSave()
                        if (e.key === 'Escape') setQuickAddCategory(null)
                      }}
                      className="w-full h-12 pl-9 pr-3 rounded-2xl bg-secondary text-[15px] font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <button
                    onClick={handleQuickAddSave}
                    disabled={quickAddSaving || !quickAddAmount || Number(quickAddAmount) <= 0}
                    className="h-12 px-5 rounded-2xl bg-primary text-primary-foreground font-semibold text-[14px] disabled:opacity-30 transition-opacity"
                  >
                    {quickAddSaving ? '...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setQuickAddCategory(null)}
                    className="h-12 w-12 flex items-center justify-center rounded-2xl bg-secondary hover:bg-secondary/70 transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Date and Time row */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="date"
                      value={quickAddDate}
                      onChange={(e) => setQuickAddDate(e.target.value)}
                      className="w-full h-11 pl-9 pr-3 rounded-xl bg-secondary text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                  <div className="flex-1 relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="time"
                      value={quickAddTime}
                      onChange={(e) => setQuickAddTime(e.target.value)}
                      className="w-full h-11 pl-9 pr-3 rounded-xl bg-secondary text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success feedback */}
        <AnimatePresence>
          {quickAddSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-2 mt-4 p-3 rounded-2xl bg-emerald-500/10"
            >
              <Check className="w-4 h-4 text-positive" />
              <span className="text-[13px] font-semibold text-positive">Expense logged!</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* === RECENT TRANSACTION === */}
      <div className="card-surface p-5">
        <h3 className="text-[15px] font-semibold text-foreground mb-4">Recent transaction</h3>

        {safeTransactions.length > 0 ? (
          <div>
            {safeTransactions.slice(0, 4).map((tx) => {
              const cfg = getCategoryConfig(tx.category)
              const acct = safeAccounts.find(a => a.id === tx.accountId)
              const d = new Date(tx.date)
              return (
                <div key={tx.id} className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0", cfg.bg)}>
                    {cfg.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-foreground truncate">{tx.description || tx.category}</p>
                    <p className="text-[12px] text-muted-foreground truncate capitalize">
                      {cfg.label} · {d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={cn("text-[14px] font-bold", tx.type === 'income' ? "text-positive" : "text-negative")}>
                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </p>
                    {acct && <p className="text-[11px] text-muted-foreground mt-0.5">{acct.name}</p>}
                  </div>
                </div>
              )
            })}

            <button
              onClick={() => onNavigateToTab('ledger')}
              className="w-full mt-4 py-3 rounded-2xl bg-secondary text-[13px] font-semibold text-foreground hover:bg-secondary/70 transition-colors"
            >
              See all transaction
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-[13px] text-muted-foreground">No transactions yet</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Tap the + button to log your first expense</p>
          </div>
        )}
      </div>

      {/* Smart Insights */}
      {smartInsights.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-foreground">Insights</p>
            {smartInsights.length > 2 && (
              <button onClick={() => setShowAllInsights(!showAllInsights)} className="text-[12px] font-medium text-accent-foreground">
                {showAllInsights ? 'Show less' : `View all →`}
              </button>
            )}
          </div>
          {(showAllInsights ? smartInsights : smartInsights.slice(0, 2)).map(insight => (
            <div
              key={insight.id}
              className={cn(
                "flex items-start gap-3 p-4 rounded-2xl",
                insight.severity === 'warning' ? "bg-amber-500/10" :
                insight.severity === 'positive' ? "bg-emerald-500/10" :
                "card-surface"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                insight.severity === 'warning' ? "bg-amber-500/20" :
                insight.severity === 'positive' ? "bg-emerald-500/20" :
                "bg-secondary"
              )}>
                {insight.severity === 'warning' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                {insight.severity === 'positive' && <TrendingUp className="w-4 h-4 text-positive" />}
                {insight.severity === 'info' && <Sparkles className="w-4 h-4 text-accent-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground">{insight.title}</p>
                <p className="text-[12px] text-muted-foreground leading-relaxed mt-0.5">{insight.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Overview Section */}
      <div className="pt-1 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-foreground">Overview</p>
        <button
          onClick={() => setShowDashSettings(!showDashSettings)}
          className="text-[12px] text-accent-foreground font-medium"
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
            case 'spending':
              return (
                <DashReorderCard key="spending" cardId="spending">
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Spending Pace</p>
                      <div className="flex items-baseline gap-2 mb-4">
                        <span className="text-2xl font-bold text-foreground">{formatCurrency(Math.round(monthlyBudgetData.monthlySpent / Math.max(1, new Date().getDate())))}</span>
                        <span className="text-xs text-muted-foreground">/day avg</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-2.5 rounded-xl bg-secondary/50">
                          <p className="text-[9px] text-muted-foreground uppercase">This month</p>
                          <p className="text-sm font-bold text-foreground mt-0.5">{formatCurrency(monthlyBudgetData.monthlySpent)}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-secondary/50">
                          <p className="text-[9px] text-muted-foreground uppercase">Income</p>
                          <p className="text-sm font-bold text-positive mt-0.5">{formatCurrency(monthIncomeTotal)}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-secondary/50">
                          <p className="text-[9px] text-muted-foreground uppercase">Saved</p>
                          <p className={cn("text-sm font-bold mt-0.5", monthNet >= 0 ? "text-positive" : "text-negative")}>{formatCurrency(Math.abs(monthNet))}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </DashReorderCard>
              )

            case 'topcat':
              {
                const now = new Date()
                const monthExpenses = safeAllTransactions.filter(tx => {
                  const d = new Date(tx.date)
                  return tx.type === 'expense' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
                })
                const catMap: Record<string, number> = {}
                monthExpenses.forEach(tx => { catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount })
                const topCats = Object.entries(catMap).sort(([,a], [,b]) => b - a).slice(0, 5)
                const totalExp = monthExpenses.reduce((s, t) => s + t.amount, 0)

                if (topCats.length === 0) return null
                return (
                  <DashReorderCard key="topcat" cardId="topcat">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Categories</p>
                          <button onClick={() => onNavigateToTab('analytics')} className="text-[10px] text-accent-foreground font-medium">Details →</button>
                        </div>
                        <div className="space-y-3">
                          {topCats.map(([cat, amt]) => {
                            const pct = totalExp > 0 ? Math.round((amt / totalExp) * 100) : 0
                            const cfg = getCategoryConfig(cat)
                            return (
                              <div key={cat} className="flex items-center gap-3">
                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0", cfg.bg)}>{cfg.emoji}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-[12px] font-medium text-foreground capitalize">{cat}</span>
                                    <span className="text-[12px] font-bold text-foreground">{formatCurrency(amt)}</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                                    <div className="h-full rounded-full bg-accent-foreground/60" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </DashReorderCard>
                )
              }

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
              return (
                <DashReorderCard key="bills" cardId="bills">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Bills</p>
                          <h3 className="text-2xl font-bold text-foreground">{upcomingBills.length > 0 ? formatCurrency(totalBillsThisMonth) : 'No bills'}</h3>
                        </div>
                        <Clock className="w-6 h-6 text-amber-500" />
                      </div>
                      {upcomingBills.length > 0 ? (
                        <div className="space-y-2">
                          {upcomingBills.map((bill, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50">
                              <div className="flex-1">
                                <p className="text-xs font-semibold text-foreground">{bill.title}</p>
                                <p className="text-[10px] text-muted-foreground">Due {new Date(bill.dueDate).toLocaleDateString()}</p>
                              </div>
                              <p className="text-sm font-bold text-foreground">{formatCurrency(bill.amount)}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-muted-foreground">Add bills to track due dates and never miss a payment.</p>
                      )}
                      <button onClick={() => onNavigateToTab('bills')} className="w-full mt-3 py-2.5 rounded-xl bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/70 transition-colors">
                        {upcomingBills.length > 0 ? 'View All Bills' : 'Add a Bill'} →
                      </button>
                    </CardContent>
                  </Card>
                </DashReorderCard>
              )

            case 'goals':
              return (
                <DashReorderCard key="goals" cardId="goals">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Savings Goal</p>
                          <h3 className="text-lg font-bold text-foreground">{primaryGoal ? primaryGoal.title : 'No goals set'}</h3>
                        </div>
                        <Target className="w-6 h-6 text-indigo-500" />
                      </div>
                      {primaryGoal ? (
                        <div className="mb-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-muted-foreground">{formatCurrency(primaryGoal.currentAmount)} of {formatCurrency(primaryGoal.targetAmount)}</span>
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{goalProgress}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${goalProgress}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-2">Target: {new Date(primaryGoal.targetDate).toLocaleDateString()}</p>
                        </div>
                      ) : (
                        <p className="text-[12px] text-muted-foreground mb-3">Set a savings goal to track your progress toward something meaningful.</p>
                      )}
                      <button onClick={() => onNavigateToTab('goals')} className="w-full py-2.5 rounded-xl bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/70 transition-colors">
                        {primaryGoal ? 'View Goals' : 'Create a Goal'} →
                      </button>
                    </CardContent>
                  </Card>
                </DashReorderCard>
              )

            case 'lending':
              return (
                <DashReorderCard key="lending" cardId="lending">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Lending</p>
                          <h3 className="text-2xl font-bold text-foreground">{activeLendingCount > 0 ? `${activeLendingCount} active` : 'None'}</h3>
                          <p className="text-xs text-muted-foreground mt-1">{activeLendingCount > 0 ? 'Track money lent & borrowed' : 'Track IOUs with friends & family'}</p>
                        </div>
                        <Heart className="w-6 h-6 text-pink-500" />
                      </div>
                      <button onClick={() => onNavigateToTab('lending')} className="w-full mt-2 py-2.5 rounded-xl bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/70 transition-colors">
                        {activeLendingCount > 0 ? 'View Details' : 'Add Lending'} →
                      </button>
                    </CardContent>
                  </Card>
                </DashReorderCard>
              )

            case 'recent':
              return null // Recent transactions already shown above in the main feed

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
      </div>{/* end content wrapper */}
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
            <svg viewBox="0 0 120 120" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
              {/* Background track */}
              <circle cx="60" cy="60" r="50" stroke="#e8e8ed" strokeWidth="10" fill="none" />
              {/* Progress arc */}
              <circle
                cx="60" cy="60" r="50"
                stroke="#6d5efc"
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${(healthScore.score / 100) * 2 * Math.PI * 50} ${2 * Math.PI * 50}`}
                className="transition-all duration-700"
              />
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
                  onClick={(e) => { e.stopPropagation(); onNavigate('analytics') }}
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

// Dashboard reorderable card — long-press to drag (works on mobile + desktop)
function DashReorderCard({ cardId, children }: { cardId: DashCardId; children: React.ReactNode }) {
  const [isDragActive, setIsDragActive] = React.useState(false)
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null)
  const itemRef = React.useRef<HTMLDivElement>(null)

  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => {
      setIsDragActive(true)
      // Haptic feedback on supported devices
      if (navigator.vibrate) navigator.vibrate(30)
    }, 400)
  }

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const endDrag = () => {
    cancelLongPress()
    setIsDragActive(false)
  }

  return (
    <Reorder.Item
      value={cardId}
      dragListener={isDragActive}
      className={isDragActive ? "cursor-grabbing z-50 relative" : ""}
      style={{ touchAction: isDragActive ? 'none' : 'pan-y' }}
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      onPointerDown={startLongPress}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDragEnd={endDrag}
      ref={itemRef}
    >
      {isDragActive && (
        <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-ring/40 pointer-events-none z-10" />
      )}
      {children}
    </Reorder.Item>
  )
}