// Shared category ordering utilities.
// Both the CategorySelect dropdown and the Categories management screen read/write
// the same manual order so a drag-reorder in the manager syncs with the dropdown.
//
// Order is persisted per type ('expense' | 'income') as an array of category NAMES
// under a single localStorage key. Categories not present in the saved array fall
// back to usage-count (most used first) and then recency (recently added first).

export type CategoryType = 'income' | 'expense'

const ORDER_KEY = 'pennyflow-category-order'

type OrderStore = Partial<Record<CategoryType, string[]>>

function readStore(): OrderStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as OrderStore
    }
  } catch {}
  return {}
}

function writeStore(store: OrderStore) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(store))
  } catch {}
}

/** Manual order (array of names) for a given type. Empty when the user hasn't reordered. */
export function getCategoryOrder(type: CategoryType): string[] {
  const arr = readStore()[type]
  return Array.isArray(arr) ? arr : []
}

/** Persist the manual order (array of names) for a given type. */
export function setCategoryOrder(type: CategoryType, names: string[]) {
  const store = readStore()
  store[type] = names
  writeStore(store)
}

export interface OrderableCategory {
  name: string
  /** ISO date string; used for recency when there is no manual order. Optional for defaults. */
  createdAt?: string
}

/**
 * Sort categories for display.
 * Priority:
 *   1. Manual order (index in the saved order array) — smaller first.
 *   2. Usage count (from transactions) — higher first.
 *   3. Recency (createdAt) — newer first. Defaults (no createdAt) sort after customs.
 */
export function sortCategories<T extends OrderableCategory>(
  items: T[],
  type: CategoryType,
  usageCount: Record<string, number>,
): T[] {
  const order = getCategoryOrder(type)
  const orderIndex = new Map<string, number>()
  order.forEach((name, i) => orderIndex.set(name.toLowerCase(), i))

  return [...items].sort((a, b) => {
    const ai = orderIndex.has(a.name.toLowerCase()) ? orderIndex.get(a.name.toLowerCase())! : Infinity
    const bi = orderIndex.has(b.name.toLowerCase()) ? orderIndex.get(b.name.toLowerCase())! : Infinity
    if (ai !== bi) return ai - bi

    // Both unordered (or equal): most used first
    const au = usageCount[a.name] || 0
    const bu = usageCount[b.name] || 0
    if (au !== bu) return bu - au

    // Then most recently added first (customs before defaults)
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
    if (at !== bt) return bt - at

    return a.name.localeCompare(b.name)
  })
}
