/**
 * ImportService
 *
 * Turns provider data into PennyFlow records, idempotently.
 *
 *   FetchDataResult ──processBatch──▶ ImportedTransaction (original + auto classification)
 *                                         │  + TransactionOverride (user changes, separate)
 *                                         ▼
 *                                  Transaction (ledger mirror, income/expense only)
 *
 * Invariants
 *  - Re-importing the same data never creates a second record: the primary key
 *    of an ImportedTransaction is its deterministic fingerprint.
 *  - Imported rows never touch an account balance. The bank's reported balance
 *    is authoritative and is written directly from the provider data.
 *  - Money that is not income/expense (own-account transfers, card bill
 *    payments, investments, savings transfers, matched refunds) is kept in
 *    importedTransactions but gets no ledger row, so cash-flow totals do not
 *    double count it.
 *  - Original narration is never modified.
 */
import {
  db,
  generateUUID,
  syncAccountToAsset,
  type Account,
  type FinancialConnection,
  type ImportedTransaction,
  type Transaction,
  type TransactionOverride,
} from '@/db/schema'
import { accountingFor, reconcile, type Reconcilable } from '@/lib/fin/engine/accounting'
import { type CategoryHistory } from '@/lib/fin/engine/categorize'
import { preferenceKey } from '@/lib/fin/engine/merchant'
import { processBatch } from '@/lib/fin/engine/pipeline'
import { toAppCategory } from '@/lib/fin/app-categories'
import { isExcludedFromCashFlow } from '@/lib/fin/engine/accounting'
import type { AccountingKind, FetchDataResult } from '@/lib/fin/types'

export interface IngestResult {
  fetched: number
  inserted: number
  skipped: number
  accountsLinked: number
}

const LEDGER_PREFIX = 'imp_'
export const ledgerIdFor = (importedId: string) => `${LEDGER_PREFIX}${importedId}`

const pad = (n: number) => String(n).padStart(2, '0')
/** Local calendar date/time of an instant, in the user's timezone. */
function localParts(iso: string) {
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

async function cardPurchasesTracked(): Promise<boolean> {
  return (await db.accounts.where('type').equals('card').count()) > 0
}

async function buildHistory(): Promise<CategoryHistory> {
  const [rows, overrides] = await Promise.all([db.importedTransactions.toArray(), db.transactionOverrides.toArray()])
  const ovById = new Map(overrides.map((o) => [o.id, o]))
  const history: CategoryHistory = new Map()
  for (const r of rows) {
    const ov = ovById.get(r.id)
    const category = ov?.category ?? (r.confidence >= 0.8 ? r.category : undefined)
    const key = preferenceKey({ name: r.merchantName, vpa: r.merchantVpa })
    if (!category || !key) continue
    const counts = history.get(key) ?? new Map<string, number>()
    counts.set(category, (counts.get(category) ?? 0) + 1)
    history.set(key, counts)
  }
  return history
}

export class ImportService {
  // -------------------------------------------------------------------------
  // Ingest
  // -------------------------------------------------------------------------

  static async ingest(conn: FinancialConnection, data: FetchDataResult): Promise<IngestResult> {
    const startedAt = new Date().toISOString()
    const accountKeys = new Map<string, string>()
    let accountsLinked = 0

    const prefs = new Map((await db.classificationPrefs.toArray()).map((p) => [p.id, p.category] as const))
    const history = await buildHistory()
    const tracked = await cardPurchasesTracked()

    let result: IngestResult = { fetched: data.transactions.length, inserted: 0, skipped: 0, accountsLinked: 0 }

    await db.transaction(
      'rw',
      [db.linkedAccounts, db.accounts, db.assets, db.importedTransactions, db.transactionOverrides, db.transactions, db.syncHistory, db.financialConnections],
      async () => {
        // 1) Accounts ------------------------------------------------------
        for (const a of data.accounts) {
          if (a.fiType !== 'DEPOSIT') continue // investments are handled by the investment importer
          let linked = await db.linkedAccounts
            .where('providerAccountRef')
            .equals(a.providerAccountRef)
            .filter((l) => l.consentId === conn.id)
            .first()
          const name = `${a.institutionName} ${a.maskedNumber}`
          if (!linked) {
            // After a cloud restore the mirrored Account can exist without its link
            // record (links are device-local): reuse it instead of creating a duplicate.
            const reusable = await db.accounts.filter((x) => x.name === name && !!x.maskedNumber).first()
            const accountId = reusable?.id ?? generateUUID()
            const today = new Date().toISOString().split('T')[0]
            const balance = a.currentBalance ?? 0
            if (!reusable) {
              await db.accounts.add({
                id: accountId,
                name,
                type: 'bank',
                balance,
                currency: a.currency,
                balanceHistory: [{ date: today, balance }],
                maskedNumber: a.maskedNumber,
                isSimulated: conn.simulated,
              } as Account)
            }
            if (!(await db.assets.where('name').equalsIgnoreCase(name).first())) {
              await db.assets.add({ id: generateUUID(), name, type: 'bank', balance, valuationHistory: [{ date: today, value: balance }] })
            }
            linked = {
              id: generateUUID(),
              consentId: conn.id,
              providerAccountRef: a.providerAccountRef,
              fiType: a.fiType,
              institutionName: a.institutionName,
              accountType: a.accountType,
              maskedNumber: a.maskedNumber,
              holderName: a.holderName,
              balance: a.currentBalance,
              balanceAsOf: a.balanceAsOf,
              currency: a.currency,
              localAccountId: accountId,
              isSimulated: conn.simulated,
              createdAt: new Date().toISOString(),
              lastSyncAt: data.fetchedAt,
            }
            await db.linkedAccounts.add(linked)
            await db.accounts.update(accountId, { linkedAccountId: linked.id })
            accountsLinked++
          } else if (a.currentBalance !== undefined && (!linked.balanceAsOf || (a.balanceAsOf ?? '') >= linked.balanceAsOf)) {
            // The bank's balance is authoritative; ignore stale snapshots.
            const acc = await db.accounts.get(linked.localAccountId)
            if (acc) {
              const today = new Date().toISOString().split('T')[0]
              const hist = Array.isArray(acc.balanceHistory) ? [...acc.balanceHistory] : []
              const i = hist.findIndex((h) => h.date === today)
              if (i >= 0) hist[i] = { date: today, balance: a.currentBalance }
              else hist.push({ date: today, balance: a.currentBalance })
              await db.accounts.update(acc.id, { balance: a.currentBalance, balanceHistory: hist })
              await syncAccountToAsset(acc.name, a.currentBalance)
            }
            await db.linkedAccounts.update(linked.id, { balance: a.currentBalance, balanceAsOf: a.balanceAsOf, lastSyncAt: data.fetchedAt })
          } else {
            await db.linkedAccounts.update(linked.id, { lastSyncAt: data.fetchedAt })
          }
          accountKeys.set(a.providerAccountRef, linked.id)
        }

        // 2) Transactions --------------------------------------------------
        const known = data.transactions.filter((t) => accountKeys.has(t.providerAccountRef))
        const { enriched, refundOf } = processBatch(known, accountKeys, { prefs, history, cardPurchasesTracked: tracked })

        const existing = await db.importedTransactions.bulkGet(enriched.map((e) => e.fingerprint))
        const importedAt = new Date().toISOString()
        const fresh: ImportedTransaction[] = []
        enriched.forEach((e, i) => {
          if (existing[i]) return
          fresh.push({
            id: e.fingerprint,
            consentId: conn.id,
            linkedAccountId: accountKeys.get(e.providerAccountRef)!,
            providerAccountRef: e.providerAccountRef,
            txnId: e.txnId,
            reference: e.reference,
            amount: e.amount,
            direction: e.direction,
            timestamp: e.timestamp,
            date: localParts(e.timestamp).date,
            narration: e.narration,
            mode: e.mode,
            upiRef: e.upiRef,
            merchantName: e.merchant.name,
            merchantVpa: e.merchant.vpa,
            counterpartyType: e.merchant.counterpartyType,
            balanceAfter: e.balanceAfter,
            category: e.classification.category,
            subcategory: e.classification.subcategory,
            confidence: e.classification.confidence,
            categorySource: e.classification.source,
            needsReview: e.classification.needsReview,
            accounting: e.accounting,
            refundOf: refundOf.get(e.fingerprint) ?? undefined,
            isSimulated: conn.simulated,
            importedAt,
          })
        })
        // put (not add): even a concurrent duplicate run cannot throw or double-insert.
        if (fresh.length) await db.importedTransactions.bulkPut(fresh)

        const touched = new Set(fresh.map((f) => f.id))
        const changed = await ImportService.reconcileRecent()
        changed.forEach((id) => touched.add(id))
        await ImportService.applyLedger([...touched], tracked)

        result = { fetched: data.transactions.length, inserted: fresh.length, skipped: enriched.length - fresh.length, accountsLinked }

        await db.syncHistory.add({
          id: generateUUID(),
          consentId: conn.id,
          startedAt,
          finishedAt: new Date().toISOString(),
          state: 'success',
          fetched: result.fetched,
          inserted: result.inserted,
          skipped: result.skipped,
        })
      },
    )
    return result
  }

  static async recordFailure(consentId: string, startedAt: string, error: string) {
    await db.syncHistory.add({
      id: generateUUID(),
      consentId,
      startedAt,
      finishedAt: new Date().toISOString(),
      state: 'failed',
      fetched: 0,
      inserted: 0,
      skipped: 0,
      error,
    })
  }

  // -------------------------------------------------------------------------
  // Cross-sync reconciliation (own transfers, refunds)
  // -------------------------------------------------------------------------

  /** Re-pairs recent records so transfer legs / refunds that arrive in different syncs still match. */
  static async reconcileRecent(days = 120): Promise<string[]> {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const [rows, overrides] = await Promise.all([
      db.importedTransactions.where('timestamp').aboveOrEqual(since).toArray(),
      db.transactionOverrides.toArray(),
    ])
    const overridden = new Set(overrides.filter((o) => o.category || o.hidden).map((o) => o.id))
    const items: Reconcilable[] = rows
      .filter((r) => !overridden.has(r.id) && r.categorySource !== 'user_preference')
      .map((r) => ({
        fingerprint: r.id,
        providerAccountRef: r.linkedAccountId,
        amount: r.amount,
        direction: r.direction,
        timestamp: r.timestamp,
        narration: r.narration,
        merchant: { name: r.merchantName },
      }))
    const { ownTransfer, refundOf } = reconcile(items)
    const changed: string[] = []
    const byId = new Map(rows.map((r) => [r.id, r]))

    for (const id of ownTransfer) {
      const r = byId.get(id)
      if (!r || r.accounting === 'transfer_own') continue
      await db.importedTransactions.update(id, { category: 'Transfers', subcategory: undefined, accounting: 'transfer_own', confidence: 0.9, categorySource: 'narration_rules', needsReview: false })
      changed.push(id)
    }
    for (const [id, origin] of refundOf) {
      const r = byId.get(id)
      if (!r) continue
      if (origin && r.accounting !== 'refund') {
        await db.importedTransactions.update(id, { category: 'Refund', subcategory: undefined, accounting: 'refund', refundOf: origin, confidence: 0.9, categorySource: 'narration_rules', needsReview: false })
        changed.push(id, origin)
      } else if (!origin && r.accounting !== 'refund' && r.subcategory !== 'Unmatched refund') {
        await db.importedTransactions.update(id, { category: 'Other Income', subcategory: 'Unmatched refund', accounting: 'income', confidence: 0.45, categorySource: 'narration_rules', needsReview: true })
        changed.push(id)
      }
    }
    return changed
  }

  // -------------------------------------------------------------------------
  // Ledger mirror
  // -------------------------------------------------------------------------

  private static effective(
    row: ImportedTransaction,
    ov: TransactionOverride | undefined,
    tracked: boolean,
  ): { hidden: boolean; kind: AccountingKind; category: string } {
    if (ov?.hidden) return { hidden: true, kind: 'unknown', category: row.category }
    if (ov?.category) {
      return { hidden: false, kind: accountingFor(ov.category, ov.subcategory, row.direction, { cardPurchasesTracked: tracked }), category: ov.category }
    }
    return { hidden: false, kind: row.accounting as AccountingKind, category: toAppCategory(row.category) }
  }

  /** Creates / updates / removes the ledger rows for the given imported ids. */
  static async applyLedger(ids: string[], tracked?: boolean): Promise<void> {
    if (ids.length === 0) return
    const isTracked = tracked ?? (await cardPurchasesTracked())
    const rows = (await db.importedTransactions.bulkGet([...new Set(ids)])).filter((r): r is ImportedTransaction => !!r)

    // Refunds reduce the expense they reverse.
    const refunds = await db.importedTransactions.where('accounting').equals('refund').toArray()
    const refundTotals = new Map<string, number>()
    for (const r of refunds) if (r.refundOf) refundTotals.set(r.refundOf, (refundTotals.get(r.refundOf) ?? 0) + r.amount)

    const overrides = new Map((await db.transactionOverrides.bulkGet(rows.map((r) => r.id))).filter(Boolean).map((o) => [o!.id, o!]))
    const linked = new Map((await db.linkedAccounts.toArray()).map((l) => [l.id, l]))

    for (const row of rows) {
      const ledgerId = ledgerIdFor(row.id)
      const existing = await db.transactions.get(ledgerId)
      const eff = ImportService.effective(row, overrides.get(row.id), isTracked)

      const countable = !eff.hidden && !isExcludedFromCashFlow(eff.kind)
      const net = row.direction === 'debit' ? Math.max(0, Math.round((row.amount - (refundTotals.get(row.id) ?? 0)) * 100) / 100) : row.amount
      if (!countable || net <= 0) {
        if (existing) await db.transactions.delete(ledgerId)
        continue
      }
      const account = linked.get(row.linkedAccountId)
      if (!account) continue
      const type: Transaction['type'] = row.direction === 'debit' ? 'expense' : 'income'

      if (existing) {
        await db.transactions.update(ledgerId, { type, category: eff.category, amount: net, confidence: row.confidence, paymentMode: row.mode })
      } else {
        const { date, time } = localParts(row.timestamp)
        await db.transactions.add({
          id: ledgerId,
          date,
          time,
          type,
          category: eff.category,
          amount: net,
          accountId: account.localAccountId,
          description: row.merchantName ?? row.narration.slice(0, 60),
          notes: row.narration,
          isRecurring: false,
          source: 'imported',
          importedId: row.id,
          paymentMode: row.mode,
          confidence: row.confidence,
          isSimulated: row.isSimulated,
        })
      }
    }
  }

  // -------------------------------------------------------------------------
  // User corrections (learning)
  // -------------------------------------------------------------------------

  /**
   * Records the user's category for an imported transaction and learns it for
   * the counterparty. Other *pending review* transactions from the same
   * counterparty are updated too. Returns how many others were updated.
   */
  static async setUserCategory(importedId: string, category: string): Promise<number> {
    let similar = 0
    await db.transaction('rw', [db.importedTransactions, db.transactionOverrides, db.classificationPrefs, db.transactions, db.accounts, db.linkedAccounts], async () => {
      const row = await db.importedTransactions.get(importedId)
      if (!row) return
      const now = new Date().toISOString()
      const touched = [importedId]
      await db.transactionOverrides.put({ ...(await db.transactionOverrides.get(importedId)), id: importedId, category, updatedAt: now })

      const key = preferenceKey({ name: row.merchantName, vpa: row.merchantVpa })
      if (key) {
        await db.classificationPrefs.put({ id: key, category, updatedAt: now })
        const pending = await db.importedTransactions.filter((r) => r.id !== importedId && r.needsReview && preferenceKey({ name: r.merchantName, vpa: r.merchantVpa }) === key).toArray()
        for (const p of pending) {
          const ov = await db.transactionOverrides.get(p.id)
          if (ov?.category || ov?.hidden) continue
          await db.transactionOverrides.put({ id: p.id, category, updatedAt: now })
          touched.push(p.id)
          similar++
        }
      }
      await ImportService.applyLedger(touched)
    })
    return similar
  }

  /** User removed an imported entry from the ledger: remember it so a later sync does not bring it back. */
  static async hide(importedId: string): Promise<void> {
    await db.transactionOverrides.put({ ...(await db.transactionOverrides.get(importedId)), id: importedId, hidden: true, updatedAt: new Date().toISOString() })
  }

  static async unhide(importedId: string): Promise<void> {
    const ov = await db.transactionOverrides.get(importedId)
    if (!ov) return
    if (ov.category) await db.transactionOverrides.put({ ...ov, hidden: false, updatedAt: new Date().toISOString() })
    else await db.transactionOverrides.delete(importedId)
  }

  /** Imported transactions awaiting a decision (low confidence / unknown) and not yet corrected. */
  static async reviewQueue(): Promise<ImportedTransaction[]> {
    const overrides = await db.transactionOverrides.toArray()
    const done = new Set(overrides.filter((o) => o.category || o.hidden).map((o) => o.id))
    const all = await db.importedTransactions.filter((r) => r.needsReview && !done.has(r.id)).toArray()
    return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------

  /**
   * Local side of disconnecting. Without `deleteData` everything imported so
   * far is kept (history stays readable) and only the live link is dropped.
   * With `deleteData` all imported records for the connection are removed;
   * the mirrored account is removed only if no manual transactions use it.
   */
  static async removeConnectionData(consentId: string, deleteData: boolean): Promise<void> {
    if (!deleteData) return
    await db.transaction(
      'rw',
      [db.importedTransactions, db.transactionOverrides, db.transactions, db.linkedAccounts, db.accounts, db.assets, db.syncHistory, db.financialConnections],
      async () => {
        const imported = await db.importedTransactions.where('consentId').equals(consentId).toArray()
        const ids = imported.map((r) => r.id)
        await db.transactions.bulkDelete(ids.map(ledgerIdFor))
        await db.transactionOverrides.bulkDelete(ids)
        await db.importedTransactions.bulkDelete(ids)
        const linked = await db.linkedAccounts.where('consentId').equals(consentId).toArray()
        for (const l of linked) {
          const stillUsed = await db.transactions.where('accountId').equals(l.localAccountId).count()
          const acc = await db.accounts.get(l.localAccountId)
          if (acc && stillUsed === 0) {
            await db.accounts.delete(acc.id)
            const asset = await db.assets.where('name').equalsIgnoreCase(acc.name).first()
            if (asset) await db.assets.delete(asset.id)
          } else if (acc) {
            await db.accounts.update(acc.id, { linkedAccountId: undefined, isSimulated: undefined })
          }
        }
        await db.linkedAccounts.where('consentId').equals(consentId).delete()
        await db.syncHistory.where('consentId').equals(consentId).delete()
        await db.financialConnections.delete(consentId)
      },
    )
  }
}
