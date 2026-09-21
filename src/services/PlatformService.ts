/**
 * PlatformService
 *
 * Detects the runtime environment (Browser, Installed PWA, Capacitor Android/iOS)
 * and exposes feature capabilities for each platform.
 *
 * Usage:
 *   PlatformService.getPlatform()       → 'browser' | 'pwa' | 'capacitor-android' | 'capacitor-ios'
 *   PlatformService.getCapabilities()   → { widgets, notifications, ... }
 *   PlatformService.canUse('widgets')   → boolean
 */

export type Platform = 'browser' | 'pwa' | 'capacitor-android' | 'capacitor-ios'

export interface PlatformCapabilities {
  widgets: boolean
  persistentNotification: boolean
  nativeShortcuts: boolean
  pwaShortcuts: boolean
  biometrics: boolean
  localNotifications: boolean
  nativeShare: boolean
  backgroundSync: boolean
}

export class PlatformService {
  private static cachedPlatform: Platform | null = null
  private static cachedCapabilities: PlatformCapabilities | null = null

  /**
   * Detect current runtime platform
   */
  static getPlatform(): Platform {
    if (this.cachedPlatform) return this.cachedPlatform

    if (typeof window === 'undefined') {
      this.cachedPlatform = 'browser'
      return 'browser'
    }

    // Check for Capacitor native runtime
    const win = window as any
    if (win.Capacitor?.isNativePlatform?.()) {
      const platform = win.Capacitor.getPlatform?.()
      if (platform === 'android') {
        this.cachedPlatform = 'capacitor-android'
      } else if (platform === 'ios') {
        this.cachedPlatform = 'capacitor-ios'
      } else {
        this.cachedPlatform = 'browser'
      }
      return this.cachedPlatform
    }

    // Check if running as installed PWA (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true ||
      document.referrer.includes('android-app://')

    if (isStandalone) {
      this.cachedPlatform = 'pwa'
      return 'pwa'
    }

    this.cachedPlatform = 'browser'
    return 'browser'
  }

  /**
   * Get full capabilities map for current platform
   */
  static getCapabilities(): PlatformCapabilities {
    if (this.cachedCapabilities) return this.cachedCapabilities

    const platform = this.getPlatform()

    const capabilities: PlatformCapabilities = {
      widgets: platform === 'capacitor-android',
      persistentNotification: platform === 'capacitor-android' || platform === 'capacitor-ios',
      nativeShortcuts: platform === 'capacitor-android' || platform === 'capacitor-ios',
      pwaShortcuts: platform === 'pwa' || platform === 'capacitor-android' || platform === 'capacitor-ios',
      biometrics: platform === 'capacitor-android' || platform === 'capacitor-ios',
      localNotifications: platform !== 'browser' && 'Notification' in window,
      nativeShare: 'share' in navigator,
      backgroundSync: 'serviceWorker' in navigator && platform !== 'browser',
    }

    this.cachedCapabilities = capabilities
    return capabilities
  }

  /**
   * Check if a specific capability is available
   */
  static canUse(feature: keyof PlatformCapabilities): boolean {
    return this.getCapabilities()[feature]
  }

  /**
   * Get human-readable platform name
   */
  static getPlatformLabel(): string {
    switch (this.getPlatform()) {
      case 'capacitor-android': return 'Android App'
      case 'capacitor-ios': return 'iOS App'
      case 'pwa': return 'Installed PWA'
      case 'browser': return 'Browser'
    }
  }

  /**
   * Get availability message for a feature that requires native
   */
  static getUnavailableReason(feature: keyof PlatformCapabilities): string | null {
    if (this.canUse(feature)) return null

    const platform = this.getPlatform()

    switch (feature) {
      case 'widgets':
        if (platform === 'browser' || platform === 'pwa')
          return 'Widgets require the native Android app'
        if (platform === 'capacitor-ios')
          return 'Widgets coming soon for iOS'
        return 'Not available on this platform'

      case 'persistentNotification':
        if (platform === 'browser')
          return 'Install PennyFlow as an app for notification quick actions'
        if (platform === 'pwa')
          return 'Persistent notifications require the native app'
        return 'Not available on this platform'

      case 'nativeShortcuts':
        if (platform === 'browser' || platform === 'pwa')
          return 'Native shortcuts require the Android/iOS app'
        return 'Not available on this platform'

      case 'biometrics':
        return 'Biometrics require the native app'

      default:
        return 'Not available on this platform'
    }
  }

  /**
   * Check if Notification permission is granted
   */
  static async hasNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false
    return Notification.permission === 'granted'
  }

  /**
   * Request notification permission
   */
  static async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false
    const result = await Notification.requestPermission()
    return result === 'granted'
  }

  /**
   * Invalidate cached values (useful for testing)
   */
  static invalidate(): void {
    this.cachedPlatform = null
    this.cachedCapabilities = null
  }
}
