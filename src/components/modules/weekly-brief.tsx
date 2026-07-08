'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, PiggyBank, Sparkles, Calendar, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight, PieChart, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

type ViewMode = 'overview' | 'calendar' | 'stats'

type CardId = 'insights' | 'spending' | 'bills' | 'goals'

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

const DEFAULT_CARD_ORDER: CardId[] = ['insights', 'spending', 'bills', 'goals']

function getStoredOrder(): CardId[] {
  if (typeof window === 'undefined') return DEFAULT_CARD_ORDER
  try {
    const stored = localStorage.getItem('pennyflow-overview-order')
    if (stored) return JSON.parse(stored)
  } catch {}
  return DEFAULT_CARD_ORDER
}

export function WeeklyBrief() {
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [selectedMonth, setSelectedMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [statsCategory, setStatsCategory] = useState<'expense' | 'income'>('expense')
  const [cardOrder, setCardOrder] = useState<CardId[]>(getStoredOrder)

  const handleReorder = (newOrder: CardId[]) => {
    setCardOrder(newOrder)
    try { localStorage.setItem('pennyflow-overview-order', JSON.stringify(newOrder)) } catch {}
  }

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const bills = useLiveQuery(() => db.bills.toArray()) ?? []
  const goals = useLiveQuery(() => db.goals.toArray()) ?? []

  const safeTransactions = Array.isArray(transactions) ? transactions : []
  const safeBills = Array.isArray(bills) ? bills : []
  const safeGoals = Array.isArray(goals) ? goals : []

  // Current month transactions
  const monthTransactions = React.useMemo(() => {
    const year = selectedMonth.getFullYear()
    const month = selectedMonth.getMonth()
    return safeTransactions.filter(tx => {
      const d = new Date(tx.date)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [safeTransactions, selectedMonth])

  // Monthly summary
  const monthSummary = React.useMemo(() => {
    const income = monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const savings = income - expense
    const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0
    return { income, expense, savings, savingsRate }
  }, [monthTransactions])

  // Category breakdown for pie chart
  const categoryData = React.useMemo(() => {
    const catMap: Record<string, number> = {}
    monthTransactions
      .filter(t => t.type === statsCategory)
      .forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount })
    return Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [monthTransactions, statsCategory])

  const totalForCategory = categoryData.reduce((s, c) => s + c.value, 0)

  // Calendar helpers
  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay()

  const dailyTotals = React.useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {}
    monthTransactions.forEach(tx => {
      if (!map[tx.date]) map[tx.date] = { income: 0, expense: 0 }
      if (tx.type === 'income') map[tx.date].income += tx.amount
      else map[tx.date].expense += tx.amount
    })
    return map
  }, [monthTransactions])

  const selectedDateTransactions = React.useMemo(() => {
    if (!selectedDate) return []
    return monthTransactions.filter(tx => tx.date === selectedDate)
  }, [monthTransactions, selectedDate])

  // Navigation
  const prevMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1))
    setSelectedDate(null)
  }
  const nextMonth = () => {
    setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1))
    setSelectedDate(null)
  }

  const monthLabel = selectedMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  // Insights generation
  const insights = React.useMemo(() => {
    const list: string[] = []
    if (monthSummary.income === 0 && monthSummary.expense === 0) {
      list.push('No activity recorded this month yet.')
    } else {
      if (monthSummary.savings > 0) {
        list.push(`You saved ${formatCurrency(monthSummary.savings)} - ${monthSummary.savingsRate}% of your income. Nice work.`)
      } else if (monthSummary.savings < 0) {
        list.push(`You spent ${formatCurrency(Math.abs(monthSummary.savings))} more than you earned. Time to ease off.`)
      }
      if (categoryData.length > 0 && statsCategory === 'expense') {
        const topCat = categoryData[0]
        const share = totalForCategory > 0 ? Math.round((topCat.value / totalForCategory) * 100) : 0
        list.push(`${topCat.name} was your biggest spend at ${share}% of expenses.`)
      }
      if (monthSummary.savingsRate >= 30) {
        list.push('Your savings rate is excellent. Consider moving surplus into a goal.')
      }
    }
    return list
  }, [monthSummary, categoryData, totalForCategory, statsCategory])

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Financial Brief</h1>
        <p className="text-xs text-muted-foreground">Your money at a glance for {monthLabel}.</p>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 p-1 rounded-full bg-secondary/60 w-full max-w-sm mx-auto">
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'calendar', label: 'Calendar' },
          { key: 'stats', label: 'Stats' },
        ] as { key: ViewMode; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setViewMode(tab.key)}
            className={cn(
              'flex-1 px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all',
              viewMode === tab.key ? 'bg-foreground text-background' : 'text-muted-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between px-1">
        <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-secondary transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-sm font-bold">{monthLabel}</h2>
        <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-secondary transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Summary cards - always visible */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3">
          <ArrowUpRight className="w-4 h-4 text-emerald-500 mb-1.5" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Income</p>
          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatCurrency(monthSummary.income)}</p>
        </div>
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-3">
          <ArrowDownRight className="w-4 h-4 text-red-500 mb-1.5" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Spent</p>
          <p className="text-sm font-bold text-red-600 dark:text-red-400 mt-0.5">{formatCurrency(monthSummary.expense)}</p>
        </div>
        <div className="rounded-2xl bg-primary/10 border border-primary/20 p-3">
          <PiggyBank className="w-4 h-4 text-primary mb-1.5" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Saved</p>
          <p className={cn('text-sm font-bold mt-0.5', monthSummary.savings >= 0 ? 'text-primary' : 'text-red-500')}>
            {formatCurrency(monthSummary.savings)}
          </p>
        </div>
      </div>

      {/* OVERVIEW VIEW */}
      {viewMode === 'overview' && (
        <Reorder.Group axis="y" values={cardOrder} onReorder={handleReorder} className="space-y-5">
          {cardOrder.map((cardId) => {
            if (cardId === 'insights') {
              return (
                <ReorderCard key="insights" cardId="insights">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold">Insights</h3>
                  </div>
                  <div className="space-y-2">
                    {insights.map((insight, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                        <p className="text-xs text-muted-foreground leading-relaxed">{insight}</p>
                      </div>
                    ))}
                  </div>
                </ReorderCard>
              )
            }

            if (cardId === 'spending' && categoryData.length > 0) {
              return (
                <ReorderCard key="spending" cardId="spending">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <h3 className="text-sm font-bold">Top Spending</h3>
                  </div>
                  <div className="space-y-3">
                    {categoryData.slice(0, 5).map((cat) => (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{cat.name}</span>
                          <span className="text-xs font-semibold">{formatCurrency(cat.value)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${Math.max(6, (cat.value / (categoryData[0]?.value || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </ReorderCard>
              )
            }

            if (cardId === 'bills' && safeBills.filter(b => !b.isPaid).length > 0) {
              return (
                <ReorderCard key="bills" cardId="bills">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold">Upcoming Bills</h3>
                  </div>
                  <div className="space-y-2">
                    {safeBills.filter(b => !b.isPaid).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 4).map((bill) => (
                      <div key={bill.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium">{bill.title}</p>
                          <p className="text-[10px] text-muted-foreground">Due {bill.dueDate}</p>
                        </div>
                        <span className="text-xs font-semibold">{formatCurrency(bill.amount)}</span>
                      </div>
                    ))}
                  </div>
                </ReorderCard>
              )
            }

            if (cardId === 'goals' && safeGoals.length > 0) {
              return (
                <ReorderCard key="goals" cardId="goals">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold">Goal Progress</h3>
                  </div>
                  <div className="space-y-3">
                    {safeGoals.slice(0, 3).map((goal) => {
                      const pct = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0
                      return (
                        <div key={goal.id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{goal.title}</span>
                            <span className="text-xs font-semibold">{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ReorderCard>
              )
            }

            return null
          })}
        </Reorder.Group>
      )}

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div className="space-y-4">
          {/* Calendar grid */}
          <div className="rounded-3xl bg-card border border-border/50 p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase">
                  {d}
                </div>
              ))}
            </div>

            {/* Date cells */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells before first day */}
              {Array.from({ length: getFirstDayOfMonth(selectedMonth) }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {/* Day cells */}
              {Array.from({ length: getDaysInMonth(selectedMonth) }).map((_, i) => {
                const day = i + 1
                const dateStr = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const dayData = dailyTotals[dateStr]
                const hasExpense = dayData && dayData.expense > 0
                const hasIncome = dayData && dayData.income > 0
                const isSelected = selectedDate === dateStr
                const isToday = dateStr === new Date().toISOString().split('T')[0]

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={cn(
                      "aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all text-xs",
                      isSelected ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
                      isToday ? "bg-primary/10 text-primary font-bold" :
                      "hover:bg-secondary/60",
                      (hasExpense || hasIncome) && !isSelected && "font-semibold"
                    )}
                  >
                    <span className="text-[11px]">{day}</span>
                    {(hasExpense || hasIncome) && (
                      <div className="flex gap-0.5 mt-0.5">
                        {hasIncome && <span className="w-1 h-1 rounded-full bg-emerald-500" />}
                        {hasExpense && <span className="w-1 h-1 rounded-full bg-red-500" />}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected date transactions */}
          {selectedDate && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl bg-card border border-border/50 p-5 space-y-3"
            >
              <h3 className="text-sm font-bold">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </h3>
              {selectedDateTransactions.length > 0 ? (
                <div className="space-y-2">
                  {selectedDateTransactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/40">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          tx.type === 'income' ? "bg-emerald-500/10" : "bg-red-500/10"
                        )}>
                          {tx.type === 'income' ? (
                            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-semibold">{tx.description}</p>
                          <p className="text-[10px] text-muted-foreground">{tx.category}</p>
                        </div>
                      </div>
                      <span className={cn(
                        "text-xs font-bold",
                        tx.type === 'income' ? 'text-emerald-500' : 'text-red-500'
                      )}>
                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No transactions on this day.</p>
              )}
            </motion.div>
          )}

          {/* Day summary if date selected */}
          {selectedDate && dailyTotals[selectedDate] && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Day Income</p>
                <p className="text-sm font-bold text-emerald-500">{formatCurrency(dailyTotals[selectedDate].income)}</p>
              </div>
              <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase">Day Expense</p>
                <p className="text-sm font-bold text-red-500">{formatCurrency(dailyTotals[selectedDate].expense)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STATS VIEW */}
      {viewMode === 'stats' && (
        <div className="space-y-5">
          {/* Toggle expense / income */}
          <div className="flex gap-1 p-1 rounded-full bg-secondary/60 w-fit mx-auto">
            <button
              onClick={() => setStatsCategory('expense')}
              className={cn(
                'px-5 py-1.5 rounded-full text-xs font-semibold transition-all',
                statsCategory === 'expense' ? 'bg-red-500 text-white' : 'text-muted-foreground'
              )}
            >
              Expenses
            </button>
            <button
              onClick={() => setStatsCategory('income')}
              className={cn(
                'px-5 py-1.5 rounded-full text-xs font-semibold transition-all',
                statsCategory === 'income' ? 'bg-emerald-500 text-white' : 'text-muted-foreground'
              )}
            >
              Income
            </button>
          </div>

          {/* Pie Chart */}
          {categoryData.length > 0 ? (
            <div className="rounded-3xl bg-card border border-border/50 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold">
                  {statsCategory === 'expense' ? 'Expense' : 'Income'} Breakdown
                </h3>
              </div>

              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      animationBegin={0}
                      animationDuration={600}
                    >
                      {categoryData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(15, 15, 17, 0.9)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        fontSize: '11px',
                        color: '#fff'
                      }}
                      formatter={(value: number) => [formatCurrency(value), '']}
                    />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>

              {/* Center total */}
              <div className="text-center -mt-2">
                <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                <p className="text-lg font-bold">{formatCurrency(totalForCategory)}</p>
              </div>

              {/* Legend / category list */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                {categoryData.map((cat, idx) => {
                  const pct = totalForCategory > 0 ? Math.round((cat.value / totalForCategory) * 100) : 0
                  return (
                    <div key={cat.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        <span className="text-xs font-medium">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                        <span className="text-xs font-semibold">{formatCurrency(cat.value)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl bg-card border border-border/50 p-8 text-center">
              <PieChart className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs font-semibold text-muted-foreground">No {statsCategory} data this month</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">Add transactions to see your breakdown.</p>
            </div>
          )}

          {/* Per-category stats cards */}
          {categoryData.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                Category Details
              </h3>
              {categoryData.map((cat, idx) => {
                const pct = totalForCategory > 0 ? Math.round((cat.value / totalForCategory) * 100) : 0
                const txCount = monthTransactions.filter(t => t.category === cat.name && t.type === statsCategory).length
                return (
                  <motion.div
                    key={cat.name}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="p-4 rounded-2xl bg-card border border-border/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        <span className="text-sm font-semibold">{cat.name}</span>
                      </div>
                      <span className="text-sm font-bold">{formatCurrency(cat.value)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{txCount} transaction{txCount !== 1 ? 's' : ''}</span>
                      <span>{pct}% of total</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden mt-2">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: PIE_COLORS[idx % PIE_COLORS.length]
                        }}
                      />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Reorderable card wrapper with drag handle
function ReorderCard({ cardId, children }: { cardId: CardId; children: React.ReactNode }) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={cardId}
      dragListener={false}
      dragControls={controls}
      className="rounded-3xl bg-card border border-border/50 p-5 space-y-3 relative"
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 50 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      {/* Drag handle */}
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        className="absolute top-4 right-4 p-2 rounded-xl cursor-grab active:cursor-grabbing touch-none bg-secondary/80 hover:bg-secondary transition-colors"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      {children}
    </Reorder.Item>
  )
}
