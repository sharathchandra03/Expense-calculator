/**
 * LendingService
 *
 * Turns lending/borrowing events into real money movements (ledger transaction
 * + account balance via MoneyMovementService) AND keeps a per-record history so
 * every borrower has a proper timeline of what was lent, repaid and changed.
 *
 *   Lent    : giving money out is an EXPENSE, getting it back is INCOME.
 *   Borrowed: receiving money is INCOME, paying it back is an EXPENSE.
 *
 * Always call these inside a Dexie transaction that includes
 * LendingService.TABLES so the record, history, transaction and balance all
 * succeed or fail together.
 */

import { db, generateUUID, type Lending, type LendingEntry, type LendingEntryKind } from '@/db/schema'
import { MoneyMovementService } from '@/services/MoneyMovementService'
import { formatCurrency } from '@/lib/utils'

export type LendingKind = 'lent' | 'borrowed'

export const LENDING_CATEGORY: Record<LendingKind, string> = {
  lent: 'Lending',
  borrowed: 'Borrowing',
}

type Direction = 'principal' | 'repayment'

/** Which way the money flows for each history entry kind. */
const DIRECTION: Record<LendingEntryKind, Direction> = {
  initial: 'principal',
  increase: 'principal',
  repayment: 'repayment',
  settlement: 'repayment',
  decrease: 'repayment',
}

const localYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const localHM = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const round2 = (n: number) => Math.round(n * 100) / 100

export interface LendingSummary {
  /** Everything lent/borrowed: original amount plus increases, minus reductions. */
  total: number
  /** Money paid back so far (repayments and the settlement). */
  repaid: number
  outstanding: number
  /** 0-100 */
  progress: number
  lastRepayment: LendingEntry | null
}

export class LendingService {
  /** Tables a surrounding db.transaction must include. */
  static get TABLES() {
    return [db.lending, db.accounts, db.assets, db.transactions, db.systemLogs]
  }

  /** Whether money leaves (expense) or arrives (income) for a given entry kind. */
  static entryTxnType(kind: LendingKind, entry: LendingEntryKind): 'income' | 'expense' {
    return this.txnType(kind, DIRECTION[entry])
  }

  static txnType(kind: LendingKind, direction: Direction): 'income' | 'expense' {
    const principalIsExpense = kind === 'lent'
    if (direction === 'principal') return principalIsExpense ? 'expense' : 'income'
    return principalIsExpense ? 'income' : 'expense'
  }

  /** Short sentence describing what will be recorded, for UI hints. */
  static describeImpact(kind: LendingKind, direction: Direction, amount: number): string {
    const type = this.txnType(kind, direction)
    return `Records ${formatCurrency(Math.abs(amount))} as ${type === 'expense' ? 'an expense' : 'income'} in "${LENDING_CATEGORY[kind]}".`
  }

  private static describe(kind: LendingKind, entry: LendingEntryKind, contact: string, note?: string): string {
    const base = {
      initial: kind === 'lent' ? `Lent to ${contact}` : `Borrowed from ${contact}`,
      increase: kind === 'lent' ? `Lent more to ${contact}` : `Borrowed more from ${contact}`,
      decrease: kind === 'lent' ? `Lending reduced for ${contact}` : `Borrowing reduced for ${contact}`,
      repayment: kind === 'lent' ? `Repayment received from ${contact}` : `Repaid to ${contact}`,
      settlement: kind === 'lent' ? `Settled with ${contact}` : `Settled with ${contact}`,
    }[entry]
    return note ? `${base} - ${note}` : base
  }

  /**
   * Record one event on a lending record: moves the money (when an account is
   * given), updates the outstanding principal / status, and appends a history
   * entry. Returns the new entry.
   */
  static async record(params: {
    recordId: string
    kind: LendingKind
    contact: string
    event: LendingEntryKind
    amount: number
    /** When set, a ledger transaction is created and this account's balance moves. */
    accountId?: string
    note?: string
    /** Extra fields to save on the record at the same time (name, rate, dates...). */
    patch?: Partial<Lending>
  }): Promise<LendingEntry> {
    const { recordId, kind, contact, event, accountId, note, patch } = params
    const amount = round2(Math.abs(params.amount))

    const rec = await db.lending.get(recordId)
    if (!rec) throw new Error('Lending record not found')

    // Outstanding principal after this event
    const current = Number(rec.amount) || 0
    let balanceAfter = current
    if (event === 'initial') balanceAfter = amount
    else if (event === 'increase') balanceAfter = round2(current + amount)
    else if (event === 'repayment' || event === 'decrease') balanceAfter = Math.max(0, round2(current - amount))
    else if (event === 'settlement') balanceAfter = 0

    let transactionId: string | undefined
    if (accountId && amount > 0) {
      const res = await MoneyMovementService.apply({
        accountId,
        type: this.entryTxnType(kind, event),
        amount,
        category: LENDING_CATEGORY[kind],
        description: this.describe(kind, event, contact, note),
        logType: 'lending',
        tags: ['lending'],
      })
      transactionId = res.transactionId
    }

    const now = new Date()
    const entry: LendingEntry = {
      id: generateUUID(),
      kind: event,
      date: localYMD(now),
      time: localHM(now),
      amount,
      balanceAfter,
      accountId,
      transactionId,
      note: note || undefined,
      createdAt: now.toISOString(),
    }

    const update: Partial<Lending> = { ...(patch ?? {}), history: [...(rec.history ?? []), entry] }
    if (event === 'settlement') {
      update.status = 'paid'
    } else if (event !== 'initial') {
      update.amount = balanceAfter
      update.status = balanceAfter <= 0 ? 'paid' : 'active'
    }
    await db.lending.update(recordId, update)
    return entry
  }

  /**
   * Remove a history entry: reverses its ledger transaction (restoring the
   * account balance) and puts the principal / status back. The starting entry
   * cannot be removed; delete the whole record instead.
   */
  static async removeEntry(recordId: string, entryId: string): Promise<void> {
    const rec = await db.lending.get(recordId)
    if (!rec) return
    const history = rec.history ?? []
    const entry = history.find(e => e.id === entryId)
    if (!entry || entry.kind === 'initial') return

    if (entry.transactionId) await MoneyMovementService.reverse(entry.transactionId)

    let amount = Number(rec.amount) || 0
    let status = rec.status
    if (entry.kind === 'repayment' || entry.kind === 'decrease') amount = round2(amount + entry.amount)
    else if (entry.kind === 'increase') amount = Math.max(0, round2(amount - entry.amount))
    if (entry.kind === 'settlement') status = 'active'
    else status = amount > 0 ? 'active' : status

    // Use the full timeline (so legacy records gain a real starting entry), minus the removed one.
    const remaining = this.timeline(rec)
      .filter(e => e.id !== entryId)
      .map(e => (e.id === 'derived-initial' ? { ...e, id: generateUUID() } : e))
    await db.lending.update(recordId, {
      amount,
      status,
      history: this.recomputeBalances(remaining),
    })
  }

  /** Re-derive each entry's running balance after a removal. */
  private static recomputeBalances(entries: LendingEntry[]): LendingEntry[] {
    const sorted = [...entries].sort((a, b) => {
      if (a.kind === 'initial' && b.kind !== 'initial') return -1
      if (b.kind === 'initial' && a.kind !== 'initial') return 1
      return a.createdAt.localeCompare(b.createdAt)
    })
    let balance = 0
    return sorted.map(e => {
      if (e.kind === 'initial') balance = e.amount
      else if (e.kind === 'increase') balance = round2(balance + e.amount)
      else if (e.kind === 'repayment' || e.kind === 'decrease') balance = Math.max(0, round2(balance - e.amount))
      else if (e.kind === 'settlement') balance = 0
      return { ...e, balanceAfter: balance }
    })
  }

  /**
   * Chronological history including a derived starting entry for records that
   * were created before history tracking existed.
   */
  static timeline(rec: Lending): LendingEntry[] {
    const entries = [...(rec.history ?? [])]
    if (!entries.some(e => e.kind === 'initial')) {
      const reduced = entries.filter(e => e.kind === 'repayment' || e.kind === 'decrease').reduce((s, e) => s + e.amount, 0)
      const increased = entries.filter(e => e.kind === 'increase').reduce((s, e) => s + e.amount, 0)
      const start = round2((Number(rec.amount) || 0) + reduced - increased)
      entries.push({
        id: 'derived-initial',
        kind: 'initial',
        date: (rec.createdAt || '').slice(0, 10),
        amount: Math.max(0, start),
        balanceAfter: Math.max(0, start),
        createdAt: rec.createdAt || '',
      })
    }
    return entries.sort((a, b) => {
      if (a.kind === 'initial' && b.kind !== 'initial') return -1
      if (b.kind === 'initial' && a.kind !== 'initial') return 1
      return a.createdAt.localeCompare(b.createdAt)
    })
  }

  static summarize(rec: Lending): LendingSummary {
    const entries = this.timeline(rec)
    const sum = (kinds: LendingEntryKind[]) =>
      entries.filter(e => kinds.includes(e.kind)).reduce((s, e) => s + e.amount, 0)
    const total = Math.max(0, round2(sum(['initial', 'increase']) - sum(['decrease'])))
    const repaid = round2(sum(['repayment', 'settlement']))
    const outstanding = rec.status === 'paid' ? 0 : Number(rec.amount) || 0
    const progress = rec.status === 'paid' ? 100 : total > 0 ? Math.min(100, (repaid / total) * 100) : 0
    const lastRepayment = [...entries].reverse().find(e => e.kind === 'repayment' || e.kind === 'settlement') ?? null
    return { total, repaid, outstanding, progress, lastRepayment }
  }
}
