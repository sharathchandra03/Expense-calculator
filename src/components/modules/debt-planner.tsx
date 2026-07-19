'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, DebtRecord, generateUUID } from '@/db/schema'
import { motion, AnimatePresence } from 'framer-motion'
import { formatCurrency, cn } from '@/lib/utils'
import { TrendingDown, Calculator, Calendar, Zap, Target, Download, Plus, Trash2, Save, Edit2, Check, X } from 'lucide-react'

interface DebtInput {
  name: string
  balance: string
  interestRate: string
  minimumPayment: string
}

export function DebtPlanner() {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDebt, setNewDebt] = useState<DebtInput>({ name: '', balance: '', interestRate: '', minimumPayment: '' })
  const [extraPayment, setExtraPayment] = useState('')
  const [strategy, setStrategy] = useState<'snowball' | 'avalanche'>('avalanche')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<DebtInput>({ name: '', balance: '', interestRate: '', minimumPayment: '' })

  // Load saved debts from database
  const savedDebts = useLiveQuery(() => db.debts.toArray()) ?? []
  const safeDebts = Array.isArray(savedDebts) ? savedDebts : []

  // Link to existing lending records
  const lending = useLiveQuery(() => db.lending.toArray()) ?? []
  const borrowedDebts = (Array.isArray(lending) ? lending : [])
    .filter(l => l.type === 'borrowed' && l.status === 'active')

  const importFromLending = async () => {
    if (borrowedDebts.length === 0) return
    for (const l of borrowedDebts) {
      await db.debts.add({
        id: generateUUID(),
        name: l.contactName || 'Borrowed',
        balance: l.amount,
        interestRate: l.interestRate || 0,
        minimumPayment: Math.round(l.amount / 12),
        createdAt: new Date().toISOString(),
      })
    }
  }

  // Save a new debt
  const handleSaveDebt = async () => {
    const balance = parseFloat(newDebt.balance)
    const interestRate = parseFloat(newDebt.interestRate)
    const minimumPayment = parseFloat(newDebt.minimumPayment)

    if (!newDebt.name.trim() || isNaN(balance) || balance <= 0 || isNaN(minimumPayment) || minimumPayment <= 0) {
      return // Validation: name, balance, and min payment are required
    }

    await db.debts.add({
      id: generateUUID(),
      name: newDebt.name.trim(),
      balance,
      interestRate: isNaN(interestRate) ? 0 : interestRate,
      minimumPayment,
      createdAt: new Date().toISOString(),
    })

    setNewDebt({ name: '', balance: '', interestRate: '', minimumPayment: '' })
    setShowAddForm(false)
  }

  // Delete a debt
  const handleDeleteDebt = async (id: string) => {
    await db.debts.delete(id)
  }

  // Edit a debt
  const startEditing = (debt: DebtRecord) => {
    setEditingId(debt.id)
    setEditData({
      name: debt.name,
      balance: debt.balance.toString(),
      interestRate: debt.interestRate.toString(),
      minimumPayment: debt.minimumPayment.toString(),
    })
  }

  const handleEditSave = async (id: string) => {
    const balance = parseFloat(editData.balance)
    const interestRate = parseFloat(editData.interestRate)
    const minimumPayment = parseFloat(editData.minimumPayment)

    if (!editData.name.trim() || isNaN(balance) || balance <= 0 || isNaN(minimumPayment) || minimumPayment <= 0) {
      return
    }

    await db.debts.update(id, {
      name: editData.name.trim(),
      balance,
      interestRate: isNaN(interestRate) ? 0 : interestRate,
      minimumPayment,
    })
    setEditingId(null)
  }

  // Calculate payoff schedule
  const payoffData = useMemo(() => {
    const validDebts = safeDebts.filter(d => d.balance > 0 && d.minimumPayment > 0)
    if (validDebts.length === 0) return null

    const extra = parseFloat(extraPayment) || 0
    const totalMinPayment = validDebts.reduce((sum, d) => sum + d.minimumPayment, 0)
    const totalMonthlyPayment = totalMinPayment + extra

    // Sort based on strategy
    const sorted = [...validDebts].sort((a, b) => {
      if (strategy === 'snowball') return a.balance - b.balance
      return b.interestRate - a.interestRate
    })

    // Simulate payoff
    let remaining = sorted.map(d => ({ ...d, currentBalance: d.balance }))
    let totalInterestPaid = 0
    let months = 0
    const maxMonths = 600

    while (remaining.some(d => d.currentBalance > 0) && months < maxMonths) {
      months++
      let availableExtra = extra

      // Find first debt with remaining balance (the priority target)
      const priorityIdx = remaining.findIndex(d => d.currentBalance > 0)

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

        // Apply extra to the priority debt only
        if (i === priorityIdx && availableExtra > 0) {
          const extraApplied = Math.min(availableExtra, remaining[i].currentBalance)
          remaining[i].currentBalance -= extraApplied
          availableExtra -= extraApplied
        }

        if (remaining[i].currentBalance < 0.01) remaining[i].currentBalance = 0
      }

      // If priority debt is paid off and there's leftover extra, apply to next
      if (availableExtra > 0) {
        for (let i = 0; i < remaining.length; i++) {
          if (remaining[i].currentBalance <= 0 || i === priorityIdx) continue
          const extraApplied = Math.min(availableExtra, remaining[i].currentBalance)
          remaining[i].currentBalance -= extraApplied
          availableExtra -= extraApplied
          if (remaining[i].currentBalance < 0.01) remaining[i].currentBalance = 0
          if (availableExtra <= 0) break
        }
      }
    }

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
  }, [safeDebts, extraPayment, strategy])

  // Compare strategies
  const comparison = useMemo(() => {
    if (!payoffData) return null

    const otherStrategy = strategy === 'snowball' ? 'avalanche' : 'snowball'
    const validDebts = safeDebts.filter(d => d.balance > 0 && d.minimumPayment > 0)
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
      const priorityIdx = remaining.findIndex(d => d.currentBalance > 0)

      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].currentBalance <= 0) continue
        const interest = remaining[i].currentBalance * (remaining[i].interestRate / 100 / 12)
        totalInterest += interest
        remaining[i].currentBalance += interest
        const payment = Math.min(remaining[i].minimumPayment, remaining[i].currentBalance)
        remaining[i].currentBalance -= payment
        if (i === priorityIdx && availableExtra > 0) {
          const extraApplied = Math.min(availableExtra, remaining[i].currentBalance)
          remaining[i].currentBalance -= extraApplied
          availableExtra -= extraApplied
        }
        if (remaining[i].currentBalance < 0.01) remaining[i].currentBalance = 0
      }

      if (availableExtra > 0) {
        for (let i = 0; i < remaining.length; i++) {
          if (remaining[i].currentBalance <= 0 || i === priorityIdx) continue
          const extraApplied = Math.min(availableExtra, remaining[i].currentBalance)
          remaining[i].currentBalance -= extraApplied
          availableExtra -= extraApplied
          if (remaining[i].currentBalance < 0.01) remaining[i].currentBalance = 0
          if (availableExtra <= 0) break
        }
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
  }, [safeDebts, extraPayment, strategy, payoffData])

  return (
    <div className="flex flex-col space-y-5 pb-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Debt Payoff Planner</h1>
        <p className="text-xs text-muted-foreground">Plan your path to financial freedom</p>
      </div>

      {/* Saved Debts List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Your Debts ({safeDebts.length})</p>
          <div className="flex items-center gap-2">
            {borrowedDebts.length > 0 && (
              <button
                onClick={importFromLending}
                className="flex items-center gap-1 text-[10px] text-primary font-semibold hover:opacity-80"
              >
                <Download className="w-3 h-3" /> Import ({borrowedDebts.length})
              </button>
            )}
          </div>
        </div>

        {/* Existing saved debts */}
        {safeDebts.map((debt) => (
          <motion.div
            key={debt.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-2xl bg-card border border-border/50"
          >
            {editingId === debt.id ? (
              /* Edit mode */
              <div className="space-y-2">
                <input
                  type="text"
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  placeholder="Debt name"
                  className="w-full h-8 px-3 rounded-lg bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] text-muted-foreground">Balance</label>
                    <input
                      type="number"
                      value={editData.balance}
                      onChange={(e) => setEditData({ ...editData, balance: e.target.value })}
                      className="w-full h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Rate (%)</label>
                    <input
                      type="number"
                      value={editData.interestRate}
                      onChange={(e) => setEditData({ ...editData, interestRate: e.target.value })}
                      className="w-full h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Min Payment</label>
                    <input
                      type="number"
                      value={editData.minimumPayment}
                      onChange={(e) => setEditData({ ...editData, minimumPayment: e.target.value })}
                      className="w-full h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => handleEditSave(debt.id)}
                    className="flex items-center gap-1 h-8 px-3 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-500 transition-colors"
                  >
                    <Check className="w-3 h-3" /> Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex items-center gap-1 h-8 px-3 rounded-lg bg-secondary text-muted-foreground text-[10px] font-bold hover:text-foreground transition-colors"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Display mode */
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-foreground">{debt.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatCurrency(debt.balance)} @ {debt.interestRate}% • Min: {formatCurrency(debt.minimumPayment)}/mo
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => startEditing(debt)}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteDebt(debt.id)}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        ))}

        {/* Add Debt Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-3 rounded-2xl bg-card border border-primary/30 space-y-2">
                <p className="text-[10px] font-bold text-primary uppercase">Add New Debt</p>
                <input
                  type="text"
                  value={newDebt.name}
                  onChange={(e) => setNewDebt({ ...newDebt, name: e.target.value })}
                  placeholder="Debt name (e.g. Credit Card, Home Loan)"
                  className="w-full h-8 px-3 rounded-lg bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] text-muted-foreground">Balance</label>
                    <input
                      type="number"
                      value={newDebt.balance}
                      onChange={(e) => setNewDebt({ ...newDebt, balance: e.target.value })}
                      placeholder="0"
                      className="w-full h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Rate (%)</label>
                    <input
                      type="number"
                      value={newDebt.interestRate}
                      onChange={(e) => setNewDebt({ ...newDebt, interestRate: e.target.value })}
                      placeholder="0"
                      className="w-full h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Min Payment</label>
                    <input
                      type="number"
                      value={newDebt.minimumPayment}
                      onChange={(e) => setNewDebt({ ...newDebt, minimumPayment: e.target.value })}
                      placeholder="0"
                      className="w-full h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSaveDebt}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Debt
                  </button>
                  <button
                    onClick={() => { setShowAddForm(false); setNewDebt({ name: '', balance: '', interestRate: '', minimumPayment: '' }) }}
                    className="h-9 px-4 rounded-xl bg-secondary text-muted-foreground text-xs font-bold hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Debt Button */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-1.5 h-10 rounded-2xl border-2 border-dashed border-border/60 text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add a Debt
          </button>
        )}
      </div>

      {/* Extra Monthly Payment */}
      <div className="p-3 rounded-2xl bg-secondary/50 border border-border/50 space-y-2">
        <label className="text-[10px] font-bold text-muted-foreground uppercase">Extra Monthly Payment</label>
        <input
          type="number"
          value={extraPayment}
          onChange={(e) => setExtraPayment(e.target.value)}
          placeholder="0 extra per month"
          className="w-full h-9 px-3 rounded-xl bg-background border border-border/50 text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
        />
        <p className="text-[9px] text-muted-foreground">Any extra amount you can pay monthly on top of minimums</p>
      </div>

      {/* Strategy Toggle */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payoff Strategy</p>
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
        <div className="grid grid-cols-2 gap-2">
          <p className="text-[9px] text-muted-foreground px-1">
            <span className="font-bold text-foreground">Avalanche:</span> Pay highest interest first. Saves the most money.
          </p>
          <p className="text-[9px] text-muted-foreground px-1">
            <span className="font-bold text-foreground">Snowball:</span> Pay smallest balance first. Quick wins for motivation.
          </p>
        </div>
      </div>

      {/* Results */}
      {payoffData ? (
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
                  {comparison.currentIsBetter ? '✓ Your choice saves' : '→ Switching would save'} {formatCurrency(comparison.interestSaved)} in interest ({comparison.monthsSaved} months faster)
                </p>
              )}
            </div>
          )}
        </motion.div>
      ) : safeDebts.length > 0 ? (
        <div className="p-5 rounded-2xl bg-secondary/30 border border-border/40 text-center">
          <Calculator className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Fill in balance and minimum payment for your debts to see the payoff plan.</p>
        </div>
      ) : null}
    </div>
  )
}
