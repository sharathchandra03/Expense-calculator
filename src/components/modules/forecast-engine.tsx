'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Bill, Goal, Transaction, generateUUID, syncAccountToAsset } from '@/db/schema'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Sparkles, Calendar, Target, CheckCircle2, ChevronRight, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

export function ForecastEngine() {
  const [subTab, setSubTab] = useState<'forecast' | 'goals' | 'bills'>('forecast')
  const [contributionGoalId, setContributionGoalId] = useState<string | null>(null)
  const [contributionVal, setContributionVal] = useState('')

  // Dexie Queries
  const bills = useLiveQuery(() => db.bills.toArray()) || []
  const goals = useLiveQuery(() => db.goals.toArray()) || []
  const transactions = useLiveQuery(() => db.transactions.toArray()) || []
  const accounts = useLiveQuery(() => db.accounts.toArray()) || []
  const lending = useLiveQuery(() => db.lending.toArray()) || []

  // --- FORECAST ENGINE LOGIC ---
  // We forecast next month based on:
  // 1. Recurring Transactions (e.g. Salary, Subscriptions)
  // 2. Scheduled/Unpaid Bills due
  // 3. Expected Repayments from Lending (repayments due next month)

  // Inflows: Recurring incomes + repayments from lent active
  const recurringInflow = transactions
    .filter(t => t.type === 'income' && t.isRecurring)
    .reduce((sum, t) => sum + t.amount, 0)
  
  const nextMonthLentRepayment = lending
    .filter(l => l.type === 'lent' && l.status === 'active' && l.expectedRepaymentDate)
    .reduce((sum, l) => sum + l.amount, 0) // simplify by assuming they pay next month

  const totalProjectedInflow = recurringInflow + nextMonthLentRepayment

  // Outflows: Recurring expenses + active unpaid bills
  const recurringOutflow = transactions
    .filter(t => t.type === 'expense' && t.isRecurring)
    .reduce((sum, t) => sum + t.amount, 0)

  const activeBillsDue = bills
    .filter(b => !b.isPaid)
    .reduce((sum, b) => sum + b.amount, 0)

  const totalProjectedOutflow = recurringOutflow + activeBillsDue

  // Net Savings
  const projectedNetSavings = totalProjectedInflow - totalProjectedOutflow

  // Current cash reserves (all cash + bank accounts)
  const cashReserves = accounts
    .filter(a => a.type === 'cash' || a.type === 'bank')
    .reduce((sum, a) => sum + a.balance, 0)

  // Projected Cash Next Month
  const projectedCashNextMonth = cashReserves + projectedNetSavings

  // --- SETTLE BILLS LOGIC ---
  const handlePayBill = async (bill: Bill) => {
    try {
      const bankAccount = accounts.find(a => a.type === 'bank') || accounts[0]
      if (!bankAccount) return

      await db.transaction('rw', [db.bills, db.transactions, db.accounts, db.systemLogs], async () => {
        // Mark bill as paid
        await db.bills.update(bill.id, { isPaid: true })

        // Create transaction record
        await db.transactions.add({
          id: generateUUID(),
          date: new Date().toISOString().split('T')[0],
          type: 'expense',
          category: bill.category,
          amount: bill.amount,
          accountId: bankAccount.id,
          description: `Settled Bill: ${bill.title}`,
          isRecurring: false
        })

        // Deduct from bank balance
        const newBal = bankAccount.balance - bill.amount
        await db.accounts.update(bankAccount.id, {
          balance: newBal
        })
        await syncAccountToAsset(bankAccount.name, newBal)

        // Write log
        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'bill',
          description: `Paid bill "${bill.title}" of ${formatCurrency(bill.amount)} from Chase checking`,
          amount: -bill.amount
        })
      })
    } catch (err) {
      console.error('Failed to pay bill:', err)
    }
  }

  // --- GOALS CONTRIBUTIONS LOGIC ---
  const handleGoalContribution = async (goal: Goal) => {
    if (!contributionVal || isNaN(Number(contributionVal))) return
    const amount = parseFloat(contributionVal)
    const bankAccount = accounts.find(a => a.type === 'bank') || accounts[0]

    try {
      await db.transaction('rw', [db.goals, db.accounts, db.systemLogs], async () => {
        const newCurrent = goal.currentAmount + amount
        await db.goals.update(goal.id, {
          currentAmount: newCurrent
        })

        if (bankAccount) {
          const newBal = bankAccount.balance - amount
          await db.accounts.update(bankAccount.id, {
            balance: newBal
          })
          await syncAccountToAsset(bankAccount.name, newBal)
        }

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'goal',
          description: `Contributed ${formatCurrency(amount)} to goal "${goal.title}"`,
          amount: -amount
        })
      })

      setContributionGoalId(null)
      setContributionVal('')
    } catch (err) {
      console.error('Failed to contribute to goal:', err)
    }
  }

  return (
    <div className="flex flex-col space-y-5 pb-28">
      {/* Module Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Future Forecasting</h1>
        <p className="text-xs text-muted-foreground">Preview Cash Projections, Savings Goals, and Bill trackers.</p>
      </div>

      {/* Switch Sub-tabs */}
      <div className="flex p-1 bg-secondary rounded-2xl w-full max-w-xs mx-auto">
        <button
          onClick={() => setSubTab('forecast')}
          className={cn(
            "flex-1 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-center transition-all",
            subTab === 'forecast'
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Projections
        </button>
        <button
          onClick={() => setSubTab('goals')}
          className={cn(
            "flex-1 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-center transition-all",
            subTab === 'goals'
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Goals
        </button>
        <button
          onClick={() => setSubTab('bills')}
          className={cn(
            "flex-1 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-center transition-all",
            subTab === 'bills'
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Bills Due
        </button>
      </div>

      {subTab === 'forecast' ? (
        <div className="space-y-5">
          {/* Projections Card */}
          <Card className="bg-gradient-to-br from-indigo-950/20 to-purple-950/15 relative overflow-hidden">
            <div className="absolute -right-16 -top-16 w-36 h-36 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
            <CardHeader className="mb-2">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4.5 w-4.5 text-primary" />
                <CardDescription className="text-xs uppercase font-semibold text-primary">
                  Next Month Forecast
                </CardDescription>
              </div>
              <CardTitle className="text-base font-bold mt-2">Cash Position Outlook</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-border/20">
                <span className="text-xs text-muted-foreground/90">Current Cash Reserves</span>
                <span className="text-xs font-bold text-foreground">{formatCurrency(cashReserves)}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b border-border/20">
                <div className="flex items-center text-xs text-muted-foreground/90">
                  <ArrowUpRight className="h-4 w-4 text-emerald-500 mr-1" />
                  <span>Projected Inflows</span>
                </div>
                <span className="text-xs font-bold text-emerald-500">+{formatCurrency(totalProjectedInflow)}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-border/20">
                <div className="flex items-center text-xs text-muted-foreground/90">
                  <ArrowDownRight className="h-4 w-4 text-rose-500 mr-1" />
                  <span>Projected Outflows</span>
                </div>
                <span className="text-xs font-bold text-foreground">-{formatCurrency(totalProjectedOutflow)}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-border/20">
                <span className="text-xs text-muted-foreground/90">Forecast Net Savings</span>
                <span className={cn(
                  "text-xs font-bold",
                  projectedNetSavings >= 0 ? "text-emerald-500" : "text-rose-500"
                )}>
                  {projectedNetSavings >= 0 ? '+' : ''}{formatCurrency(projectedNetSavings)}
                </span>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-xs font-bold text-foreground">End of Month Cash Outlook</span>
                <span className="text-sm font-extrabold text-primary">{formatCurrency(projectedCashNextMonth)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Forecast Insights */}
          <Card>
            <div className="flex items-start space-x-3 text-xs leading-relaxed">
              <AlertTriangle className="h-4.5 w-4.5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">Forecast Note</p>
                <p className="text-muted-foreground/90 mt-1">
                  Projections assume regular recurring salary distributions, active subscription debits, and prompt settlement of active bills. Custom adjustments can be logged dynamically.
                </p>
              </div>
            </div>
          </Card>
        </div>
      ) : subTab === 'goals' ? (
        /* Goals Tracker */
        <div className="space-y-4">
          {goals.length > 0 ? (
            goals.map((goal) => {
              const progress = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
              return (
                <div
                  key={goal.id}
                  className="flex flex-col p-4 rounded-2xl bg-card border border-border/50 shadow-sm space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-primary">
                        <Target className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">{goal.title}</p>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                          Target by {goal.targetDate.split('-')[2]} {new Date(goal.targetDate).toLocaleString('en-US', {month: 'short'})}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-foreground">
                        {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                      </p>
                      <button
                        onClick={() => {
                          setContributionGoalId(contributionGoalId === goal.id ? null : goal.id)
                          setContributionVal('')
                        }}
                        className="text-[10px] text-primary font-semibold hover:underline mt-0.5"
                      >
                        Contribute Cash
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {contributionGoalId === goal.id && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-center space-x-2 pt-2 border-t border-border/30"
                    >
                      <Input
                        type="number"
                        placeholder="Amount to save"
                        value={contributionVal}
                        onChange={(e) => setContributionVal(e.target.value)}
                        className="h-9 text-xs rounded-xl"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleGoalContribution(goal)}
                      >
                        Transfer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setContributionGoalId(null)}
                      >
                        Cancel
                      </Button>
                    </motion.div>
                  )}
                </div>
              )
            })
          ) : (
            <div className="text-center py-8 bg-secondary/20 rounded-3xl border border-dashed border-border/60">
              <Target className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-xs font-semibold text-muted-foreground">No saving goals defined</p>
              <p className="text-[10px] text-muted-foreground/80 mt-1">Tap the central + button to set targets.</p>
            </div>
          )}
        </div>
      ) : (
        /* Bills Ledger */
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
            Pending Bills due
          </h3>

          {bills.filter(b => !b.isPaid).length > 0 ? (
            bills
              .filter(b => !b.isPaid)
              .map((bill) => (
                <div
                  key={bill.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border/50 shadow-sm"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
                      <Calendar className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">{bill.title}</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                        Due {bill.dueDate.split('-')[2]} {new Date(bill.dueDate).toLocaleString('en-US', {month: 'short'})}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="text-xs font-bold text-foreground">{formatCurrency(bill.amount)}</span>
                    <button
                      onClick={() => handlePayBill(bill)}
                      className="inline-flex items-center px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-[10px]"
                    >
                      Pay Bill
                    </button>
                  </div>
                </div>
              ))
          ) : (
            <div className="text-center py-8 bg-secondary/20 rounded-3xl border border-dashed border-border/60">
              <CheckCircle2 className="h-8 w-8 text-emerald-500/70 mx-auto mb-2" />
              <p className="text-xs font-semibold text-muted-foreground">All bills paid!</p>
              <p className="text-[10px] text-muted-foreground/80 mt-1">You have no upcoming unpaid reminders.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
