import type { EnrichedTransaction, RawTransaction } from '../types'
import { accountingFor, reconcile, type AccountingContext } from './accounting'
import { classify, type CategoryHistory } from './categorize'
import { assignFingerprints } from './fingerprint'
import { extractUpiRef, identifyMerchant } from './merchant'
import { detectMode } from './mode'

export interface PipelineContext extends AccountingContext {
  /** merchant/VPA key -> category learned from user corrections */
  prefs: Map<string, string>
  history?: CategoryHistory
}

export interface PipelineOutput {
  enriched: EnrichedTransaction[]
  /** refund fingerprint -> original expense fingerprint (null = no match found) */
  refundOf: Map<string, string | null>
}

/**
 * Raw provider transactions -> enriched transactions.
 *
 * `accountKeys` maps the provider's account reference to our internal linked
 * account id, which is what fingerprints are scoped by.
 */
export function processBatch(
  raws: RawTransaction[],
  accountKeys: Map<string, string>,
  ctx: PipelineContext,
): PipelineOutput {
  // Stable order => stable occurrence indexes => idempotent fingerprints.
  const sorted = [...raws].sort(
    (a, b) =>
      a.timestamp.localeCompare(b.timestamp) ||
      (a.txnId ?? '').localeCompare(b.txnId ?? '') ||
      a.narration.localeCompare(b.narration) ||
      a.amount - b.amount,
  )

  const byAccount = new Map<string, RawTransaction[]>()
  for (const r of sorted) {
    const list = byAccount.get(r.providerAccountRef) ?? []
    list.push(r)
    byAccount.set(r.providerAccountRef, list)
  }

  const enriched: EnrichedTransaction[] = []
  for (const [ref, list] of byAccount) {
    const accountKey = accountKeys.get(ref) ?? ref
    const prints = assignFingerprints(accountKey, list)
    list.forEach((r, i) => {
      const amount = Math.round(r.amount * 100) / 100
      const mode = detectMode(r.narration, r.modeHint)
      const merchant = identifyMerchant(r.narration, mode)
      const classification = classify({ narration: r.narration, direction: r.direction, mode, merchant }, ctx.prefs, ctx.history)
      enriched.push({
        fingerprint: prints[i],
        providerAccountRef: ref,
        txnId: r.txnId,
        reference: r.reference,
        amount,
        direction: r.direction,
        timestamp: new Date(r.timestamp).toISOString(),
        narration: r.narration,
        mode,
        upiRef: mode === 'UPI' ? extractUpiRef(r.narration) : undefined,
        merchant,
        classification,
        accounting: accountingFor(classification.category, classification.subcategory, r.direction, ctx),
        balanceAfter: r.balanceAfter,
      })
    })
  }

  const { ownTransfer, refundOf } = reconcile(enriched)
  for (const t of enriched) {
    if (ownTransfer.has(t.fingerprint)) {
      t.accounting = 'transfer_own'
      t.classification = { category: 'Transfers', confidence: 0.9, source: 'narration_rules', needsReview: false }
    } else if (refundOf.has(t.fingerprint)) {
      const matched = refundOf.get(t.fingerprint) !== null
      t.accounting = matched ? 'refund' : 'income'
      t.classification = {
        category: matched ? 'Refund' : 'Other Income',
        subcategory: matched ? undefined : 'Unmatched refund',
        confidence: matched ? 0.9 : 0.45,
        source: 'narration_rules',
        needsReview: !matched,
      }
    }
  }

  return { enriched, refundOf }
}
