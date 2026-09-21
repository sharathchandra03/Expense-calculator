/**
 * AppShortcutService
 *
 * Manages app shortcuts for quick navigation from outside the app.
 * PWA: Uses manifest shortcuts (static, defined at install time).
 * URL params: Handles ?action=X for deep-linking into specific screens.
 * Capacitor: Bridges to native Android/iOS shortcuts API.
 *
 * Shortcuts: Add Transaction, Ledger, Dashboard, Analytics
 */

import { PlatformService } from './PlatformService'

export type ShortcutAction = 'add-expense' | 'ledger' | 'dashboard' | 'analytics'

export interface AppShortcut {
  id: ShortcutAction
  label: string
  description: string
  icon: string
  url: string
  priority: number
}

const SHORTCUTS: AppShortcut[] = [
  { id: 'add-expense', label: 'Add Transaction', description: 'Quick add income or expense', icon: '➕', url: '/?action=add-expense', priority: 1 },
  { id: 'ledger', label: 'Ledger', description: 'View transaction history', icon: '📒', url: '/?action=ledger', priority: 2 },
  { id: 'dashboard', label: 'Dashboard', description: 'View your finances', icon: '📊', url: '/?action=dashboard', priority: 3 },
  { id: 'analytics', label: 'Analytics', description: 'Monthly analytics', icon: '📈', url: '/?action=analytics', priority: 4 },
]

const STORAGE_KEY = 'pennyflow-shortcuts-enabled'

export class AppShortcutService {
  /**
   * Check if shortcuts are available on this platform
   */
  static isAvailable(): boolean {
    return PlatformService.canUse('pwaShortcuts') || PlatformService.canUse('nativeShortcuts')
  }

  /**
   * Get unavailability reason
   */
  static getUnavailableReason(): string | null {
    if (this.isAvailable()) return null
    return 'App shortcuts require installing PennyFlow as an app'
  }

  /**
   * Get all defined shortcuts
   */
  static getShortcuts(): AppShortcut[] {
    return SHORTCUTS
  }

  /**
   * Check if shortcuts feature is enabled by user
   */
  static isEnabled(): boolean {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  }

  /**
   * Enable/disable shortcuts
   */
  static setEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, String(enabled))

    if (enabled) {
      this.registerNativeShortcuts()
    } else {
      this.unregisterNativeShortcuts()
    }
  }

  /**
   * Parse URL action parameter and return the target screen/action.
   * Called on app load to handle deep-link routing.
   */
  static parseUrlAction(): { action: ShortcutAction; handled: boolean } | null {
    if (typeof window === 'undefined') return null

    const params = new URLSearchParams(window.location.search)
    const action = params.get('action') as ShortcutAction | null

    if (!action) return null

    const validActions: ShortcutAction[] = ['add-expense', 'ledger', 'dashboard', 'analytics']
    if (!validActions.includes(action)) return null

    return { action, handled: false }
  }

  /**
   * Map a shortcut action to a tab name for the app's navigation
   */
  static actionToTab(action: ShortcutAction): string {
    switch (action) {
      case 'add-expense': return '__quick-add__' // special: opens modal
      case 'ledger': return 'ledger'
      case 'dashboard': return 'dashboard'
      case 'analytics': return 'analytics'
    }
  }

  /**
   * Register native shortcuts via Capacitor bridge (Android/iOS)
   */
  private static registerNativeShortcuts(): void {
    const win = window as any
    if (!win.Capacitor?.isNativePlatform?.()) return

    const plugin = win.Capacitor?.Plugins?.AppShortcuts
    if (!plugin) return

    try {
      plugin.setDynamicShortcuts({
        shortcuts: SHORTCUTS.map(s => ({
          id: s.id,
          shortLabel: s.label,
          longLabel: s.description,
          iconType: s.id === 'add-expense' ? 'add' : s.id === 'ledger' ? 'list' : s.id === 'analytics' ? 'chart' : 'home',
          data: { url: s.url },
        }))
      })
    } catch {}
  }

  /**
   * Remove native shortcuts
   */
  private static unregisterNativeShortcuts(): void {
    const win = window as any
    if (!win.Capacitor?.isNativePlatform?.()) return

    const plugin = win.Capacitor?.Plugins?.AppShortcuts
    if (!plugin) return

    try {
      plugin.removeAllDynamicShortcuts()
    } catch {}
  }
}
