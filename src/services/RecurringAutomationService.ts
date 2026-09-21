/**
 * RecurringAutomationService
 * Automates recurring transaction processing
 */

import { Transaction, Bill, db, generateUUID } from '@/db/schema'

export interface AutomationJob {
  id: string
  type: 'transaction' | 'bill'
  sourceId: string
  nextRunDate: string
  isActive: boolean
  createdAt: string
}

export class RecurringAutomationService {
  /**
   * Process due recurring transactions
   */
  static async processRecurringTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    const today = new Date().toISOString().split('T')[0]
    const created: Transaction[] = []

    const recurringTransactions = transactions.filter(tx => tx.isRecurring)

    for (const tx of recurringTransactions) {
      const nextDate = this.calculateNextOccurrence(tx.date, tx.recurrenceRule!)

      if (nextDate <= today && !transactions.some(t => t.id === tx.id && t.date === nextDate)) {
        const newTx: Transaction = {
          ...tx,
          id: generateUUID(),
          date: nextDate,
        }

        await db.transactions.add(newTx)
        created.push(newTx)
      }
    }

    return created
  }

  /**
   * Process due recurring bills
   */
  static async processRecurringBills(bills: Bill[]): Promise<Bill[]> {
    const today = new Date().toISOString().split('T')[0]
    const created: Bill[] = []

    const recurringBills = bills.filter(b => b.isRecurring && !b.isPaid)

    for (const bill of recurringBills) {
      const nextDate = this.calculateNextOccurrence(bill.dueDate, bill.recurrenceRule!)

      if (nextDate <= today) {
        const newBill: Bill = {
          ...bill,
          id: generateUUID(),
          dueDate: nextDate,
          isPaid: false,
        }

        await db.bills.add(newBill)
        created.push(newBill)
      }
    }

    return created
  }

  /**
   * Calculate next occurrence date
   */
  static calculateNextOccurrence(
    currentDate: string,
    recurrenceRule: 'weekly' | 'monthly' | 'yearly'
  ): string {
    const date = new Date(currentDate)

    switch (recurrenceRule) {
      case 'weekly':
        date.setDate(date.getDate() + 7)
        break
      case 'monthly':
        date.setMonth(date.getMonth() + 1)
        break
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1)
        break
    }

    return date.toISOString().split('T')[0]
  }

  /**
   * Auto-save toward goals
   */
  static async processAutoSave(amount: number, goalId: string): Promise<void> {
    const goal = await db.goals.get(goalId)

    if (goal && goal.autoSave && goal.autoSaveAmount) {
      const newAmount = Math.min(goal.targetAmount, goal.currentAmount + goal.autoSaveAmount)

      await db.goals.update(goalId, {
        currentAmount: newAmount,
      })
    }
  }

  /**
   * Get next automation job date
   */
  static getNextJobDate(
    currentDate: string,
    recurrenceRule: 'weekly' | 'monthly' | 'yearly'
  ): string {
    return this.calculateNextOccurrence(currentDate, recurrenceRule)
  }

  /**
   * Check if automation should run today
   */
  static shouldRunToday(
    lastRunDate: string | undefined,
    recurrenceRule: 'weekly' | 'monthly' | 'yearly'
  ): boolean {
    if (!lastRunDate) return true

    const last = new Date(lastRunDate)
    const today = new Date()

    switch (recurrenceRule) {
      case 'weekly':
        return (today.getTime() - last.getTime()) >= 7 * 24 * 60 * 60 * 1000
      case 'monthly':
        return today.getMonth() !== last.getMonth() || today.getFullYear() !== last.getFullYear()
      case 'yearly':
        return today.getFullYear() !== last.getFullYear()
    }
  }

  /**
   * Create automation job
   */
  static async createAutomationJob(
    type: 'transaction' | 'bill',
    sourceId: string,
    recurrenceRule: 'weekly' | 'monthly' | 'yearly'
  ): Promise<AutomationJob> {
    const now = new Date()
    const nextRunDate = this.calculateNextOccurrence(now.toISOString().split('T')[0], recurrenceRule)

    return {
      id: generateUUID(),
      type,
      sourceId,
      nextRunDate,
      isActive: true,
      createdAt: now.toISOString(),
    }
  }

  /**
   * Get overdue automations
   */
  static getOverdueJobs(jobs: AutomationJob[]): AutomationJob[] {
    const today = new Date().toISOString().split('T')[0]
    return jobs.filter(job => job.isActive && job.nextRunDate <= today)
  }

  /**
   * Update job run date after execution
   */
  static updateJobNextRun(
    job: AutomationJob,
    recurrenceRule: 'weekly' | 'monthly' | 'yearly'
  ): AutomationJob {
    return {
      ...job,
      nextRunDate: this.calculateNextOccurrence(job.nextRunDate, recurrenceRule),
    }
  }

  /**
   * Generate automation summary
   */
  static generateSummary(
    processedTransactions: Transaction[],
    processedBills: Bill[]
  ): string {
    const totalTransactionAmount = processedTransactions.reduce((sum, tx) => sum + tx.amount, 0)
    const totalBillAmount = processedBills.reduce((sum, bill) => sum + bill.amount, 0)

    return `
🤖 Automation Summary

Processed:
  📝 ${processedTransactions.length} recurring transactions (₹${totalTransactionAmount.toFixed(2)})
  📋 ${processedBills.length} recurring bills (₹${totalBillAmount.toFixed(2)})

Next Run: ${new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
    `.trim()
  }
}
