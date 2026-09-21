/**
 * WidgetService
 *
 * Provides widget data, layout definitions, and sync architecture.
 * In PWA/browser mode: provides data-only (for future native bridge).
 * In Capacitor mode: communicates with native widget plugin.
 *
 * Widget types: NetWorth, CashBalance, TodaySpending, UpcomingBills, QuickAdd, FlowScore
 */

import { db } from '@/db/schema'
import { PlatformService } from './PlatformService'
import { FinancialHealthService } from './FinancialHealthService'
import { formatCurrency } from '@/lib/utils'

export type WidgetType = 'netWorth' | 'cashBalance' | 'todaySpending' | 'upcomingBills' | 'quickAdd' | 'flowScore'

export interface WidgetData {
  type: WidgetType
  title: string
  primaryValue: string
  secondaryValue?: string
  icon: string
  color: string
  lastUpdated: string
}

export interface WidgetLayout {
  type: WidgetType
  label: string
  description: string
  minWidth: number  // grid units
  minHeight: number
  available: boolean
}

const WIDGET_LAYOUTS: WidgetLayout[] = [
  { type: 'netWorth', label: 'Net Worth', description: 'Total balance across all accounts', minWidth: 2, minHeight: 1, available: true },
  { type: 'cashBalance', label: 'Cash Balance', description: 'Liquid cash available', minWidth: 1, minHeight: 1, available: true },
  { type: 'todaySpending', label: "Today's Spending", description: 'Amount spent today', minWidth: 2, minHeight: 1, available: true },
  { type: 'upcomingBills', label: 'Upcoming Bills', description: 'Next bill due', minWidth: 2, minHeight: 1, available: true },
  { type: 'quickAdd', label: 'Quick Add', description: 'Add transaction shortcut', minWidth: 1, minHeight: 1, available: true },
  { type: 'flowScore', label: 'Flow Score', description: 'Financial health score', minWidth: 1, minHeight: 1, available: true },
]

const STORAGE_KEY = 'pennyflow-widget-config'

export class WidgetService {
  /**
   * Check if widgets are available on this platform
   */
  static isAvailable(): boolean {
    return PlatformService.canUse('widgets')
  }

  /**
   * Get unavailability reason
   */
  static getUnavailableReason(): string | null {
    return PlatformService.getUnavailableReason('widgets')
  }

  /**
   * Get all widget layout definitions
   */
  static getWidgetLayouts(): WidgetLayout[] {
    return WIDGET_LAYOUTS
  }

  /**
   * Get enabled widget types from user config
   */
  static getEnabledWidgets(): WidgetType[] {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return JSON.parse(stored)
    } catch {}
    return ['netWorth', 'todaySpending', 'flowScore'] // defaults
  }

  /**
   * Enable/disable a widget type
   */
  static setEnabledWidgets(widgets: WidgetType[]): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets))
    this.syncWidgets()
  }

  /**
   * Generate fresh widget data for all enabled widgets
   */
  static async generateWidgetData(): Promise<WidgetData[]> {
    const enabled = this.getEnabledWidgets()
    const data: WidgetData[] = []

    for (const type of enabled) {
      const widget = await this.generateSingleWidget(type)
      if (widget) data.push(widget)
    }

    return data
  }

  /**
   * Generate data for a single widget type
   */
  static async generateSingleWidget(type: WidgetType): Promise<WidgetData | null> {
    const now = new Date().toISOString()

    try {
      switch (type) {
        case 'netWorth': {
          const accounts = await db.accounts.toArray()
          const total = accounts.reduce((s, a) => s + a.balance, 0)
          return { type, title: 'Net Worth', primaryValue: formatCurrency(total), icon: '💰', color: '#6d5efc', lastUpdated: now }
        }

        case 'cashBalance': {
          const accounts = await db.accounts.toArray()
          const liquid = accounts.filter(a => a.type === 'cash' || a.type === 'bank').reduce((s, a) => s + a.balance, 0)
          return { type, title: 'Cash', primaryValue: formatCurrency(liquid), icon: '🏦', color: '#10b981', lastUpdated: now }
        }

        case 'todaySpending': {
          const today = new Date().toISOString().split('T')[0]
          const txs = await db.transactions.where('date').equals(today).toArray()
          const spent = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
          return { type, title: "Today's Spending", primaryValue: formatCurrency(spent), secondaryValue: `${txs.length} transactions`, icon: '📊', color: '#ef4444', lastUpdated: now }
        }

        case 'upcomingBills': {
          const bills = await db.bills.filter(b => !b.isPaid).toArray()
          const sorted = bills.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
          const next = sorted[0]
          if (next) {
            return { type, title: 'Next Bill', primaryValue: formatCurrency(next.amount), secondaryValue: `${next.title} · ${new Date(next.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, icon: '📋', color: '#f59e0b', lastUpdated: now }
          }
          return { type, title: 'Bills', primaryValue: 'All clear', secondaryValue: 'No upcoming bills', icon: '✅', color: '#10b981', lastUpdated: now }
        }

        case 'quickAdd': {
          return { type, title: 'Quick Add', primaryValue: '+', secondaryValue: 'Tap to add', icon: '➕', color: '#6d5efc', lastUpdated: now }
        }

        case 'flowScore': {
          const [transactions, lending, assets, bills, budgets, goals, investments, accounts] = await Promise.all([
            db.transactions.toArray(), db.lending.toArray(), db.assets.toArray(),
            db.bills.toArray(), db.budgets.toArray(), db.goals.toArray(),
            db.investments.toArray(), db.accounts.toArray(),
          ])
          const health = FinancialHealthService.calculate({ transactions, lending, assets, bills, budgets, goals, investments, accounts })
          return { type, title: 'Health Score', primaryValue: `${health.score}`, secondaryValue: FinancialHealthService.getScoreLabel(health.score), icon: '💚', color: FinancialHealthService.getScoreColor(health.score), lastUpdated: now }
        }

        default:
          return null
      }
    } catch {
      return null
    }
  }

  /**
   * Sync widget data to native layer (Capacitor bridge)
   * In PWA/browser mode, this stores data for potential future use.
   */
  static async syncWidgets(): Promise<void> {
    const data = await this.generateWidgetData()

    // Store latest widget data locally
    if (typeof window !== 'undefined') {
      localStorage.setItem('pennyflow-widget-data', JSON.stringify(data))
    }

    // If Capacitor native bridge is available, push to native widget
    const win = window as any
    if (win.Capacitor?.isNativePlatform?.() && win.Capacitor?.Plugins?.PennyFlowWidget) {
      try {
        await win.Capacitor.Plugins.PennyFlowWidget.updateWidgets({ data: JSON.stringify(data) })
      } catch {}
    }
  }

  /**
   * Schedule periodic widget refresh (called on app init)
   */
  static startPeriodicSync(intervalMs: number = 60000): () => void {
    // Initial sync
    this.syncWidgets()

    // Periodic refresh
    const id = setInterval(() => this.syncWidgets(), intervalMs)

    return () => clearInterval(id)
  }
}
