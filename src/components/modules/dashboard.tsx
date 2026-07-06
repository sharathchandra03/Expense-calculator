'use client'

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Transaction, Lending, Asset, Goal, Bill } from '@/db/schema'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { formatCurrency, cn } from '@/lib/utils'
import { ArrowUpRight, ArrowDownRight, Sparkles, Target, Calendar, ArrowRight, ShieldCheck, AlertCircle, ShoppingBag, Plus, Zap, TrendingUp, DollarSign, Heart, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { HealthScoreService, HealthScoreBreakdown } from '@/services/HealthScoreService'

interface DashboardProps {
  onNavigateToTab: (tab: 'ledger' | 'assets' | 'forecast' | 'settings') => void;
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

  // Ensure arrays are never undefined
  const safeTransactions = Array.isArray(transactions) ? transactions : []
  const safeAllTransactions = Array.isArray(allTransactions) ? allTransactions : []
  const safeAssets = Array.isArray(assets) ? assets : []
  const safeLending = Array.isArray(lending) ? lending : []
  const safeGoals = Array.isArray(goals) ? goals : []
  const safeBills = Array.isArray(bills) ? bills : []
  const safeInvestments = Array.isArray(investments) ? investments : []

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

  // Net Worth (assets + lending net + tracked investments)
  const netWorth = metrics.netWorth + investmentsValue

  // Spending trend
  const spendingTrend = React.useMemo(() => {
    return HealthScoreService.getMonthlySpendingTrend(safeAllTransactions)
  }, [safeAllTransactions])

  // Cash analysis
  const { liquidAssets, monthlyRecurring, monthlyExpenses } = metrics
  // Invested assets include asset-table holdings + tracked investments portfolio
  const investedAssets = metrics.investedAssets + investmentsValue
  const availableCash = HealthScoreService.getAvailableCash(liquidAssets, monthlyRecurring)
  const isLowCash = HealthScoreService.isLowCash(liquidAssets, monthlyExpenses)
  const cashStatus = liquidAssets > monthlyRecurring ? 'healthy' : liquidAssets > monthlyRecurring * 0.5 ? 'warning' : 'critical'

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

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  }

  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } },
  }

  return (
    <motion.div 
      className="flex flex-col space-y-4 pb-28"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Background Mesh Orbs */}
      <div className="absolute top-0 left-0 right-0 h-64 -z-10 bg-radial from-primary/10 via-transparent to-transparent opacity-60 dark:opacity-40 blur-3xl pointer-events-none" />

      {/* === SECTION 1: Net Worth Display (MOVED TO TOP) === */}
      <motion.div variants={item}>
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-48 h-48 rounded-full bg-primary/10 blur-3xl" />
          <CardContent className="pt-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Net Worth</p>
            <h2 className="text-5xl font-bold text-foreground mb-6">{formatCurrency(netWorth)}</h2>
            
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
      </motion.div>

      {/* === SECTION 2: Financial Health Score (MOVED TO 2ND) === */}
      <motion.div variants={item}>
        <Card className="bg-gradient-to-br from-card via-card to-secondary/40 relative overflow-hidden border-2 border-primary/30">
          <div className="absolute -right-20 -top-20 w-48 h-48 rounded-full bg-primary/8 blur-3xl" />
          
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Financial Health</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-foreground">{healthScore.score}</span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
              </div>

              {/* Health Score Circle Gauge */}
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle cx="60" cy="60" r="54" className="stroke-muted/30" strokeWidth="8" fill="none" />
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    className="stroke-primary transition-all duration-700"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${(healthScore.score / 100) * 2 * Math.PI * 54} ${2 * Math.PI * 54}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl">{HealthScoreService.getHealthEmoji(healthScore.score)}</span>
                </div>
              </div>
            </div>

            {/* Trend Badge */}
            <div className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold mb-4",
              healthScore.trend === 'improving' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
              healthScore.trend === 'declining' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
              'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            )}>
              {healthScore.trend === 'improving' && <ArrowUpRight className="w-3.5 h-3.5" />}
              {healthScore.trend === 'declining' && <ArrowDownRight className="w-3.5 h-3.5" />}
              {healthScore.trend === 'stable' && <Zap className="w-3.5 h-3.5" />}
              <span className="capitalize">{healthScore.trend} this month</span>
            </div>

            {/* Insights */}
            <div className="space-y-2">
              {healthScore.insights.slice(0, 2).map((insight, idx) => (
                <p key={idx} className="text-xs text-muted-foreground/80 leading-relaxed">
                  {insight}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* === SECTION 3: Cash Position Clarity === */}
      <motion.div variants={item}>
        <Card className={cn(
          "relative overflow-hidden",
          cashStatus === 'healthy' ? 'bg-gradient-to-br from-emerald-950/20 to-emerald-900/10 border-emerald-500/30' :
          cashStatus === 'warning' ? 'bg-gradient-to-br from-amber-950/20 to-amber-900/10 border-amber-500/30' :
          'bg-gradient-to-br from-red-950/20 to-red-900/10 border-red-500/30'
        )}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Available Cash</p>
                <h3 className="text-3xl font-bold text-foreground">{formatCurrency(availableCash)}</h3>
                <p className={cn(
                  "text-xs font-medium mt-2",
                  cashStatus === 'healthy' ? 'text-emerald-600 dark:text-emerald-400' :
                  cashStatus === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                  'text-red-600 dark:text-red-400'
                )}>
                  {cashStatus === 'healthy' && '✓ Healthy cash position'}
                  {cashStatus === 'warning' && '⚠ Consider rebuilding cash'}
                  {cashStatus === 'critical' && '🚨 Low cash warning'}
                </p>
              </div>
              <DollarSign className={cn(
                "w-8 h-8",
                cashStatus === 'healthy' ? 'text-emerald-500' :
                cashStatus === 'warning' ? 'text-amber-500' :
                'text-red-500'
              )} />
            </div>

            <div className="space-y-2.5 mt-4 pt-4 border-t border-border/50">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Monthly Bills Due</span>
                <span className="font-semibold">{formatCurrency(monthlyRecurring)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Monthly Expenses (avg)</span>
                <span className="font-semibold">{formatCurrency(monthlyExpenses)}</span>
              </div>
              <div className="flex justify-between items-center text-xs pt-2 border-t border-border/30">
                <span className="text-muted-foreground font-semibold">Emergency Fund</span>
                <span className="font-bold">{Math.round((liquidAssets / monthlyExpenses) * 10) / 10} mo</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* === SECTION 4: This Month Overview === */}
      <motion.div variants={item}>
        <Card className="bg-gradient-to-br from-card to-secondary/20">
          <CardContent className="pt-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">This Month</p>
            
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Income</span>
                  <span className="text-sm font-bold text-emerald-500">+{formatCurrency(metrics.monthlyIncome)}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: '100%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Spending</span>
                  <span className={cn(
                    "text-sm font-bold",
                    metrics.monthlyExpenses > metrics.monthlyIncome * 0.8 ? 'text-red-500' : 'text-foreground'
                  )}>
                    -{formatCurrency(metrics.monthlyExpenses)}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all",
                      metrics.monthlyExpenses > metrics.monthlyIncome * 0.8 ? 'bg-red-500' : 'bg-foreground/60'
                    )}
                    style={{ width: `${Math.min(100, (metrics.monthlyExpenses / metrics.monthlyIncome) * 100)}%` }} 
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Savings This Month</span>
                  <span className={cn(
                    "text-lg font-bold",
                    (metrics.monthlyIncome - metrics.monthlyExpenses) > 0 ? 'text-emerald-500' : 'text-red-500'
                  )}>
                    {(metrics.monthlyIncome - metrics.monthlyExpenses) > 0 ? '+' : '-'}{formatCurrency(Math.abs(metrics.monthlyIncome - metrics.monthlyExpenses))}
                  </span>
                </div>
              </div>

              {/* Trend Comparison */}
              {spendingTrend.previous > 0 && (
                <div className="pt-2 mt-2 border-t border-border/50">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {spendingTrend.changePercent > 0 ? '📈' : '📉'} 
                    <span>{Math.abs(Math.round(spendingTrend.changePercent))}% {spendingTrend.changePercent > 0 ? 'more' : 'less'} than last month</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* === SECTION 5: Bills & Obligations === */}
      {upcomingBills.length > 0 && (
        <motion.div variants={item}>
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
                      <p className="text-[10px] text-muted-foreground">
                        Due {new Date(bill.dueDate).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(bill.amount)}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onNavigateToTab('forecast')}
                className="w-full mt-3 py-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold hover:bg-amber-500/30 transition-colors"
              >
                View All Bills →
              </button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* === SECTION 6: Goals === */}
      {primaryGoal && (
        <motion.div variants={item}>
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
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${goalProgress}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Target: {new Date(primaryGoal.targetDate).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* === SECTION 7: Lending Summary === */}
      {activeLendingCount > 0 && (
        <motion.div variants={item}>
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

              <button
                onClick={() => onNavigateToTab('assets')}
                className="w-full mt-4 py-2 rounded-lg bg-pink-500/20 text-pink-600 dark:text-pink-400 text-xs font-semibold hover:bg-pink-500/30 transition-colors"
              >
                View Lending Details →
              </button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* === SECTION 8: Recent Transactions === */}
      {safeTransactions.length > 0 && (
        <motion.div variants={item}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold tracking-tight text-foreground">Recent Activity</h3>
            <button 
              onClick={() => onNavigateToTab('ledger')}
              className="text-xs text-primary font-semibold flex items-center gap-1"
            >
              See all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2">
            {safeTransactions.map((tx, idx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                    {getCategoryIcon(tx.category, tx.type)}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">{tx.description}</p>
                    <p className="text-[10px] text-muted-foreground">{tx.category}</p>
                  </div>
                </div>
                <p className={cn(
                  "text-xs font-bold",
                  tx.type === 'income' ? "text-emerald-500" : "text-foreground"
                )}>
                  {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {safeTransactions.length === 0 && (
        <motion.div variants={item}>
          <div className="flex flex-col items-center justify-center p-8 rounded-3xl bg-secondary/30 border border-dashed border-border/60 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground/60 mb-3" />
            <p className="text-xs font-semibold text-muted-foreground">Start tracking your finances</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">Add your first transaction using the + button</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
