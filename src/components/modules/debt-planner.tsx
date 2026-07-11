'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { motion } from 'framer-motion'
import { formatCurrency, cn } from '@/lib/utils'
import { TrendingDown, Calculator, Calendar, Zap, Target, Download } from 'lucide-react'

interface DebtInput {
  name: string
  balance: number
  interestRate: number
  minimumPayment: number
}

interface PayoffMonth {
  month: number
  principal: number
  interest: number
  payment: number
  remaining: number
}

export function DebtPlanner() {
  const [debts, setDebts] = useState<DebtInput[]>([
    { name: '', balance: 0, interestRate: 0, minimumPayment: 0 }
  ])
  const [extraPayment, setExtraPayment] = useState('')
  const [strategy, setStrategy] = useState<'snowball' | 'avalanche'>('avalanche')

  // Link to existing lending records
  const lending = useLiveQuery(() => db.lending.toArray()) ?? []
  const borrowedDebts = (Array.isArray(lending) ? lending : [])
    .filter(l => l.type === 'borrowed' && l.status === 'active')

  const importFromLending = () => {
    if (borrowedDebts.length === 0) return
    const imported: DebtInput[] = borrowedDebts.map(l => ({
      name: l.contactName || 'Borrowed',
      balance: l.amount,
      interestRate: l.interestRate || 0,
      minimumPayment: Math.round(l.amount / 12), // Default to 12-month payoff
    }))
    setDebts(imported)
  }

  const addDebt = () => setDebts([...debts, { name: '', balance: 0, interestRate: 0, minimumPayment: 0 }])
  const updateDebt = (i: number, field: keyof DebtInput, value: string) => {
    const updated = [...debts]
    if (field === 'name') {
      updated[i].name = value
    } else {
      updated[i][field] = parseFloat(value) || 0
    }
    setDebts(updated)
  }
  const removeDebt = (i: number) => setDebts(debts.filter((_, idx) => idx !== i))

  // Calculate payoff schedule
  const payoffData = useMemo(() => {
    const validDebts = debts.filter(d => d.balance > 0 && d.minimumPayment > 0)
    if (validDebts.length === 0) return null

    const extra = parseFloat(extraPayment) || 0
    const totalMinPayment = validDebts.reduce((sum, d) => sum + d.minimumPayment, 0)
    const totalMonthlyPayment = totalMinPayment + extra

    // Sort based on strategy
    const sorted = [...validDebts].sort((a, b) => {
      if (strategy === 'snowball') return a.balance - b.balance // Smallest balance first
      return b.interestRate - a.interestRate // Highest interest first
    })

    // Simulate payoff
    let remaining = sorted.map(d => ({ ...d, currentBalance: d.balance }))
    let totalInterestPaid = 0
    let months = 0
    const maxMonths = 600 // 50 years cap

    while (remaining.some(d => d.currentBalance > 0) && months < maxMonths) {
      months++
      let availableExtra = extra

      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].currentBalance <= 0) continue

        // Monthly interest
        const monthlyRate = remaining[i].interestRate / 100 / 12
        const interest = remaining[i].currentBalance * monthlyRate
        totalInterestPaid += interest

        remaining[i].currentBalance += interest

        // Apply minimum payment
        const payment = Math.min(remaining[i].minimumPayment, remaining[i].currentBalance)
        remaining[i].currentBalance -= payment

        // Apply extra to the priority debt (first in sorted list that still has balance)
        if (i === remaining.findIndex(d => d.currentBalance > 0) && availableExtra > 0) {
          const extraApplied = Math.min(availableExtra, remaining[i].currentBalance)
          remaining[i].currentBalance -= extraApplied
          availableExtra -= extraApplied
        }

        if (remaining[i].currentBalance < 0.01) remaining[i].currentBalance = 0
      }
    }

    // Debt-free date
    const debtFreeDate = new Date()
    debtFreeDate.setMonth(debtFreeDate.getMonth() + months)

    const totalDebt = validDebts.reduce((sum, d) => sum + d.balance, 0)

    return {
      months,
      totalInterestPaid: Math.round(totalInterestPaid),
      debtFreeDate,
      totalDebt,
      totalPaid: Math.round(totalDebt + totalInterestPaid),
      monthlyPayment: totalMonthlyPayment,
    }
  }, [debts, extraPayment, strategy])

  // Compare strategies
  const comparison = useMemo(() => {
    if (!payoffData) return null

    // Calculate for the other strategy
    const otherStrategy = strategy === 'snowball' ? 'avalanche' : 'snowball'
    const validDebts = debts.filter(d => d.balance > 0 && d.minimumPayment > 0)
    const extra = parseFloat(extraPayment) || 0

    const sorted = [...validDebts].sort((a, b) => {
      if (otherStrategy === 'snowball') return a.balance - b.balance
      return b.interestRate - a.interestRate
    })

    let remaining = sorted.map(d => ({ ...d, currentBalance: d.balance }))
    let totalInterest = 0
    let months = 0

    while (remaining.some(d => d.currentBalance > 0) && months < 600) {
      months++
      let availableExtra = extra
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].currentBalance <= 0) continue
        const interest = remaining[i].currentBalance * (remaining[i].interestRate / 100 / 12)
        totalInterest += interest
        remaining[i].currentBalance += interest
        const payment = Math.min(remaining[i].minimumPayment, remaining[i].currentBalance)
        remaining[i].currentBalance -= payment
        if (i === remaining.findIndex(d => d.currentBalance > 0) && availableExtra > 0) {
          const extraApplied = Math.min(availableExtra, remaining[i].currentBalance)
          remaining[i].currentBalance -= extraApplied
          availableExtra -= extraApplied
        }
        if (remaining[i].currentBalance < 0.01) remaining[i].currentBalance = 0
      }
    }

    const interestDiff = Math.abs(totalInterest - payoffData.totalInterestPaid)
    const monthsDiff = Math.abs(months - payoffData.months)

    return {
      otherMonths: months,
      otherInterest: Math.round(totalInterest),
      interestSaved: Math.round(interestDiff),
      monthsSaved: monthsDiff,
      currentIsBetter: payoffData.totalInterestPaid <= totalInterest,
    }
  }, [debts, extraPayment, strategy, payoffData])

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Debt Payoff Planner</h1>
        <p className="text-xs text-muted-foreground">Plan your path to financial freedom</p>
      </div>

      {/* Debt Inputs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Your Debts</p>
          {borrowedDebts.length > 0 && (
            <button
              onClick={importFromLending}
              className="flex items-center gap-1 text-[10px] text-primary font-semibold hover:opacity-80"
            >
              <Download className="w-3 h-3" /> Import from Lending ({borrowedDebts.length})
            </button>
          )}
        </div>
        {debts.map((debt, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-2xl bg-card border border-border/50 space-y-2"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={debt.name}
                onChange={(e) => updateDebt(i, 'name', e.target.value)}
                placeholder="Debt name (e.g. Credit Card)"
                className="flex-1 h-8 px-3 rounded-lg bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
              />
              {debts.length > 1 && (
                <button onClick={() => removeDebt(i)} className="text-[10px] text-destructive font-bold px-2">Remove</button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] text-muted-foreground">Balance</label>
                <input
                  type="number"
                  value={debt.balance || ''}
                  onChange={(e) => updateDebt(i, 'balance', e.target.value)}
                  placeholder="₹0"
                  className="w-full h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                />
              </div>
              <div>
                <label className="text-[9px] text-muted-foreground">Rate (%)</label>
                <input
                  type="number"
                  value={debt.interestRate || ''}
                  onChange={(e) => updateDebt(i, 'interestRate', e.target.value)}
                  placeholder="0%"
                  className="w-full h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                />
              </div>
              <div>
                <label className="text-[9px] text-muted-foreground">Min Payment</label>
                <input
                  type="number"
                  value={debt.minimumPayment || ''}
                  onChange={(e) => updateDebt(i, 'minimumPayment', e.target.value)}
                  placeholder="₹0"
                  className="w-full h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                />
              </div>
            </div>
          </motion.div>
        ))}
        <button onClick={addDebt} className="text-xs text-primary font-semibold">+ Add another debt</button>
      </div>

      {/* Extra Monthly Payment */}
      <div className="p-3 rounded-2xl bg-secondary/50 border border-border/50 space-y-2">
        <label className="text-[10px] font-bold text-muted-foreground uppercase">Extra Monthly Payment</label>
        <input
          type="number"
          value={extraPayment}
          onChange={(e) => setExtraPayment(e.target.value)}
          placeholder="₹0 extra per month"
          className="w-full h-9 px-3 rounded-xl bg-background border border-border/50 text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
        />
      </div>

      {/* Strategy Toggle */}
      <div className="flex p-1 bg-secondary rounded-2xl">
        <button
          onClick={() => setStrategy('avalanche')}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all",
            strategy === 'avalanche' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          <Zap className="w-3.5 h-3.5 inline mr-1" /> Avalanche
        </button>
        <button
          onClick={() => setStrategy('snowball')}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all",
            strategy === 'snowball' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          <Target className="w-3.5 h-3.5 inline mr-1" /> Snowball
        </button>
      </div>

      {/* Results */}
      {payoffData && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Headline */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 text-center">
            <Calendar className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
            <p className="text-lg font-bold text-foreground">
              Debt-free by {payoffData.debtFreeDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {payoffData.months} months • {formatCurrency(payoffData.totalInterestPaid)} total interest
            </p>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-card border border-border/50">
              <p className="text-[9px] text-muted-foreground font-bold uppercase">Total Debt</p>
              <p className="text-base font-bold text-foreground mt-0.5">{formatCurrency(payoffData.totalDebt)}</p>
            </div>
            <div className="p-3 rounded-2xl bg-card border border-border/50">
              <p className="text-[9px] text-muted-foreground font-bold uppercase">Total Interest</p>
              <p className="text-base font-bold text-red-500 mt-0.5">{formatCurrency(payoffData.totalInterestPaid)}</p>
            </div>
            <div className="p-3 rounded-2xl bg-card border border-border/50">
              <p className="text-[9px] text-muted-foreground font-bold uppercase">Monthly Payment</p>
              <p className="text-base font-bold text-foreground mt-0.5">{formatCurrency(payoffData.monthlyPayment)}</p>
            </div>
            <div className="p-3 rounded-2xl bg-card border border-border/50">
              <p className="text-[9px] text-muted-foreground font-bold uppercase">Total Paid</p>
              <p className="text-base font-bold text-foreground mt-0.5">{formatCurrency(payoffData.totalPaid)}</p>
            </div>
          </div>

          {/* Strategy comparison */}
          {comparison && (
            <div className="p-4 rounded-2xl bg-secondary/50 border border-border/50">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Strategy Comparison</p>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-foreground capitalize">{strategy}</p>
                  <p className="text-[10px] text-muted-foreground">{payoffData.months} mo • {formatCurrency(payoffData.totalInterestPaid)} interest</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-muted-foreground capitalize">{strategy === 'snowball' ? 'avalanche' : 'snowball'}</p>
                  <p className="text-[10px] text-muted-foreground">{comparison.otherMonths} mo • {formatCurrency(comparison.otherInterest)} interest</p>
                </div>
              </div>
              {comparison.interestSaved > 0 && (
                <p className={cn("text-[10px] font-bold mt-2", comparison.currentIsBetter ? "text-emerald-500" : "text-amber-500")}>
                  {comparison.currentIsBetter ? '✓' : '→'} {comparison.currentIsBetter ? 'You save' : 'Switch to save'} {formatCurrency(comparison.interestSaved)} in interest
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
