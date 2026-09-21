/**
 * App Configuration Store
 * Local-first settings service for PennyFlow app preferences.
 * All settings are stored in localStorage with sensible defaults.
 */

export interface AppConfig {
  // Display & Start
  startScreen: 'daily' | 'calendar'
  analyticsDefaultView: 'current-month' | 'overall'

  // Ledger
  ledgerSort: 'time' | 'date' | 'amount'

  // Input behavior
  timeInputBehavior: 'auto' | 'manual'

  // Toggles
  widgetEnabled: boolean
  notificationQuickAdd: boolean
  passcodeEnabled: boolean
  reminderEnabled: boolean
  swipeActionsEnabled: boolean
  descriptionVisible: boolean
  autocompleteEnabled: boolean
  noteButtonVisible: boolean
  carryOverEnabled: boolean

  // Regional
  weekStartDay: 'sunday' | 'monday' | 'saturday'
  monthlyStartDate: number // 1–28

  // Visual
  incomeExpenseColorStyle: 'green-red' | 'blue-red' | 'green-orange'
}

const STORAGE_KEY = 'pennyflow-app-config'

const DEFAULT_CONFIG: AppConfig = {
  startScreen: 'daily',
  analyticsDefaultView: 'current-month',
  ledgerSort: 'time',
  timeInputBehavior: 'auto',
  widgetEnabled: true,
  notificationQuickAdd: false,
  passcodeEnabled: false,
  reminderEnabled: true,
  swipeActionsEnabled: true,
  descriptionVisible: true,
  autocompleteEnabled: true,
  noteButtonVisible: true,
  carryOverEnabled: false,
  weekStartDay: 'monday',
  monthlyStartDate: 1,
  incomeExpenseColorStyle: 'green-red',
}

/** Load full config from localStorage, merged with defaults */
export function getAppConfig(): AppConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...DEFAULT_CONFIG, ...parsed }
    }
  } catch {}
  return DEFAULT_CONFIG
}

/** Save the full config object */
export function saveAppConfig(config: AppConfig): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {}
}

/** Update a single setting without touching others */
export function updateAppConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]): AppConfig {
  const current = getAppConfig()
  const updated = { ...current, [key]: value }
  saveAppConfig(updated)
  return updated
}

/** Get a single setting value */
export function getConfigValue<K extends keyof AppConfig>(key: K): AppConfig[K] {
  return getAppConfig()[key]
}

/** Reset all settings to defaults */
export function resetAppConfig(): AppConfig {
  saveAppConfig(DEFAULT_CONFIG)
  return DEFAULT_CONFIG
}

/** Get default config for reference */
export function getDefaultConfig(): AppConfig {
  return { ...DEFAULT_CONFIG }
}
