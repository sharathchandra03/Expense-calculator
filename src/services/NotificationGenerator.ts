/**
 * NotificationGenerator
 *
 * Scans the local database for conditions that warrant a notification
 * (bills due/overdue, budgets in warning/exceeded, goal milestones) and
 * persists them into `db.notifications`.
 *
 * The NotificationService builds notification objects but nothing previously
 * wrote them to the DB — this generator is the missing bridge. It is designed
 * to be safe to call repeatedly (e.g. on every app load): each notification
 * gets a DETERMINISTIC id derived from what it's about plus a time bucket, so
 * re-running the same day updates the same row via `put` rather than creating
 * duplicates.
 */

import { db, generateUUID } from '@/db/schema'
import type { Notification } from '@/db/schema'
import { BudgetManagementService } from '@/services/BudgetManagementService'

// How many days ahead of a bill's due date we start reminding.
const BILL_REMINDER_WINDOW_DAYS = 3

function todayBucket(): string {
  return new Date().toISOString().split('T')[0] // YYYY-MM-DD
}

/**
 * Stable id so the same logical alert reuses one row instead of piling up.
 * e.g. "bill_due:<billId>:2026-09-21"
 */
function stableId(kind: string, entityId: string, bucket: string): string {
  return `${kind}:${entityId}:${bucket}`
}

async function upsertNotification(n: Notification): Promise<boolean> {
  // Preserve the read flag if this exact notification already exists,
  // so we don't mark something unread again on re-scan.
  const existing = await db.notifications.get(n.id)
  if (existing) {
    // Nothing meaningful changed — keep the user's read state, don't churn.
    return false
  }
  await db.notifications.put(n)
  return true
}

export class NotificationGenerator {
  /**
   * Run all generators. Returns the number of NEW notifications created.
   * Never throws — notification generation must never break app startup.
   */
  static async generateAll(): Promise<number> {
    try {
      const notificationsEnabled = (typeof localStorage !== 'undefined'
        ? localStorage.getItem('finance-os-notifications')
        : 'true') !== 'false'
      if (!notificationsEnabled) return 0

      const results = await Promise.all([
        this.generateBillReminders(),
        this.generateBudgetAlerts(),
        this.generateGoalMilestones(),
      ])
      return results.reduce((a, b) => a + b, 0)
    } catch {
      return 0
    }
  }

  /**
   * Bills that are unpaid and either overdue or due within the reminder window.
   */
  static async generateBillReminders(): Promise<number> {
    const bucket = todayBucket()
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const bills = await db.bills.filter(b => !b.isPaid).toArray()
    let created = 0

    for (const bill of bills) {
      const due = new Date(bill.dueDate + 'T00:00:00')
      if (isNaN(due.getTime())) continue

      const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntilDue > BILL_REMINDER_WINDOW_DAYS) continue // not due soon yet

      let title = '📋 Bill Due Soon'
      let message = `${bill.title} is due in ${daysUntilDue} days`
      if (daysUntilDue <= 0) {
        title = '🚨 Bill Overdue'
        message =
          daysUntilDue === 0
            ? `${bill.title} is due today`
            : `${bill.title} is overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'}`
      } else if (daysUntilDue === 1) {
        title = '⚠️ Bill Due Tomorrow'
        message = `${bill.title} is due tomorrow`
      }

      const notification: Notification = {
        id: stableId('bill_due', bill.id, bucket),
        type: 'bill_due',
        title,
        message,
        read: false,
        timestamp: new Date().toISOString(),
        actionUrl: '/bills',
      }
      if (await upsertNotification(notification)) created++
    }

    return created
  }

  /**
   * Budgets currently in warning or exceeded state (uses the rolled-forward
   * current-period spend from BudgetManagementService).
   */
  static async generateBudgetAlerts(): Promise<number> {
    const bucket = todayBucket()
    const [budgets, transactions] = await Promise.all([
      db.budgets.toArray(),
      db.transactions.toArray(),
    ])

    const alerts = BudgetManagementService.getBudgetAlerts(budgets, transactions)
    let created = 0

    for (const alert of alerts) {
      const isExceeded = alert.status === 'exceeded'
      const notification: Notification = {
        // Bucket by period-status so a budget flipping warning→exceeded creates
        // a distinct (new) alert rather than being silently swallowed.
        id: stableId(`budget_${alert.status}`, alert.budgetId, bucket),
        type: 'budget_warning',
        title: isExceeded
          ? `🚨 Budget Exceeded: ${alert.category}`
          : `⚠️ Budget Alert: ${alert.category}`,
        message: isExceeded
          ? `You've exceeded your ${alert.category} budget (spent ${alert.percentUsed}% of the limit)`
          : `You've used ${alert.percentUsed}% of your ${alert.category} budget`,
        read: false,
        timestamp: new Date().toISOString(),
        actionUrl: '/budgets',
      }
      if (await upsertNotification(notification)) created++
    }

    return created
  }

  /**
   * Goals crossing a 25/50/75/100% progress threshold.
   */
  static async generateGoalMilestones(): Promise<number> {
    const goals = await db.goals.toArray()
    let created = 0

    for (const goal of goals) {
      if (!goal.targetAmount || goal.targetAmount <= 0) continue
      const percent = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))

      // Find the highest milestone threshold the goal has crossed.
      const thresholds = [100, 75, 50, 25]
      const crossed = thresholds.find(t => percent >= t)
      if (!crossed) continue

      // Bucket by the milestone itself so each threshold notifies once
      // (persists across days until the user hits the next threshold).
      const notification: Notification = {
        id: stableId(`goal_${crossed}`, goal.id, 'milestone'),
        type: 'goal_progress',
        title:
          crossed === 100
            ? `🎉 Goal Reached: ${goal.title}`
            : `🎯 Goal Progress: ${goal.title}`,
        message:
          crossed === 100
            ? `You've fully funded "${goal.title}"! 🎉`
            : `You're ${percent}% of the way to "${goal.title}"`,
        read: false,
        timestamp: new Date().toISOString(),
        actionUrl: '/goals',
      }
      if (await upsertNotification(notification)) created++
    }

    return created
  }

  /**
   * Log an arbitrary system notification (kept generic for callers).
   */
  static async pushSystem(title: string, message: string): Promise<void> {
    await db.notifications.put({
      id: generateUUID(),
      type: 'system',
      title,
      message,
      read: false,
      timestamp: new Date().toISOString(),
    })
  }
}
