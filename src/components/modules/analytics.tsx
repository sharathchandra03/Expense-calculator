'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { motion, Reorder, useDragControls } from 'framer-motion'
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Wallet, Target, Heart, Landmark, PieChart, BarChart3, GripVertical } from 'lucide-react'

type Period = 'daily' | 'monthly' | 'quarterly' | 'yearly'
type AnalyticsCardId = 'summary' | 'barchart' | 'networth' | 'expenses' | 'income' | 'investments' | 'lending' | 'goals' | 'bills'

const DEFAULT_ANALYTICS_ORDER: AnalyticsCardId[] = ['summary', 'barchart', 'networth', 'expenses', 'income', 'investments', 'lending', 'goals', 'bills']

function getAnalyticsStoredOrder(): AnalyticsCardId[] {
  if (typeof window === 'undefined') return DEFAULT_ANALYTICS_ORDER
  try {
    const stored = localStorage.getItem('pennyflow-analytics-order')
    if (stored) return JSON.parse(stored)
  } catch {}
  return DEFAULT_ANALYTICS_ORDER
}

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16']

function getPeriodRange(period: Period): { start: Date; end: Date; label: string } {
  const now = new Date()
  switch (period) {
    case 'daily':
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return { start: today, end: now, label: now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) }
    case 'monthly':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }
    case 'quarterly':
      const qMonth = Math.floor(now.getMonth() / 3) * 3
      return { start: new Date(now.getFullYear(), qMonth, 1), end: now, label: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}` }
    case 'yearly':
      return { start: new Date(now.getFullYear(), 0, 1), end: now, label: `${now.getFullYear()}` }
  }
}

export function Analytics() {
  const [period, setPeriod] = useState<Period>('monthly')
  const [analyticsOrder, setAnalyticsOrder] = useState<AnalyticsCardId[]>(getAnalyticsStoredOrder)

  const handleAnalyticsReorder = (newOrder: AnalyticsCardId[]) => {
    setAnalyticsOrder(newOrder)
    try { localStorage.setItem('pennyflow-analytics-order', JSON.stringify(newOrder)) } catch {}
  }

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const lending = useLiveQuery(() => db.lending.toArray()) ?? []
  const assets = useLiveQuery(() => db.assets.toArray()) ?? []
  const goals = useLiveQuery(() => db.goals.toArray()) ?? []
  const investments = useLiveQuery(() => db.investments.toArray()) ?? []
  const bills = useLiveQuery(() => db.bills.toArray()) ?? []

  const safeTx = Array.isArray(transactions) ? transactions : []
  const safeLending = Array.isArray(lending) ? lending : []
  const safeAssets = Array.isArray(assets) ? assets : []
  const safeGoals = Array.isArray(goals) ? goals : []
  const safeInvestments = Array.isArray(investments) ? investments : []
  const safeBills = Array.isArray(bills) ? bills : []

  const { start, label: periodLabel } = getPeriodRange(period)

  // Filtered transactions for selected period
  const periodTx = React.useMemo(() => {
    const startTime = start.getTime()
    return safeTx.filter(tx => new Date(tx.date).getTime() >= startTime)
  }, [safeTx, start])

  // Income & Expense breakdown
  const analysis = React.useMemo(() => {
    const income = periodTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = periodTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const savings = income - expense
    const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0

    // Category breakdown for expenses
    const expCatMap: Record<string, number> = {}
    periodTx.filter(t => t.type === 'expense').forEach(t => {
      expCatMap[t.category] = (expCatMap[t.category] || 0) + t.amount
    })
    const expenseCategories = Object.entries(expCatMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    // Category breakdown for income
    const incCatMap: Record<string, number> = {}
    periodTx.filter(t => t.type === 'income').forEach(t => {
      incCatMap[t.category] = (incCatMap[t.category] || 0) + t.amount
    })
    const incomeCategories = Object.entries(incCatMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    return { income, expense, savings, savingsRate, expenseCategories, incomeCategories }
  }, [periodTx])

  // Investment analysis
  const investmentAnalysis = React.useMemo(() => {
    const totalInvested = safeInvestments.reduce((s, inv) => s + (inv.buyPrice * inv.quantity), 0)
    const currentValue = safeInvestments.reduce((s, inv) => s + (inv.currentValue || 0), 0)
    const assetEquity = safeAssets.reduce((s, a) => s + a.balance, 0)
    const gainLoss = currentValue - totalInvested
    const returnPct = totalInvested > 0 ? Math.round((gainLoss / totalInvested) * 100) : 0
    return { totalInvested, currentValue, assetEquity, gainLoss, returnPct }
  }, [safeInvestments, safeAssets])

  // Lending analysis
  const lendingAnalysis = React.useMemo(() => {
    const activeLent = safeLending.filter(l => l.type === 'lent' && l.status === 'active')
    const activeBorrowed = safeLending.filter(l => l.type === 'borrowed' && l.status === 'active')
    const totalLent = activeLent.reduce((s, l) => s + l.amount, 0)
    const totalBorrowed = activeBorrowed.reduce((s, l) => s + l.amount, 0)
    const netLending = totalLent - totalBorrowed
    return { totalLent, totalBorrowed, netLending, lentCount: activeLent.length, borrowedCount: activeBorrowed.length }
  }, [safeLending])

  // Goals analysis
  const goalsAnalysis = React.useMemo(() => {
    const totalTarget = safeGoals.reduce((s, g) => s + g.targetAmount, 0)
    const totalSaved = safeGoals.reduce((s, g) => s + g.currentAmount, 0)
    const overallProgress = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0
    const activeGoals = safeGoals.length
    return { totalTarget, totalSaved, overallProgress, activeGoals }
  }, [safeGoals])

  // Bills analysis
  const billsAnalysis = React.useMemo(() => {
    const unpaidBills = safeBills.filter(b => !b.isPaid)
    const totalUnpaid = unpaidBills.reduce((s, b) => s + b.amount, 0)
    const paidThisPeriod = safeBills.filter(b => b.isPaid).length
    return { totalUnpaid, unpaidCount: unpaidBills.length, paidThisPeriod }
  }, [safeBills])

  // Monthly bar chart data (last 6 months)
  const monthlyBarData = React.useMemo(() => {
    const months: { month: string; income: number; expense: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      const monthTx = safeTx.filter(tx => {
        const txd = new Date(tx.date)
        return txd >= d && txd <= monthEnd
      })
      const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      months.push({
        month: d.toLocaleString('en-US', { month: 'short' }),
        income,
        expense,
      })
    }
    return months
  }, [safeTx])

  // Net worth composition for pie chart
  const netWorthComposition = React.useMemo(() => {
    const data: { name: string; value: number }[] = []
    const cash = safeAssets.filter(a => a.type === 'cash' || a.type === 'bank').reduce((s, a) => s + a.balance, 0)
    const stocks = safeAssets.filter(a => a.type === 'stock').reduce((s, a) => s + a.balance, 0) + safeInvestments.reduce((s, i) => s + (i.currentValue || 0), 0)
    const crypto = safeAssets.filter(a => a.type === 'crypto').reduce((s, a) => s + a.balance, 0)
    const realEstate = safeAssets.filter(a => a.type === 'real_estate').reduce((s, a) => s + a.balance, 0)
    const gold = safeAssets.filter(a => a.type === 'gold').reduce((s, a) => s + a.balance, 0)

    if (cash > 0) data.push({ name: 'Cash & Bank', value: cash })
    if (stocks > 0) data.push({ name: 'Stocks & Funds', value: stocks })
    if (crypto > 0) data.push({ name: 'Crypto', value: crypto })
    if (realEstate > 0) data.push({ name: 'Real Estate', value: realEstate })
    if (gold > 0) data.push({ name: 'Gold', value: gold })
    if (lendingAnalysis.totalLent > 0) data.push({ name: 'Lent Out', value: lendingAnalysis.totalLent })

    return data
  }, [safeAssets, safeInvestments, lendingAnalysis.totalLent])

  const totalNetWorth = netWorthComposition.reduce((s, d) => s + d.value, 0)

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Analytics</h1>
        <p className="text-xs text-muted-foreground">Complete financial analysis for {periodLabel}.</p>
      </div>

      {/* Period selector */}
      <div className="flex gap-1 p-1 rounded-full bg-secondary/60 w-full max-w-md mx-auto overflow-x-auto">
        {(['daily', 'monthly', 'quarterly', 'yearly'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'flex-1 px-3 py-1.5 rounded-full text-[11px] font-semibold capitalize transition-all whitespace-nowrap',
              period === p ? 'bg-foreground text-background' : 'text-muted-foreground'
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Income vs Expense Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4">
          <ArrowUpRight className="w-5 h-5 text-emerald-500 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Income</p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatCurrency(analysis.income)}</p>
        </div>
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4">
          <ArrowDownRight className="w-5 h-5 text-red-500 mb-2" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Expenses</p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-0.5">{formatCurrency(analysis.expense)}</p>
        </div>
      </div>

      {/* Savings rate bar */}
      <div className="rounded-2xl bg-card border border-border/50 p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold">Net Savings</span>
          <span className={cn("text-sm font-bold", analysis.savings >= 0 ? 'text-emerald-500' : 'text-red-500')}>
            {analysis.savings >= 0 ? '+' : ''}{formatCurrency(analysis.savings)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", analysis.savings >= 0 ? 'bg-emerald-500' : 'bg-red-500')}
            style={{ width: `${Math.min(100, Math.abs(analysis.savingsRate))}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">{analysis.savingsRate}% savings rate</p>
      </div>

      {/* Income vs Expense Bar Chart (last 6 months) */}
      {monthlyBarData.some(m => m.income > 0 || m.expense > 0) && (
        <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold">Income vs Expense (6 months)</h3>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyBarData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" fontSize={10} stroke="#888" tickLine={false} axisLine={false} />
                <YAxis fontSize={9} stroke="#888" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                <Tooltip
                  contentStyle={{ background: 'rgba(15,15,17,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name === 'income' ? 'Income' : 'Expense']}
                />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-5 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span className="text-muted-foreground">Income</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
              <span className="text-muted-foreground">Expense</span>
            </div>
          </div>
        </div>
      )}

      {/* Net Worth Composition Pie */}
      {netWorthComposition.length > 0 && (
        <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold">Net Worth Composition</h3>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie data={netWorthComposition} cx="50%" cy="50%" innerRadius={40} outerRadius={72} paddingAngle={3} dataKey="value" animationDuration={600}>
                  {netWorthComposition.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'rgba(15,15,17,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
              </RechartsPie>
            </ResponsiveContainer>
          </div>
          <div className="text-center -mt-1">
            <p className="text-[10px] text-muted-foreground uppercase">Total Net Worth</p>
            <p className="text-lg font-bold">{formatCurrency(totalNetWorth)}</p>
          </div>
          <div className="space-y-2 pt-2 border-t border-border/40">
            {netWorthComposition.map((item, idx) => {
              const pct = totalNetWorth > 0 ? Math.round((item.value / totalNetWorth) * 100) : 0
              return (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                    <span className="text-xs font-medium">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{pct}%</span>
                    <span className="text-xs font-semibold">{formatCurrency(item.value)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Expense Breakdown */}
      {analysis.expenseCategories.length > 0 && (
        <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowDownRight className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold">Expense Breakdown</h3>
          </div>
          <div className="space-y-2.5">
            {analysis.expenseCategories.map((cat, idx) => {
              const pct = analysis.expense > 0 ? Math.round((cat.value / analysis.expense) * 100) : 0
              return (
                <div key={cat.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                      <span className="text-xs font-medium">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{pct}%</span>
                      <span className="text-xs font-semibold">{formatCurrency(cat.value)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden ml-4.5">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Income Sources */}
      {analysis.incomeCategories.length > 0 && (
        <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold">Income Sources</h3>
          </div>
          <div className="space-y-2.5">
            {analysis.incomeCategories.map((cat, idx) => {
              const pct = analysis.income > 0 ? Math.round((cat.value / analysis.income) * 100) : 0
              return (
                <div key={cat.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{pct}%</span>
                      <span className="text-xs font-semibold">{formatCurrency(cat.value)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Investment Summary */}
      <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-bold">Investments & Assets</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-secondary/40 border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase">Total Assets</p>
            <p className="text-sm font-bold mt-0.5">{formatCurrency(investmentAnalysis.assetEquity)}</p>
          </div>
          <div className="p-3 rounded-xl bg-secondary/40 border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase">Portfolio Value</p>
            <p className="text-sm font-bold mt-0.5">{formatCurrency(investmentAnalysis.currentValue)}</p>
          </div>
          <div className="p-3 rounded-xl bg-secondary/40 border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase">Total Invested</p>
            <p className="text-sm font-bold mt-0.5">{formatCurrency(investmentAnalysis.totalInvested)}</p>
          </div>
          <div className="p-3 rounded-xl bg-secondary/40 border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase">Gain/Loss</p>
            <p className={cn("text-sm font-bold mt-0.5", investmentAnalysis.gainLoss >= 0 ? 'text-emerald-500' : 'text-red-500')}>
              {investmentAnalysis.gainLoss >= 0 ? '+' : ''}{formatCurrency(investmentAnalysis.gainLoss)} ({investmentAnalysis.returnPct}%)
            </p>
          </div>
        </div>
      </div>

      {/* Lending Summary */}
      <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-pink-500" />
          <h3 className="text-sm font-bold">Lending & Borrowing</h3>
        </div>
        <div className="space-y-2.5">
          <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
            <div>
              <p className="text-xs font-medium">Money Lent Out</p>
              <p className="text-[10px] text-muted-foreground">{lendingAnalysis.lentCount} active</p>
            </div>
            <p className="text-sm font-bold text-emerald-500">{formatCurrency(lendingAnalysis.totalLent)}</p>
          </div>
          <div className="flex justify-between items-center p-3 rounded-xl bg-red-500/5 border border-red-500/20">
            <div>
              <p className="text-xs font-medium">Money Borrowed</p>
              <p className="text-[10px] text-muted-foreground">{lendingAnalysis.borrowedCount} active</p>
            </div>
            <p className="text-sm font-bold text-red-500">{formatCurrency(lendingAnalysis.totalBorrowed)}</p>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border/40">
            <span className="text-xs font-semibold">Net Position</span>
            <span className={cn("text-sm font-bold", lendingAnalysis.netLending >= 0 ? 'text-emerald-500' : 'text-red-500')}>
              {lendingAnalysis.netLending >= 0 ? '+' : ''}{formatCurrency(lendingAnalysis.netLending)}
            </span>
          </div>
        </div>
      </div>

      {/* Goals Progress */}
      {safeGoals.length > 0 && (
        <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-bold">Goals Progress</h3>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-muted-foreground">{goalsAnalysis.activeGoals} active goal{goalsAnalysis.activeGoals !== 1 ? 's' : ''}</span>
            <span className="text-xs font-bold text-indigo-500">{goalsAnalysis.overallProgress}% overall</span>
          </div>
          <div className="h-2 rounded-full bg-secondary/60 overflow-hidden mb-3">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${goalsAnalysis.overallProgress}%` }} />
          </div>
          <div className="space-y-2.5">
            {safeGoals.map((goal) => {
              const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0
              return (
                <div key={goal.id} className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-semibold">{goal.title}</span>
                    <span className="text-[10px] font-bold text-indigo-500">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground">{formatCurrency(goal.currentAmount)}</span>
                    <span className="text-[10px] text-muted-foreground">{formatCurrency(goal.targetAmount)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bills Summary */}
      <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold">Bills & Obligations</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Unpaid Bills</p>
            <p className="text-lg font-bold text-amber-500 mt-0.5">{billsAnalysis.unpaidCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Amount Due</p>
            <p className="text-lg font-bold text-amber-500 mt-0.5">{formatCurrency(billsAnalysis.totalUnpaid)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
