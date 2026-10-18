/**
 * Category Metadata
 * -----------------
 * Central source of truth for a category's appearance (icon key + color) and for
 * the user's default category per type.
 *
 * - Custom categories store icon/color on their DB row (CustomCategory.icon/color).
 * - Built-in default categories can't live in the DB without being "promoted", so
 *   their icon/color overrides are persisted in localStorage, keyed by name+type.
 * - The default category per type (expense/income) is also persisted in localStorage.
 *
 * `resolveCategoryMeta` merges these sources so every category — default or custom —
 * renders with a consistent icon and color everywhere in the app.
 */

import type { CategoryType } from './category-order'
import { DEFAULT_CATEGORY_COLOR, DEFAULT_ICON_KEY } from './category-icon-registry'

export type { CategoryType }

export interface CategoryMeta {
  icon?: string
  color?: string
}

const META_KEY = 'pennyflow-category-meta'
const DEFAULT_CAT_KEY = 'pennyflow-default-category'

// ---------------------------------------------------------------------------
// Built-in default categories (names shown out of the box) + sensible icons
// ---------------------------------------------------------------------------

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Entertainment', 'Utilities',
  'Rent', 'Healthcare', 'Education', 'Subscriptions', 'Other',
]

export const DEFAULT_INCOME_CATEGORIES = [
  'Salary', 'Freelance', 'Investment', 'Bonus', 'Gift',
  'Rental Income', 'Interest', 'Other',
]

/** Built-in icon + color suggestions keyed by lowercase category name. */
const BUILTIN_META: Record<string, Required<CategoryMeta>> = {
  // expense
  food: { icon: 'food.utensils', color: '#f59e0b' },
  transport: { icon: 'travel.route', color: '#8b5cf6' },
  shopping: { icon: 'shop.cart', color: '#38bdf8' },
  entertainment: { icon: 'fun.gamepad', color: '#22c55e' },
  utilities: { icon: 'util.bulb', color: '#eab308' },
  rent: { icon: 'bill.receipt', color: '#f87171' },
  healthcare: { icon: 'health.pulse', color: '#ef4444' },
  education: { icon: 'edu.cap', color: '#c084fc' },
  subscriptions: { icon: 'util.phone', color: '#06b6d4' },
  // income
  salary: { icon: 'bill.cash', color: '#22c55e' },
  freelance: { icon: 'edu.briefcase', color: '#38bdf8' },
  investment: { icon: 'bill.trendup', color: '#34d399' },
  bonus: { icon: 'misc.trophy', color: '#eab308' },
  gift: { icon: 'shop.gift', color: '#f472b6' },
  'rental income': { icon: 'family.home', color: '#fb923c' },
  interest: { icon: 'bill.bank', color: '#5eead4' },
  // shared
  other: { icon: 'misc.more', color: '#9ca3af' },
  // common built-in bill/category names used elsewhere
  insurance: { icon: 'care.shield', color: '#818cf8' },
  internet: { icon: 'util.wifi', color: '#38bdf8' },
  phone: { icon: 'util.call', color: '#22c55e' },
  medical: { icon: 'health.pulse', color: '#ef4444' },
  travelling: { icon: 'travel.plane', color: '#8b5cf6' },
  'personal care': { icon: 'care.bath', color: '#fb923c' },
  investments: { icon: 'bill.trendup', color: '#34d399' },
  taxes: { icon: 'bill.file', color: '#94a3b8' },
  'gifts and donation': { icon: 'family.heart', color: '#2dd4bf' },
  'food and dining': { icon: 'food.utensils', color: '#f59e0b' },
  'bills and utilities': { icon: 'bill.receipt', color: '#ef4444' },
}

// ---------------------------------------------------------------------------
// localStorage overrides for default categories
// ---------------------------------------------------------------------------

type MetaStore = Record<string, CategoryMeta> // key: `${type}:${lowerName}`

function metaKey(type: CategoryType, name: string) {
  return `${type}:${name.toLowerCase()}`
}

function readMetaStore(): MetaStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as MetaStore
    }
  } catch {}
  return {}
}

function writeMetaStore(store: MetaStore) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(META_KEY, JSON.stringify(store))
  } catch {}
}

/** Persist an icon/color override for a (default) category by name + type. */
export function setDefaultCategoryMeta(type: CategoryType, name: string, meta: CategoryMeta) {
  const store = readMetaStore()
  store[metaKey(type, name)] = { ...store[metaKey(type, name)], ...meta }
  writeMetaStore(store)
}

function getStoredMeta(type: CategoryType, name: string): CategoryMeta | undefined {
  return readMetaStore()[metaKey(type, name)]
}

// ---------------------------------------------------------------------------
// Resolution — merge DB row meta, stored overrides, and built-in suggestions
// ---------------------------------------------------------------------------

export interface ResolvableCategory {
  name: string
  type: CategoryType
  isCustom?: boolean
  /** icon/color from the DB row for custom categories */
  icon?: string
  color?: string
}

/** Resolve the icon key + color to render for a category, with sensible fallbacks. */
export function resolveCategoryMeta(cat: ResolvableCategory): Required<CategoryMeta> {
  // 1. Explicit DB row values (custom categories)
  if (cat.isCustom && (cat.icon || cat.color)) {
    const builtin = BUILTIN_META[cat.name.toLowerCase()]
    return {
      icon: cat.icon || builtin?.icon || DEFAULT_ICON_KEY,
      color: cat.color || builtin?.color || DEFAULT_CATEGORY_COLOR,
    }
  }

  // 2. localStorage override for default categories
  const stored = getStoredMeta(cat.type, cat.name)
  // 3. Built-in suggestion by name
  const builtin = BUILTIN_META[cat.name.toLowerCase()]

  return {
    icon: stored?.icon || cat.icon || builtin?.icon || DEFAULT_ICON_KEY,
    color: stored?.color || cat.color || builtin?.color || DEFAULT_CATEGORY_COLOR,
  }
}

// ---------------------------------------------------------------------------
// Default category per type
// ---------------------------------------------------------------------------

type DefaultCatStore = Partial<Record<CategoryType, string>>

function readDefaultCatStore(): DefaultCatStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(DEFAULT_CAT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as DefaultCatStore
    }
  } catch {}
  return {}
}

export function getDefaultCategory(type: CategoryType): string | undefined {
  return readDefaultCatStore()[type]
}

export function setDefaultCategory(type: CategoryType, name: string) {
  if (typeof window === 'undefined') return
  const store = readDefaultCatStore()
  store[type] = name
  try {
    localStorage.setItem(DEFAULT_CAT_KEY, JSON.stringify(store))
  } catch {}
}
