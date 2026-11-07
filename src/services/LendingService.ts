/**
 * LendingService
 *
 * Turns lending/borrowing events into real money movements so they show up in
 * the ledger, Statistics and account balances (via MoneyMovementService).
 *
 *   Lent    : giving money out is an EXPENSE, getting it back is INCOME.
 *   Borrowed: receiving money is INCOME, paying it back is an EXPENSE.
 *
 * Callers should run these inside a Dexie transaction that includes
 * LendingService.TABLES together with their own lending-table update, so the
 * record and the money movement succeed or fail together.
 */

import { db } from '@/db/schema'
import { MoneyMovementService } from '@/services/MoneyMovementService'
import { formatCurrency } from '@/lib/utils'

export type LendingKind = 'lent' | 'borrowed'

export const LENDING_CATEGORY: Record<LendingKind, string> = {
  lent: 'Lending',
  borrowed: 'Borrowing',
}

type Event = 'principal' | 'repayment'

export class LendingService {
  /** Tables a surrounding db.transaction must include. */
  static get TABLES() {
    return [db.lending, db.accounts, db.assets, db.transactions, db.systemLogs]
  }

  /** Direction of the money for a given event. */
  static txnType(kind: LendingKind, event: Event): 'income' | 'expense' {
    const principalIsExpense = kind === 'lent'
    if (event === 'principal') return principalIsExpense ? 'expense' : 'income'
    return principalIsExpense ? 'income' : 'expense'
  }

  /** Short sentence describing what will be recorded, for UI hints. */
  static describeImpact(kind: LendingKind, event: Event, amount: number): string {
    const type = this.txnType(kind, event)
    return `Records ${formatCurrency(Math.abs(amount))} as ${type === 'expense' ? 'an expense' : 'income'} in "${LENDING_CATEGORY[kind]}".`
  }

  private static async move(
    kind: LendingKind,
    event: Event,
    amount: number,
    accountId: string,
    description: string,
    date?: string,
  ): Promise<string> {
    const { transactionId } = await MoneyMovementService.apply({
      accountId,
      type: this.txnType(kind, event),
      amount: Math.abs(amount),
      category: LENDING_CATEGORY[kind],
      description,
      logType: 'lending',
      date,
      tags: ['lending'],
    })
    return transactionId
  }

  /** A new lending/borrowing record: money leaves (lent) or arrives (borrowed). */
  static recordNew(kind: LendingKind, contact: string, amount: number, accountId: string, date?: string) {
    const description = kind === 'lent' ? `Lent to ${contact}` : `Borrowed from ${contact}`
    return this.move(kind, 'principal', amount, accountId, description, date)
  }

  /** A repayment (partial or full): money comes back (lent) or goes out (borrowed). */
  static recordRepayment(
    kind: LendingKind,
    contact: string,
    amount: number,
    accountId: string,
    note?: string,
    date?: string,
  ) {
    const base = kind === 'lent' ? `Repayment received from ${contact}` : `Repaid to ${contact}`
    return this.move(kind, 'repayment', amount, accountId, note ? `${base} - ${note}` : base, date)
  }

  /**
   * The principal of an existing record was edited. A positive delta means more
   * money changed hands in the original direction; a negative delta is treated
   * as money flowing back.
   */
  static recordPrincipalChange(
    kind: LendingKind,
    contact: string,
    delta: number,
    accountId: string,
    date?: string,
  ) {
    if (delta > 0) {
      const description = kind === 'lent' ? `Lent more to ${contact}` : `Borrowed more from ${contact}`
      return this.move(kind, 'principal', delta, accountId, description, date)
    }
    const description = kind === 'lent'
      ? `Lending reduced for ${contact}`
      : `Borrowing reduced for ${contact}`
    return this.move(kind, 'repayment', delta, accountId, description, date)
  }
}
