/**
 * NotificationService
 * Manages in-app notifications and alerts
 */

import { Bill, Budget, Goal, Notification } from '@/db/schema'

export class NotificationService {
  /**
   * Create bill due notification
   */
  static createBillDueNotification(bill: Bill): Notification {
    const daysUntilDue = Math.ceil(
      (new Date(bill.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    )

    let title = '📋 Bill Due Soon'
    let message = `${bill.title} is due in ${daysUntilDue} days`

    if (daysUntilDue <= 0) {
      title = '🚨 Bill Overdue'
      message = `${bill.title} is overdue! Due ${Math.abs(daysUntilDue)} days ago`
    } else if (daysUntilDue === 1) {
      title = '⚠️ Bill Due Tomorrow'
      message = `${bill.title} is due tomorrow - ${bill.amount}`
    }

    return {
      id: Math.random().toString(36).substring(2),
      type: 'bill_due',
      title,
      message,
      read: false,
      timestamp: new Date().toISOString(),
      actionUrl: '/bills',
    }
  }

  /**
   * Create budget warning notification
   */
  static createBudgetWarningNotification(
    budget: Budget,
    percentUsed: number,
    spent: number
  ): Notification {
    return {
      id: Math.random().toString(36).substring(2),
      type: 'budget_warning',
      title: `⚠️ Budget Alert: ${budget.category}`,
      message: `You've spent ${percentUsed}% of your ${budget.category} budget (₹${spent.toFixed(2)} of ₹${budget.limit})`,
      read: false,
      timestamp: new Date().toISOString(),
      actionUrl: '/budgets',
    }
  }

  /**
   * Create budget exceeded notification
   */
  static createBudgetExceededNotification(
    budget: Budget,
    spent: number,
    exceeded: number
  ): Notification {
    return {
      id: Math.random().toString(36).substring(2),
      type: 'budget_warning',
      title: `🚨 Budget Exceeded: ${budget.category}`,
      message: `You've exceeded your ${budget.category} budget by ₹${exceeded.toFixed(2)}`,
      read: false,
      timestamp: new Date().toISOString(),
      actionUrl: '/budgets',
    }
  }

  /**
   * Create goal progress notification
   */
  static createGoalProgressNotification(goal: Goal, percentComplete: number): Notification {
    const milestone = goal.milestones?.find(m => !m.completed && m.amount <= goal.currentAmount)

    return {
      id: Math.random().toString(36).substring(2),
      type: 'goal_progress',
      title: `🎯 Goal Progress: ${goal.title}`,
      message: `You're ${percentComplete}% toward your goal! ${milestone ? '✅ Milestone reached!' : ''}`,
      read: false,
      timestamp: new Date().toISOString(),
      actionUrl: '/goals',
    }
  }

  /**
   * Create transaction notification
   */
  static createTransactionNotification(
    type: 'income' | 'expense',
    amount: number,
    category: string
  ): Notification {
    const icon = type === 'income' ? '💰' : '💸'
    const action = type === 'income' ? 'received' : 'spent'

    return {
      id: Math.random().toString(36).substring(2),
      type: 'transaction',
      title: `${icon} ${type === 'income' ? 'Income' : 'Expense'} Recorded`,
      message: `You ${action} ₹${amount} on ${category}`,
      read: false,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Create system notification
   */
  static createSystemNotification(title: string, message: string): Notification {
    return {
      id: Math.random().toString(36).substring(2),
      type: 'system',
      title,
      message,
      read: false,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Get unread notification count
   */
  static getUnreadCount(notifications: Notification[]): number {
    return notifications.filter(n => !n.read).length
  }

  /**
   * Group notifications by type
   */
  static groupByType(
    notifications: Notification[]
  ): Record<string, Notification[]> {
    return notifications.reduce(
      (grouped, notification) => {
        if (!grouped[notification.type]) {
          grouped[notification.type] = []
        }
        grouped[notification.type].push(notification)
        return grouped
      },
      {} as Record<string, Notification[]>
    )
  }

  /**
   * Get recent notifications
   */
  static getRecent(notifications: Notification[], count: number = 5): Notification[] {
    return notifications
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count)
  }

  /**
   * Mark notification as read
   */
  static markAsRead(notification: Notification): Notification {
    return {
      ...notification,
      read: true,
    }
  }

  /**
   * Mark all as read
   */
  static markAllAsRead(notifications: Notification[]): Notification[] {
    return notifications.map(n => ({ ...n, read: true }))
  }
}
