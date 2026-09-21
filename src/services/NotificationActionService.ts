/**
 * NotificationActionService
 *
 * Manages persistent notification with quick action buttons.
 * Only functional on platforms that support notifications (Capacitor Android/iOS, PWA with permission).
 *
 * Actions: Add Transaction, Ledger, Dashboard, Analytics
 */

import { PlatformService } from './PlatformService'

export interface NotificationAction {
  id: string
  label: string
  icon: string
  url: string
}

const NOTIFICATION_ACTIONS: NotificationAction[] = [
  { id: 'add-expense', label: '➕ Add', icon: 'add', url: '/?action=add-expense' },
  { id: 'ledger', label: '📒 Ledger', icon: 'list', url: '/?action=ledger' },
  { id: 'dashboard', label: '📊 Home', icon: 'home', url: '/?action=dashboard' },
  { id: 'analytics', label: '📈 Analytics', icon: 'chart', url: '/?action=analytics' },
]

const STORAGE_KEY = 'pennyflow-notification-quickadd'
const NOTIFICATION_TAG = 'pennyflow-quick-actions'

export class NotificationActionService {
  /**
   * Check if persistent notifications are available
   */
  static isAvailable(): boolean {
    // Persistent notifications work on Capacitor native or PWA with notification permission
    const platform = PlatformService.getPlatform()
    if (platform === 'capacitor-android' || platform === 'capacitor-ios') return true
    if (platform === 'pwa' && 'Notification' in window && Notification.permission === 'granted') return true
    return false
  }

  /**
   * Check if available with permission request possibility
   */
  static canRequest(): boolean {
    return 'Notification' in window && Notification.permission !== 'denied'
  }

  /**
   * Get unavailability reason
   */
  static getUnavailableReason(): string | null {
    const platform = PlatformService.getPlatform()
    if (platform === 'browser') return 'Install PennyFlow as an app for notification quick actions'
    if (!('Notification' in window)) return 'Notifications not supported on this device'
    if (Notification.permission === 'denied') return 'Notification permission was denied. Enable in browser settings.'
    return null
  }

  /**
   * Check if the feature is enabled by user
   */
  static isEnabled(): boolean {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) === 'true'
  }

  /**
   * Enable/disable the persistent notification
   */
  static async setEnabled(enabled: boolean): Promise<boolean> {
    if (typeof window === 'undefined') return false

    if (enabled) {
      // Request permission if needed
      const hasPermission = await PlatformService.hasNotificationPermission()
      if (!hasPermission) {
        const granted = await PlatformService.requestNotificationPermission()
        if (!granted) return false
      }

      localStorage.setItem(STORAGE_KEY, 'true')
      await this.showPersistentNotification()
      return true
    } else {
      localStorage.setItem(STORAGE_KEY, 'false')
      this.dismissPersistentNotification()
      return true
    }
  }

  /**
   * Show the persistent notification with action buttons
   */
  static async showPersistentNotification(): Promise<void> {
    const platform = PlatformService.getPlatform()

    // Capacitor native: use LocalNotifications plugin
    const win = window as any
    if (win.Capacitor?.isNativePlatform?.() && win.Capacitor?.Plugins?.LocalNotifications) {
      try {
        await win.Capacitor.Plugins.LocalNotifications.schedule({
          notifications: [{
            id: 1,
            title: 'PennyFlow Quick Actions',
            body: 'Tap to add transactions quickly',
            ongoing: true,
            autoCancel: false,
            actionTypeId: 'QUICK_ACTIONS',
            extra: { type: 'quick-actions' },
          }]
        })
      } catch {}
      return
    }

    // PWA: Use Service Worker notification (non-persistent, but best effort)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification('PennyFlow', {
          body: 'Quick actions available',
          tag: NOTIFICATION_TAG,
          icon: '/Favicon assets/android-chrome-192x192.png',
          badge: '/Favicon assets/favicon-32x32.png',
          requireInteraction: true,
          silent: true,
        } as NotificationOptions)
      } catch {}
    }
  }

  /**
   * Dismiss the persistent notification
   */
  static dismissPersistentNotification(): void {
    const win = window as any

    // Capacitor
    if (win.Capacitor?.isNativePlatform?.() && win.Capacitor?.Plugins?.LocalNotifications) {
      try {
        win.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: 1 }] })
      } catch {}
      return
    }

    // PWA: Close via service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.getNotifications({ tag: NOTIFICATION_TAG }).then(notifications => {
          notifications.forEach(n => n.close())
        })
      }).catch(() => {})
    }
  }

  /**
   * Initialize on app start — restore notification if enabled
   */
  static async initialize(): Promise<void> {
    if (this.isEnabled() && this.isAvailable()) {
      await this.showPersistentNotification()
    }
  }

  /**
   * Get defined actions (for UI display)
   */
  static getActions(): NotificationAction[] {
    return NOTIFICATION_ACTIONS
  }
}
