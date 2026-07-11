'use client'

import React, { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { TrendingUp, Award, ArrowUpRight, ArrowDownRight, Check } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

/**
 * Phase 2.12: Net Worth Timeline Chart
 * Shows net worth progression over time from account balance history + assets
 */
export function NetWorthTimeline() {
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const assets = useLiveQuery(() => db.assets.toArray()) ?? []
  const investments = useLiveQuery(() => db.investments.toArray()) ?? []
  const lending = useLiveQuery(() => db.lending.toArray()) ?? []

  const safeAccounts = Array.isArray(accounts) ? accounts : []
  const safeAssets = Array.isArray(assets) ? assets : []
  const safeInvestments = Array.isArray(investments) ? investments : []
  const safeLending = Array.isArray(lending) ? lending : []

  // Current net worth
  const currentNetWorth = useMemo(() => {
    const accountsTotal = safeAccounts.reduce((sum, a) => sum + (a.balance || 0), 0)
    const investTotal = safeInvestments.reduce((sum, i) => sum + (i.currentValue || 0), 0)
    const lentOut = safeLending.filter(l => l.type === 'lent' && l.status === 'active').reduce((s, l) => s + l.amount, 0)
    const borrowed = safeLending.filter(l => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + l.amount, 0)
    return accountsTotal + investTotal + lentOut - borrowed
  }, [safeAccounts, safeInvestments, safeLending])

  // Build timeline data from asset valuation history
  const chartData = useMemo(() => {
    const dateMap: Record<string, number> = {}

    // Gather all valuation dates from assets
    safeAssets.forEach(asset => {
      asset.valuationHistory.forEach(vh => {
        if (!dateMap[vh.date]) dateMap[vh.date] = 0
        dateMap[vh.date] += vh.value
      })
    })

    // Add account balance histories if available
    safeAccounts.forEach(acc => {
      if (acc.balanceHistory) {
        acc.balanceHistory.forEach(bh => {
          if (!dateMap[bh.date]) dateMap[bh.date] = 0
          dateMap[bh.date] += bh.balance
        })
      }
    })

    // If no history data, create a simple 2-point chart with current value
    if (Object.keys(dateMap).length === 0) {
      const today = new Date().toISOString().split('T')[0]
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      return [
        { date: monthAgo, label: 'Start', value: currentNetWorth * 0.95 },
        { date: today, label: 'Today', value: currentNetWorth },
      ]
    }

    const sorted = Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => {
        const d = new Date(date + 'T00:00:00')
        return {
          date,
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: Math.round(value),
        }
      })

    return sorted
  }, [safeAssets, safeAccounts, currentNetWorth])

  // Milestones
  const milestones = useMemo(() => {
    const thresholds = [100000, 500000, 1000000, 2500000, 5000000, 10000000]
    return thresholds
      .filter(t => currentNetWorth >= t)
      .map(t => {
        const label = t >= 10000000 ? `₹${t / 10000000} Cr` :
                      t >= 100000 ? `₹${t / 100000} L` :
                      `₹${t / 1000}K`
        return { value: t, label: `Crossed ${label}` }
      })
  }, [currentNetWorth])

  // Growth calculation
  const growth = useMemo(() => {
    if (chartData.length < 2) return { amount: 0, percent: 0 }
    const first = chartData[0].value
    const last = chartData[chartData.length - 1].value
    const amount = last - first
    const percent = first > 0 ? ((last - first) / first) * 100 : 0
    return { amount: Math.round(amount), percent: Math.round(percent * 10) / 10 }
  }, [chartData])

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Net Worth Timeline</h1>
        <p className="text-xs text-muted-foreground">Track your wealth over time</p>
      </div>

      {/* Current Value Card */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20"
      >
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Current Net Worth</p>
        <p className="text-3xl font-bold text-foreground mt-1">{formatCurrency(currentNetWorth)}</p>
        {growth.amount !== 0 && (
          <div className={cn("flex items-center gap-1 mt-2", growth.amount >= 0 ? "text-emerald-500" : "text-red-500")}>
            {growth.amount >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            <span className="text-xs font-bold">{formatCurrency(Math.abs(growth.amount))} ({growth.percent}%)</span>
            <span className="text-[10px] text-muted-foreground ml-1">all time</span>
          </div>
        )}
      </motion.div>

      {/* Chart */}
      {chartData.length > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="p-4 rounded-2xl bg-card border border-border/50"
        >
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Wealth Progression</p>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="label" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15, 15, 17, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: '#fff',
                  }}
                  formatter={(value: number) => [formatCurrency(value), 'Net Worth']}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* Milestones */}
      {milestones.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Milestones Reached</p>
          <div className="space-y-2">
            {milestones.map((m, i) => (
              <motion.div
                key={m.value}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20"
              >
                <Award className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <span className="text-xs font-bold text-foreground">{m.label}</span>
                <Check className="w-3.5 h-3.5 text-emerald-500 ml-auto" />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Breakdown */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Composition</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl bg-card border border-border/50">
            <p className="text-[9px] text-muted-foreground font-bold uppercase">Accounts</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{formatCurrency(safeAccounts.reduce((s, a) => s + a.balance, 0))}</p>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border/50">
            <p className="text-[9px] text-muted-foreground font-bold uppercase">Investments</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{formatCurrency(safeInvestments.reduce((s, i) => s + i.currentValue, 0))}</p>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border/50">
            <p className="text-[9px] text-muted-foreground font-bold uppercase">Lent Out</p>
            <p className="text-sm font-bold text-emerald-500 mt-0.5">{formatCurrency(safeLending.filter(l => l.type === 'lent' && l.status === 'active').reduce((s, l) => s + l.amount, 0))}</p>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border/50">
            <p className="text-[9px] text-muted-foreground font-bold uppercase">Borrowed</p>
            <p className="text-sm font-bold text-red-500 mt-0.5">{formatCurrency(safeLending.filter(l => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + l.amount, 0))}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
