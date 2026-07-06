'use client'

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Transaction } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, cn } from '@/lib/utils'
import { AnalyticsService } from '@/services/AnalyticsService'
import { TrendingUp, AlertCircle, TrendingDown, BarChart3, Zap, Target } from 'lucide-react'
import { motion } from 'framer-motion'
import { TabType } from '@/components/layout/bottom-nav'

interface SpendingInsightsProps {
  onNavigateToTab?: (tab: TabType) => void
}

export function SpendingInsights({ onNavigateToTab }: SpendingInsightsProps) {
  const transactions = useLiveQuery(() => db.transactions.toArray()) || []

  // Analyze spending
  const categorySpending = React.useMemo(() => {
    return AnalyticsService.getSpendingByCategory(transactions)
  }, [transactions])

  const monthlyComparison = React.useMemo(() => {
    return AnalyticsService.getMonthlyComparison(transactions)
  }, [transactions])

  const anomalies = React.useMemo(() => {
    return AnalyticsService.detectAnomalies(transactions)
  }, [transactions])

  const topCategories = React.useMemo(() => {
    return AnalyticsService.getTopCategories(transactions, 5)
  }, [transactions])

  const velocity = React.useMemo(() => {
    return AnalyticsService.getSpendingVelocity(transactions)
  }, [transactions])

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
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
      {/* === HEADING === */}
      <motion.div variants={item}>
        <h1 className="text-2xl font-bold text-foreground">Spending Insights</h1>
        <p className="text-xs text-muted-foreground mt-1">Understand your spending patterns</p>
      </motion.div>

      {/* === MONTHLY COMPARISON === */}
      <motion.div variants={item}>
        <Card className="bg-gradient-to-br from-card to-secondary/20">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Month Comparison</p>
                <h3 className="text-2xl font-bold text-foreground">{formatCurrency(monthlyComparison.currentMonth)}</h3>
                <p className="text-xs text-muted-foreground mt-1">This month so far</p>
              </div>
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-secondary/50 border border-border/50">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Last Month</p>
                <p className="text-base font-bold text-foreground mt-1">{formatCurrency(monthlyComparison.previousMonth)}</p>
              </div>
              <div className={cn(
                "p-3 rounded-xl border border-border/50",
                monthlyComparison.changePercent < 0 
                  ? "bg-emerald-500/10" 
                  : "bg-red-500/10"
              )}>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase">Change</p>
                <p className={cn(
                  "text-base font-bold mt-1",
                  monthlyComparison.changePercent < 0 
                    ? "text-emerald-600 dark:text-emerald-400" 
                    : "text-red-600 dark:text-red-400"
                )}>
                  {monthlyComparison.changePercent < 0 ? '📉' : '📈'} {Math.abs(monthlyComparison.changePercent)}%
                </p>
              </div>
            </div>

            {/* Velocity Indicator */}
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-semibold">Spending Velocity</p>
                <span className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold",
                  velocity === 'high' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
                  velocity === 'low' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                  'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                )}>
                  {velocity === 'high' && <TrendingUp className="w-3 h-3" />}
                  {velocity === 'low' && <TrendingDown className="w-3 h-3" />}
                  {velocity === 'normal' && <Zap className="w-3 h-3" />}
                  {velocity === 'high' ? 'High' : velocity === 'low' ? 'Low' : 'Normal'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* === TOP CATEGORIES === */}
      {topCategories.length > 0 && (
        <motion.div variants={item}>
          <Card className="bg-gradient-to-br from-card to-secondary/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Categories</p>
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>

              <div className="space-y-3">
                {topCategories.map((cat, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-foreground">{cat.category}</span>
                      <span className="text-sm font-bold text-primary">{formatCurrency(cat.amount)}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${cat.percentage}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-right">{Math.round(cat.percentage)}% of total</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* === ANOMALIES/ALERTS === */}
      {anomalies.length > 0 && (
        <motion.div variants={item}>
          <Card className="bg-gradient-to-br from-amber-950/20 to-amber-900/10 border-amber-500/30">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Spending Alerts</p>
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>

              <div className="space-y-3">
                {anomalies.map((anomaly, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-background/50 border border-amber-500/20">
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-sm font-semibold text-foreground">{anomaly.category}</span>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold",
                        anomaly.severity === 'severe' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
                        anomaly.severity === 'moderate' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                        'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                      )}>
                        {anomaly.deviation > 0 ? '+' : ''}{anomaly.deviation}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Spent {formatCurrency(anomaly.amount)} vs. average {formatCurrency(anomaly.averageAmount)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* === INSIGHTS === */}
      <motion.div variants={item}>
        <Card className="bg-gradient-to-br from-indigo-950/20 to-indigo-900/10 border-indigo-500/30">
          <CardContent className="pt-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Insights</p>

            <div className="space-y-2">
              {monthlyComparison.changePercent > 10 && (
                <div className="flex gap-2">
                  <span className="text-lg">📈</span>
                  <p className="text-xs text-foreground/90">Spending is up {Math.round(monthlyComparison.changePercent)}% this month</p>
                </div>
              )}

              {monthlyComparison.changePercent < -10 && (
                <div className="flex gap-2">
                  <span className="text-lg">📉</span>
                  <p className="text-xs text-foreground/90">You're spending {Math.abs(Math.round(monthlyComparison.changePercent))}% less this month!</p>
                </div>
              )}

              {topCategories.length > 0 && topCategories[0].percentage > 40 && (
                <div className="flex gap-2">
                  <span className="text-lg">💡</span>
                  <p className="text-xs text-foreground/90">{topCategories[0].category} accounts for {Math.round(topCategories[0].percentage)}% of spending</p>
                </div>
              )}

              {velocity === 'high' && (
                <div className="flex gap-2">
                  <span className="text-lg">⚡</span>
                  <p className="text-xs text-foreground/90">High spending velocity - consider cutting back</p>
                </div>
              )}

              {anomalies.length > 0 && anomalies[0].severity === 'severe' && (
                <div className="flex gap-2">
                  <span className="text-lg">🚨</span>
                  <p className="text-xs text-foreground/90">Unusual spike in {anomalies[0].category}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Empty State */}
      {categorySpending.length === 0 && (
        <motion.div variants={item}>
          <div className="flex flex-col items-center justify-center p-8 rounded-3xl bg-secondary/30 border border-dashed border-border/60 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground/60 mb-3" />
            <p className="text-xs font-semibold text-muted-foreground">No spending data yet</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">Add transactions to see spending insights</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
