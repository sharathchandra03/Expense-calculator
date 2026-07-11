'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { getCategoryConfig, CHART_COLORS } from '@/lib/category-icons'

/**
 * Graphic Statistics — Donut charts for expense & income breakdown
 * Category percentage bars with amounts
 */
export function GraphicStatistics() {
  const [monthOffset, setMonthOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'expenses' | 'income'>('expenses')

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const safeTx = Array.isArray(transactions) ? transactions : []

  // Target month
  const targetDate = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + monthOffset)
    return d
  }, [monthOffset])

  const monthLabel = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Filter transactions for the target month
  const monthTx = useMemo(() => {
    const month = targetDate.getMonth()
    const year = targetDate.getFullYear()
    return safeTx.filter(tx => {
      const d = new Date(tx.date)
      return d.getMonth() === month && d.getFullYear() === year
    })
  }, [safeTx, targetDate])

  // Expense breakdown
  const expenseData = useMemo(() => {
    const expenses = monthTx.filter(tx => tx.type === 'expense')
    const total = expenses.reduce((sum, tx) => sum + tx.amount, 0)
    const byCategory: Record<string, number> = {}

    expenses.forEach(tx => {
      const cat = tx.category || 'Other'
      byCategory[cat] = (byCategory[cat] || 0) + tx.amount
    })

    const sorted = Object.entries(byCategory)
      .map(([category, amount]) => {
        const config = getCategoryConfig(category)
        const pct = total > 0 ? (amount / total) * 100 : 0
        return { category, amount, pct, emoji: config.emoji, color: config.color, bg: config.bg }
      })
      .sort((a, b) => b.amount - a.amount)

    return { items: sorted, total }
  }, [monthTx])

  // Income breakdown
  const incomeData = useMemo(() => {
    const income = monthTx.filter(tx => tx.type === 'income')
    const total = income.reduce((sum, tx) => sum + tx.amount, 0)
    const byCategory: Record<string, number> = {}

    income.forEach(tx => {
      const cat = tx.category || 'Other'
      byCategory[cat] = (byCategory[cat] || 0) + tx.amount
    })

    const sorted = Object.entries(byCategory)
      .map(([category, amount]) => {
        const config = getCategoryConfig(category)
        const pct = total > 0 ? (amount / total) * 100 : 0
        return { category, amount, pct, emoji: config.emoji, color: config.color, bg: config.bg }
      })
      .sort((a, b) => b.amount - a.amount)

    return { items: sorted, total }
  }, [monthTx])

  const activeData = tab === 'expenses' ? expenseData : incomeData

  // Search filter
  const filteredItems = activeData.items.filter(item => {
    if (!search) return true
    return item.category.toLowerCase().includes(search.toLowerCase())
  })

  // Donut chart data
  const chartData = filteredItems.map((item, i) => ({
    name: item.category,
    value: item.amount,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  return (
    <div className="flex flex-col space-y-5 pb-28">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Statistics</h1>
        <p className="text-xs text-muted-foreground">Visual breakdown of your money flow</p>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between p-2 rounded-2xl bg-secondary/50 border border-border/30">
        <button onClick={() => setMonthOffset(monthOffset - 1)} className="p-2 rounded-xl hover:bg-secondary">
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <p className="text-sm font-bold text-foreground">{monthLabel}</p>
        <button onClick={() => setMonthOffset(monthOffset + 1)} disabled={monthOffset >= 0} className="p-2 rounded-xl hover:bg-secondary disabled:opacity-30">
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Monthly Totals */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-card border border-border/50">
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Expenses</p>
          <p className="text-xl font-bold text-red-500 mt-1">{formatCurrency(expenseData.total)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50">
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Income</p>
          <p className="text-xl font-bold text-emerald-500 mt-1">{formatCurrency(incomeData.total)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by amount or remark"
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/60"
        />
      </div>

      {/* Tab Switch */}
      <div className="flex p-1 bg-secondary rounded-2xl">
        <button
          onClick={() => setTab('expenses')}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all",
            tab === 'expenses' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          Expenses
        </button>
        <button
          onClick={() => setTab('income')}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all",
            tab === 'income' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          Income
        </button>
      </div>

      {/* Donut Chart */}
      {chartData.length > 0 && (
        <motion.div
          key={`${tab}-${monthOffset}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-center py-2"
        >
          <div className="relative w-48 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15, 15, 17, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: '#fff',
                  }}
                  formatter={(value: number) => [formatCurrency(value), '']}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-lg font-bold text-foreground">{formatCurrency(activeData.total)}</p>
              <p className="text-[9px] text-muted-foreground uppercase font-bold">{tab}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Legend + Category Bars */}
      <div className="space-y-2">
        {filteredItems.length > 0 ? filteredItems.map((item, i) => (
          <motion.div
            key={item.category}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40"
          >
            {/* Color dot + emoji */}
            <div className="flex items-center gap-2 w-28 flex-shrink-0">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="text-base">{item.emoji}</span>
              <span className="text-[11px] font-semibold text-foreground truncate">{item.category}</span>
            </div>

            {/* Progress bar */}
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${item.pct}%` }}
                transition={{ duration: 0.5, delay: i * 0.03 }}
                className="h-full rounded-full"
                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
              />
            </div>

            {/* Amount + percentage */}
            <div className="text-right flex-shrink-0 w-20">
              <p className="text-[11px] font-bold text-foreground">{formatCurrency(item.amount)}</p>
              <p className="text-[9px] text-muted-foreground">{item.pct.toFixed(1)}%</p>
            </div>
          </motion.div>
        )) : (
          <div className="text-center py-8 rounded-2xl bg-secondary/20 border border-dashed border-border/50">
            <p className="text-xs text-muted-foreground">No {tab} this month</p>
          </div>
        )}
      </div>
    </div>
  )
}
