import {
  type AccountingKind,
  type Direction,
  type EnrichedTransaction,
} from '../types'

export interface AccountingContext {
  /**
   * True when the user's credit-card purchases are already tracked (a card
   * account exists in PennyFlow). Only then is a card bill payment excluded
   * from expenses — otherwise the purchases would never be counted at all.
   */
  cardPurchasesTracked: boolean
}

/**
 * Decides how a categorised transaction affects cash-flow maths. The category
 * is the single source of truth, so when the user corrects a category the
 * accounting treatment follows automatically.
 */
export function accountingFor(
  category: string,
  subcategory: string | undefined,
  direction: Direction,
  ctx: AccountingContext,
): AccountingKind {
  // Compare case-insensitively and accept both the engine's names and the app's
  // built-in ones ("Investment", "Transfer") so a user correction behaves the same.
  const c = category.trim().toLowerCase()
  if (c === 'investments' || c === 'investment') return 'investment'
  if (c === 'transfers' || c === 'transfer') return subcategory === 'Savings' ? 'savings_transfer' : 'transfer_own'
  if (c === 'credit card payments' || c === 'credit card payment') {
    if (direction === 'credit') return 'transfer_own'
    return ctx.cardPurchasesTracked ? 'card_bill_payment' : 'expense'
  }
  return direction === 'credit' ? 'income' : 'expense'
}

/** Kinds that must never be counted as income or expense. */
export function isExcludedFromCashFlow(kind: AccountingKind): boolean {
  return kind !== 'income' && kind !== 'expense'
}

const DAY = 24 * 60 * 60 * 1000
const REFUND_RE = /\bREFUND\b|\bREVERSAL\b|\bREVERSED\b|\bREV[-/ ]|\bCHARGEBACK\b|\bCANCEL(L)?ED\b|\bRETURN(ED)?\b/i

export interface ReconcileResult {
  /** fingerprint -> updates to apply */
  ownTransfer: Set<string>
  /** refund fingerprint -> original expense fingerprint */
  refundOf: Map<string, string | null>
}

/**
 * Cross-transaction reconciliation. Pure: it only looks at the given records.
 * The caller passes the new batch together with recent already-imported
 * records so a transfer whose two legs arrive in different syncs still pairs.
 *
 *  - Own-account transfers: a debit in one connected account and a credit of
 *    the same amount in a *different* connected account within 3 days.
 *    Matched one-to-one, closest in time first.
 *  - Refunds: a credit whose narration says refund/reversal. It is linked to
 *    the most recent earlier debit with the same merchant and an amount that
 *    is at least the refund (partial refunds allowed). With no match the
 *    refund is reported with `null` and left for review — it is never silently
 *    treated as salary-like income.
 */
export type Reconcilable = Pick<
  EnrichedTransaction,
  'fingerprint' | 'providerAccountRef' | 'amount' | 'direction' | 'timestamp' | 'narration'
> & { merchant: { name?: string } }

export function reconcile(txns: Reconcilable[]): ReconcileResult {
  const ownTransfer = new Set<string>()
  const refundOf = new Map<string, string | null>()

  const debits = txns.filter((t) => t.direction === 'debit')
  const credits = txns.filter((t) => t.direction === 'credit')
  const usedDebit = new Set<string>()

  // Own transfers
  const pairs: Array<{ d: Reconcilable; c: Reconcilable; gap: number }> = []
  for (const d of debits) {
    for (const c of credits) {
      if (d.providerAccountRef === c.providerAccountRef) continue
      if (Math.round(d.amount * 100) !== Math.round(c.amount * 100)) continue
      const gap = Math.abs(Date.parse(c.timestamp) - Date.parse(d.timestamp))
      if (gap <= 3 * DAY) pairs.push({ d, c, gap })
    }
  }
  pairs.sort((a, b) => a.gap - b.gap)
  const usedCredit = new Set<string>()
  for (const p of pairs) {
    if (usedDebit.has(p.d.fingerprint) || usedCredit.has(p.c.fingerprint)) continue
    usedDebit.add(p.d.fingerprint)
    usedCredit.add(p.c.fingerprint)
    ownTransfer.add(p.d.fingerprint)
    ownTransfer.add(p.c.fingerprint)
  }

  // Refunds
  for (const c of credits) {
    if (usedCredit.has(c.fingerprint)) continue
    if (!REFUND_RE.test(c.narration)) continue
    const name = c.merchant.name?.toLowerCase()
    const t = Date.parse(c.timestamp)
    let best: Reconcilable | undefined
    for (const d of debits) {
      if (usedDebit.has(d.fingerprint)) continue
      if (!name || d.merchant.name?.toLowerCase() !== name) continue
      const dt = Date.parse(d.timestamp)
      if (dt > t || t - dt > 90 * DAY) continue
      if (d.amount + 0.005 < c.amount) continue
      if (!best || dt > Date.parse(best.timestamp)) best = d
    }
    refundOf.set(c.fingerprint, best ? best.fingerprint : null)
  }

  return { ownTransfer, refundOf }
}
