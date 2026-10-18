/**
 * DebtService
 *
 * Business logic for the Debt Payoff Planner. Two responsibilities:
 *
 *  1. SIMULATION — avalanche / snowball payoff projection. Previously this was
 *     copy-pasted twice inside the component; it now lives here once and both
 *     the active plan and the comparison call the same function.
 *
 *  2. REAL MONEY — logging a debt payment actually: reduces the debt balance,
 *     splits the payment into interest + principal, debits the linked account
 *     via MoneyMovementService (creating a ledger transaction), records the
 *     payment on the debt, and marks the debt paid when it hits zero. It also
 *     keeps an imported Lending ('borrowed') record in sync.
 *
 * This is what turns the planner from a disconnected calculator into a tool
 * wired to the user's actual balances.
 */

import { db, DebtRecord, DebtPayment, generateUUID } from '@/db/schema'
import { MoneyMovementService } from '@/services/MoneyMovementService'
import { formatCurrency } from '@/lib/utils'

export type DebtStrategy = 'avalanche' | 'snowball'

export interface PayoffProjection {
  months: number
  totalInterestPaid: number
  debtFreeDate: Date
  totalDebt: number
  totalPaid: number
  monthlyPayment: number
  /** Per-debt payoff month (1-based), keyed by debt id. */
  payoffOrder: Array<{ id: string; name: string; payoffMonth: number }>
}

export interface StrategyComparison {
  otherStrategy: DebtStrategy
  otherMonths: number
  otherInterest: number
  interestSaved: number
  monthsSaved: number
  currentIsBetter: boolean
}

const MAX_MONTHS = 600

export class DebtService {
  /** Sort debts according to the chosen strategy. */
  static orderDebts(debts: DebtRecord[], strategy: DebtStrategy): DebtRecord[] {
    return [...debts].sort((a, b) => {
      if (strategy === 'snowball') return a.balance - b.balance
      return b.interestRate - a.interestRate
    })
  }

  /**
   * Simulate paying off every debt using `strategy` with `extra` applied to the
   * current priority debt each month (classic debt-snowball/avalanche cascade).
   */
  static simulate(debts: DebtRecord[], extra: number, strategy: DebtStrategy): PayoffProjection | null {
    const valid = debts.filter(d => d.balance > 0 && d.minimumPayment > 0)
    if (valid.length === 0) return null

    const sorted = this.orderDebts(valid, strategy)
    const remaining = sorted.map(d => ({ id: d.id, name: d.name, balance: d.balance, interestRate: d.interestRate, minimumPayment: d.minimumPayment, currentBalance: d.balance }))
    const payoffMonth: Record<string, number> = {}

    let totalInterestPaid = 0
    let months = 0

    while (remaining.some(d => d.currentBalance > 0) && months < MAX_MONTHS) {
      months++
      let availableExtra = extra
      const priorityIdx = remaining.findIndex(d => d.currentBalance > 0)

      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].currentBalance <= 0) continue
        const monthlyRate = remaining[i].interestRate / 100 / 12
        const interest = remaining[i].currentBalance * monthlyRate
        totalInterestPaid += interest
        remaining[i].currentBalance += interest

        const payment = Math.min(remaining[i].minimumPayment, remaining[i].currentBalance)
        remaining[i].currentBalance -= payment

        if (i === priorityIdx && availableExtra > 0) {
          const extraApplied = Math.min(availableExtra, remaining[i].currentBalance)
          remaining[i].currentBalance -= extraApplied
          availableExtra -= extraApplied
        }
        if (remaining[i].currentBalance < 0.01) {
          remaining[i].currentBalance = 0
          if (!payoffMonth[remaining[i].id]) payoffMonth[remaining[i].id] = months
        }
      }

      // Cascade leftover extra onto the next unpaid debt.
      if (availableExtra > 0) {
        for (let i = 0; i < remaining.length; i++) {
          if (remaining[i].currentBalance <= 0 || i === priorityIdx) continue
          const extraApplied = Math.min(availableExtra, remaining[i].currentBalance)
          remaining[i].currentBalance -= extraApplied
          availableExtra -= extraApplied
          if (remaining[i].currentBalance < 0.01) {
            remaining[i].currentBalance = 0
            if (!payoffMonth[remaining[i].id]) payoffMonth[remaining[i].id] = months
          }
          if (availableExtra <= 0) break
        }
      }
    }

    const debtFreeDate = new Date()
    debtFreeDate.setMonth(debtFreeDate.getMonth() + months)
    const totalDebt = valid.reduce((s, d) => s + d.balance, 0)
    const totalMinPayment = valid.reduce((s, d) => s + d.minimumPayment, 0)

    return {
      months,
      totalInterestPaid: Math.round(totalInterestPaid),
      debtFreeDate,
      totalDebt,
      totalPaid: Math.round(totalDebt + totalInterestPaid),
      monthlyPayment: totalMinPayment + extra,
      payoffOrder: sorted.map(d => ({ id: d.id, name: d.name, payoffMonth: payoffMonth[d.id] || months })),
    }
  }

  /** Compare the active strategy against the other one. */
  static compare(debts: DebtRecord[], extra: number, strategy: DebtStrategy): StrategyComparison | null {
    const current = this.simulate(debts, extra, strategy)
    if (!current) return null
    const other: DebtStrategy = strategy === 'snowball' ? 'avalanche' : 'snowball'
    const otherProj = this.simulate(debts, extra, other)
    if (!otherProj) return null

    return {
      otherStrategy: other,
      otherMonths: otherProj.months,
      otherInterest: otherProj.totalInterestPaid,
      interestSaved: Math.round(Math.abs(otherProj.totalInterestPaid - current.totalInterestPaid)),
      monthsSaved: Math.abs(otherProj.months - current.months),
      currentIsBetter: current.totalInterestPaid <= otherProj.totalInterestPaid,
    }
  }

  /** Interest accrued this month on a balance at an annual rate. */
  static monthlyInterest(balance: number, annualRate: number): number {
    return Math.max(0, balance * (annualRate / 100 / 12))
  }

  /**
   * Log a payment against a debt. Splits into interest-first then principal,
   * reduces the balance, and — when the debt is linked to an account — moves
   * real money (ledger transaction + balance). Marks the debt paid at zero and
   * syncs a linked Lending record.
   */
  static async logPayment(
    debtId: string,
    amount: number,
    opts: { accountId?: string; date?: string; note?: string } = {}
  ): Promise<void> {
    if (amount <= 0) return

    await db.transaction(
      'rw',
      [db.debts, db.lending, db.accounts, db.assets, db.transactions, db.systemLogs, db.notifications],
      async () => {
        const debt = await db.debts.get(debtId)
        if (!debt || debt.balance <= 0) return

        const interest = this.monthlyInterest(debt.balance, debt.interestRate)
        // The payment covers interest first; the rest reduces principal.
        const pay = Math.min(amount, debt.balance + interest)
        const interestPortion = Math.min(interest, pay)
        const principalPortion = Math.max(0, pay - interestPortion)
        const newBalance = Math.max(0, debt.balance - principalPortion)

        const accountId = opts.accountId || debt.accountId
        let transactionId: string | undefined

        if (accountId) {
          const account = await db.accounts.get(accountId)
          if (account) {
            const res = await MoneyMovementService.apply({
              accountId,
              type: 'expense',
              amount: pay,
              category: 'Debt Payment',
              description: `Payment on ${debt.name}`,
              logType: 'system',
              date: opts.date,
              tags: ['debt', debt.name],
            })
            transactionId = res.transactionId
          }
        }

        const payment: DebtPayment = {
          id: generateUUID(),
          date: opts.date || new Date().toISOString().split('T')[0],
          amount: pay,
          principal: Math.round(principalPortion),
          interest: Math.round(interestPortion),
          accountId,
          transactionId,
          note: opts.note,
        }

        const nowPaid = newBalance <= 0
        await db.debts.update(debt.id, {
          balance: newBalance,
          payments: [...(debt.payments || []), payment],
          status: nowPaid ? 'paid' : 'active',
        })

        // Keep a linked Lending 'borrowed' record in sync.
        if (debt.lendingId) {
          const lending = await db.lending.get(debt.lendingId)
          if (lending) {
            await db.lending.update(debt.lendingId, {
              amount: newBalance,
              status: nowPaid ? 'paid' : 'active',
            })
          }
        }

        if (!accountId) {
          // Counter-only payment still deserves a timeline entry.
          await db.systemLogs.add({
            id: generateUUID(),
            timestamp: new Date().toISOString(),
            type: 'system',
            description: `Logged ${formatCurrency(pay)} payment on ${debt.name}`,
            amount: -pay,
          })
        }

        if (nowPaid) {
          await db.notifications.add({
            id: generateUUID(),
            type: 'system',
            title: 'Debt cleared! 🎉',
            message: `You paid off "${debt.name}". One less debt to worry about.`,
            read: false,
            timestamp: new Date().toISOString(),
          })
        }
      }
    )
  }

  /** Import active 'borrowed' lending records as debts (idempotent by lendingId). */
  static async importFromLending(): Promise<number> {
    const [lending, debts] = await Promise.all([db.lending.toArray(), db.debts.toArray()])
    const already = new Set(debts.map(d => d.lendingId).filter(Boolean))
    const borrowed = lending.filter(l => l.type === 'borrowed' && l.status === 'active' && !already.has(l.id))

    for (const l of borrowed) {
      await db.debts.add({
        id: generateUUID(),
        name: l.contactName || 'Borrowed',
        kind: 'personal_loan',
        balance: l.amount,
        originalBalance: l.amount,
        interestRate: l.interestRate || 0,
        minimumPayment: Math.max(1, Math.round(l.amount / 12)),
        lendingId: l.id,
        payments: [],
        status: 'active',
        createdAt: new Date().toISOString(),
      })
    }
    return borrowed.length
  }

  static async create(input: {
    name: string
    kind?: DebtRecord['kind']
    balance: number
    interestRate: number
    minimumPayment: number
    dueDay?: number
    accountId?: string
  }): Promise<string> {
    const id = generateUUID()
    await db.debts.add({
      id,
      name: input.name.trim(),
      kind: input.kind || 'other',
      balance: input.balance,
      originalBalance: input.balance,
      interestRate: input.interestRate,
      minimumPayment: input.minimumPayment,
      dueDay: input.dueDay,
      accountId: input.accountId,
      payments: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    })
    return id
  }

  static async delete(debtId: string): Promise<void> {
    await db.debts.delete(debtId)
  }

  /** Totals for the planner header. */
  static summarize(debts: DebtRecord[]) {
    const active = debts.filter(d => d.balance > 0)
    const totalBalance = active.reduce((s, d) => s + d.balance, 0)
    const totalMinPayment = active.reduce((s, d) => s + d.minimumPayment, 0)
    const totalOriginal = debts.reduce((s, d) => s + (d.originalBalance || d.balance), 0)
    const totalPaid = debts.reduce(
      (s, d) => s + (d.payments || []).reduce((ps, p) => ps + p.principal, 0),
      0
    )
    const weightedRate = totalBalance > 0
      ? active.reduce((s, d) => s + d.balance * d.interestRate, 0) / totalBalance
      : 0
    return {
      totalBalance,
      totalMinPayment,
      totalOriginal,
      totalPaid,
      paidOffCount: debts.filter(d => d.balance <= 0).length,
      activeCount: active.length,
      avgInterestRate: weightedRate,
      overallProgress: totalOriginal > 0 ? ((totalOriginal - totalBalance) / totalOriginal) * 100 : 0,
    }
  }
}
