'use client'

import React, { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { FinancialHealthService, FinancialHealthResult, MetricResult, MetricStatus } from '@/services/FinancialHealthService'
import { TrendingUp, TrendingDown, Minus, ChevronRight, Info, Sparkles, Shield, PieChart, Wallet, Target, CreditCard, Heart, BarChart3 } from 'lucide-react'

interface FinancialHealthProps {
  onNavigateToTab?: (tab: string) => void
}

export function FinancialHealthDetail({ onNavigateToTab }: FinancialHealthProps) {
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const lending = useLiveQuery(() => db.lending.toArray()) ?? []
  const assets = useLiveQuery(() => db.assets.toArray()) ?? []
  const bills = useLiveQuery(() => db.bills.toArray()) ?? []
  const budgets = useLiveQuery(() => db.budgets.toArray()) ?? []
  const goals = useLiveQuery(() => db.goals.toArray()) ?? []
  const investments = useLiveQuery(() => db.investments.toArray()) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []

  const health: FinancialHealthResult = useMemo(() => {
    return FinancialHealthService.calculate({
      transactions: Array.isArray(transactions) ? transactions : [],
      lending: Array.isArray(lending) ? lending : [],
      assets: Array.isArray(assets) ? assets : [],
      bills: Array.isArray(bills) ? bills : [],
      budgets: Array.isArray(budgets) ? budgets : [],
      goals: Array.isArray(goals) ? goals : [],
      investments: Array.isArray(investments) ? investments : [],
      accounts: Array.isArray(accounts) ? accounts : [],
    })
  }, [transactions, lending, assets, bills, budgets, goals, investments, accounts])

  const scoreColor = FinancialHealthService.getScoreColor(health.score)
  const scoreLabel = FinancialHealthService.getScoreLabel(health.score)

  return (
    <div className="flex flex-col space-y-5 pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Financial Health</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Your comprehensive financial wellness index.</p>
      </div>

      {/* Score Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-3xl p-6 shadow-card relative overflow-hidden"
      >
        <div className="absolute -right-16 -top-16 w-40 h-40 rounded-full opacity-20" style={{ background: `radial-gradient(circle, ${scoreColor}, transparent)` }} />

        <div className="flex items-center justify-between">
          {/* Score circle */}
          <div className="relative w-28 h-28 flex-shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="60" cy="60" r="48" stroke="var(--border)" strokeWidth="8" fill="none" />
              <motion.circle
                cx="60" cy="60" r="48"
                stroke={scoreColor}
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                initial={{ strokeDasharray: `0 ${2 * Math.PI * 48}` }}
                animate={{ strokeDasharray: `${(health.score / 100) * 2 * Math.PI * 48} ${2 * Math.PI * 48}` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                className="text-2xl font-bold text-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {health.hasData ? health.score : '—'}
              </motion.span>
              <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">/ 100</span>
            </div>
          </div>

          {/* Score info */}
          <div className="flex-1 ml-5">
            <p className="text-lg font-bold text-foreground" style={{ color: scoreColor }}>{health.hasData ? scoreLabel : 'No Data'}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              {health.trend === 'improving' && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
              {health.trend === 'declining' && <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
              {health.trend === 'stable' && <Minus className="w-3.5 h-3.5 text-amber-500" />}
              <span className="text-[11px] text-muted-foreground capitalize">{health.trend} this month</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              Last updated: {new Date(health.lastCalculated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Top Recommendation */}
      {health.topRecommendation && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-gradient-to-r from-primary/8 to-primary/3 border border-primary/20 rounded-2xl p-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-primary uppercase tracking-wider">Priority Action</p>
              <p className="text-[13px] font-medium text-foreground mt-1 leading-snug">{health.topRecommendation.message}</p>
              {health.topRecommendation.targetTab && onNavigateToTab && (
                <button
                  onClick={() => onNavigateToTab(health.topRecommendation!.targetTab!)}
                  className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  {health.topRecommendation.actionLabel}
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Metrics Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Score Breakdown</h3>
          <span className="text-[10px] text-muted-foreground">{health.metrics.filter(m => m.available).length} active metrics</span>
        </div>

        <div className="space-y-2">
          {health.metrics.map((metric, idx) => (
            <MetricCard key={metric.id} metric={metric} index={idx} />
          ))}
        </div>
      </motion.div>

      {/* How It Works */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-card"
      >
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-[13px] font-bold text-foreground">How It Works</h3>
        </div>
        <div className="space-y-2 text-[11px] text-muted-foreground leading-relaxed">
          <p>Your Financial Wellness Index is a weighted score from 0 to 100 based on your actual financial behaviour.</p>
          <p>Each metric is scored independently. If a category has no data (e.g., no investments), its weight is redistributed to the remaining categories — you're never penalized for missing data.</p>
          <p>The score updates automatically as you add transactions, set budgets, and manage your finances.</p>
        </div>

        {/* Weight breakdown */}
        <div className="pt-3 border-t border-border/50 space-y-1.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Weight Distribution</p>
          {health.metrics.filter(m => m.available).map(m => (
            <div key={m.id} className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{m.label}</span>
              <span className="text-[11px] font-semibold text-foreground">{Math.round(m.effectiveWeight)}%</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* All Recommendations */}
      {health.allRecommendations.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="space-y-3"
        >
          <h3 className="text-sm font-bold text-foreground">Improvement Areas</h3>
          <div className="space-y-2">
            {health.allRecommendations.slice(1).map((rec, idx) => (
              <div key={idx} className="bg-secondary/30 border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">{rec.metric}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{rec.message}</p>
                </div>
                {rec.targetTab && onNavigateToTab && (
                  <button
                    onClick={() => onNavigateToTab(rec.targetTab!)}
                    className="ml-3 flex-shrink-0 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    Fix →
                  </button>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ metric, index }: { metric: MetricResult; index: number }) {
  const icons: Record<string, React.ElementType> = {
    savingsRate: Wallet,
    cashFlowStability: BarChart3,
    budgetAdherence: Target,
    emergencyFund: Shield,
    debtHealth: CreditCard,
    investmentConsistency: PieChart,
    billDiscipline: Sparkles,
    lendingRecovery: Heart,
  }
  const Icon = icons[metric.id] || Wallet
  const statusColor = FinancialHealthService.getStatusColor(metric.status)

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * index }}
      className={cn(
        "bg-card border border-border rounded-xl p-3.5 shadow-card",
        !metric.available && "opacity-60"
      )}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${statusColor}15` }}>
          <Icon className="w-4 h-4" style={{ color: statusColor }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-foreground">{metric.label}</p>
            <div className="flex items-center gap-2">
              {metric.available && (
                <span className="text-[12px] font-bold" style={{ color: statusColor }}>{metric.score}</span>
              )}
              <StatusBadge status={metric.status} />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{metric.explanation}</p>

          {/* Progress bar */}
          {metric.available && (
            <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden mt-2">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: statusColor }}
                initial={{ width: 0 }}
                animate={{ width: `${metric.score}%` }}
                transition={{ duration: 0.8, delay: 0.1 * index, ease: 'easeOut' }}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MetricStatus }) {
  const labels: Record<MetricStatus, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    needs_improvement: 'Needs Work',
    poor: 'Poor',
    not_configured: 'Not Set',
  }

  const colors: Record<MetricStatus, string> = {
    excellent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    good: 'bg-green-500/10 text-green-600 dark:text-green-400',
    fair: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    needs_improvement: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    poor: 'bg-red-500/10 text-red-600 dark:text-red-400',
    not_configured: 'bg-secondary text-muted-foreground',
  }

  return (
    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide", colors[status])}>
      {labels[status]}
    </span>
  )
}
