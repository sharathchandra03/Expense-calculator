/**
 * MoneyMovementService
 *
 * Single source of truth for moving real money in response to a feature action
 * (a goal contribution, a debt payment, etc). Every caller gets the SAME,
 * correct side-effects, atomically, inside one Dexie transaction:
 *
 *   1. Account balance is adjusted
 *   2. The change is mirrored to the Assets table (syncAccountToAsset)
 *   3. A Transaction row is created so it shows up in the ledger & analytics
 *   4. A SystemLog entry is written for the timeline
 *   5. The last-used account is remembered for smart defaults
 *
 * This is what makes Goals / Debt Planner "connected to real money" instead of
 * being isolated counters. Keeping it in one place means the logic can't drift
 * between modules.
 */

import Dexie from 'dexie'
import { db, Transaction, generateUUID, syncAccountToAsset, SystemLog } from '@/db/schema'
import { SmartDefaultsService } from '@/services/SmartDefaultsService'

export interface MoneyMovement {
  /** Account to move money to/from. */
  accountId: string
  /** 'expense' debits the account, 'income' credits it. */
  type: 'income' | 'expense'
  /** Always a positive magnitude. */
  amount: number
  /** Ledger category, e.g. 'Savings', 'Debt Payment'. */
  category: string
  /** Human description shown in the ledger. */
  description: string
  /** Timeline log type. */
  logType: SystemLog['type']
  /** Optional explicit date (YYYY-MM-DD). Defaults to today. */
  date?: string
  /** Optional tags to attach to the created transaction. */
  tags?: string[]
}

export interface MoneyMovementResult {
  transactionId: string
  newBalance: number
}

export class MoneyMovementService {
  /**
   * Apply a money movement atomically. MUST be called inside a surrounding
   * `db.transaction('rw', ...)` OR will open its own if not already in one.
   *
   * Returns the created transaction id + the account's new balance so callers
   * can store a back-reference (e.g. on a goal contribution / debt payment).
   */
  static async apply(movement: MoneyMovement): Promise<MoneyMovementResult> {
    const run = async (): Promise<MoneyMovementResult> => {
      const account = await db.accounts.get(movement.accountId)
      if (!account) {
        throw new Error(`MoneyMovementService: account ${movement.accountId} not found`)
      }

      const magnitude = Math.abs(movement.amount)
      const delta = movement.type === 'expense' ? -magnitude : magnitude
      const newBalance = account.balance + delta

      await db.accounts.update(account.id, { balance: newBalance })
      await syncAccountToAsset(account.name, newBalance)

      const transactionId = generateUUID()
      const txn: Transaction = {
        id: transactionId,
        date: movement.date || new Date().toISOString().split('T')[0],
        type: movement.type,
        category: movement.category,
        amount: magnitude,
        accountId: account.id,
        description: movement.description,
        isRecurring: false,
        tags: movement.tags,
      }
      await db.transactions.add(txn)

      await db.systemLogs.add({
        id: generateUUID(),
        timestamp: new Date().toISOString(),
        type: movement.logType,
        description: movement.description,
        amount: delta,
      })

      SmartDefaultsService.setLastUsedAccount(account.id)

      return { transactionId, newBalance }
    }

    // If we're already inside a Dexie transaction, just run; otherwise wrap.
    if (Dexie.currentTransaction) {
      return run()
    }
    return db.transaction(
      'rw',
      [db.accounts, db.assets, db.transactions, db.systemLogs],
      run
    )
  }

  /**
   * Reverse a previously-created money movement (used for undo). Removes the
   * transaction and restores the account balance. Safe if the transaction was
   * already deleted.
   */
  static async reverse(transactionId: string): Promise<void> {
    const run = async () => {
      const txn = await db.transactions.get(transactionId)
      if (!txn) return
      const account = await db.accounts.get(txn.accountId)
      if (account) {
        // Undo the original delta: an expense had subtracted, so add back.
        const restore = txn.type === 'expense' ? account.balance + txn.amount : account.balance - txn.amount
        await db.accounts.update(account.id, { balance: restore })
        await syncAccountToAsset(account.name, restore)
      }
      await db.transactions.delete(transactionId)
    }

    if (Dexie.currentTransaction) {
      return run()
    }
    return db.transaction(
      'rw',
      [db.accounts, db.assets, db.transactions],
      run
    )
  }
}
