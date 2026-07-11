/**
 * Category Icons & Colors System
 * 30+ emoji-mapped categories for expense and income
 * Each category has: emoji, label, color (tailwind), and bg color
 */

export interface CategoryConfig {
  id: string
  emoji: string
  label: string
  color: string      // text color class
  bg: string         // background color class
  type: 'expense' | 'income' | 'both'
}

export const EXPENSE_CATEGORIES: CategoryConfig[] = [
  { id: 'food', emoji: '🍕', label: 'Food', color: 'text-orange-500', bg: 'bg-orange-500/10', type: 'expense' },
  { id: 'drink', emoji: '🧃', label: 'Drink', color: 'text-sky-500', bg: 'bg-sky-500/10', type: 'expense' },
  { id: 'coffee', emoji: '☕', label: 'Coffee', color: 'text-amber-700', bg: 'bg-amber-700/10', type: 'expense' },
  { id: 'groceries', emoji: '🛒', label: 'Groceries', color: 'text-green-600', bg: 'bg-green-600/10', type: 'expense' },
  { id: 'transport', emoji: '🚗', label: 'Transport', color: 'text-blue-500', bg: 'bg-blue-500/10', type: 'expense' },
  { id: 'bus', emoji: '🚌', label: 'Bus/Metro', color: 'text-indigo-500', bg: 'bg-indigo-500/10', type: 'expense' },
  { id: 'fuel', emoji: '⛽', label: 'Fuel', color: 'text-yellow-600', bg: 'bg-yellow-600/10', type: 'expense' },
  { id: 'shopping', emoji: '🛍️', label: 'Shopping', color: 'text-pink-500', bg: 'bg-pink-500/10', type: 'expense' },
  { id: 'clothes', emoji: '👕', label: 'Clothes', color: 'text-purple-500', bg: 'bg-purple-500/10', type: 'expense' },
  { id: 'entertainment', emoji: '🎬', label: 'Entertainment', color: 'text-violet-500', bg: 'bg-violet-500/10', type: 'expense' },
  { id: 'gaming', emoji: '🎮', label: 'Gaming', color: 'text-emerald-500', bg: 'bg-emerald-500/10', type: 'expense' },
  { id: 'subscriptions', emoji: '📱', label: 'Subscriptions', color: 'text-cyan-500', bg: 'bg-cyan-500/10', type: 'expense' },
  { id: 'utilities', emoji: '💡', label: 'Utilities', color: 'text-amber-500', bg: 'bg-amber-500/10', type: 'expense' },
  { id: 'rent', emoji: '🏠', label: 'Rent', color: 'text-teal-600', bg: 'bg-teal-600/10', type: 'expense' },
  { id: 'healthcare', emoji: '💊', label: 'Healthcare', color: 'text-red-500', bg: 'bg-red-500/10', type: 'expense' },
  { id: 'education', emoji: '📚', label: 'Education', color: 'text-blue-600', bg: 'bg-blue-600/10', type: 'expense' },
  { id: 'gym', emoji: '🏋️', label: 'Gym/Fitness', color: 'text-lime-600', bg: 'bg-lime-600/10', type: 'expense' },
  { id: 'beauty', emoji: '💄', label: 'Beauty', color: 'text-rose-500', bg: 'bg-rose-500/10', type: 'expense' },
  { id: 'gifts', emoji: '🎁', label: 'Gifts', color: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10', type: 'expense' },
  { id: 'travel', emoji: '✈️', label: 'Travel', color: 'text-sky-600', bg: 'bg-sky-600/10', type: 'expense' },
  { id: 'hotel', emoji: '🏨', label: 'Hotel', color: 'text-indigo-600', bg: 'bg-indigo-600/10', type: 'expense' },
  { id: 'insurance', emoji: '🛡️', label: 'Insurance', color: 'text-slate-600', bg: 'bg-slate-600/10', type: 'expense' },
  { id: 'phone', emoji: '📞', label: 'Phone/Recharge', color: 'text-green-500', bg: 'bg-green-500/10', type: 'expense' },
  { id: 'internet', emoji: '🌐', label: 'Internet/WiFi', color: 'text-blue-400', bg: 'bg-blue-400/10', type: 'expense' },
  { id: 'pet', emoji: '🐾', label: 'Pet', color: 'text-amber-600', bg: 'bg-amber-600/10', type: 'expense' },
  { id: 'donation', emoji: '❤️', label: 'Donation', color: 'text-rose-600', bg: 'bg-rose-600/10', type: 'expense' },
  { id: 'repair', emoji: '🔧', label: 'Repair', color: 'text-gray-500', bg: 'bg-gray-500/10', type: 'expense' },
  { id: 'electronics', emoji: '💻', label: 'Electronics', color: 'text-slate-500', bg: 'bg-slate-500/10', type: 'expense' },
  { id: 'kids', emoji: '👶', label: 'Kids', color: 'text-pink-400', bg: 'bg-pink-400/10', type: 'expense' },
  { id: 'party', emoji: '🎉', label: 'Party', color: 'text-yellow-500', bg: 'bg-yellow-500/10', type: 'expense' },
  { id: 'laundry', emoji: '👔', label: 'Laundry', color: 'text-blue-300', bg: 'bg-blue-300/10', type: 'expense' },
  { id: 'other', emoji: '📌', label: 'Other', color: 'text-gray-400', bg: 'bg-gray-400/10', type: 'expense' },
]

export const INCOME_CATEGORIES: CategoryConfig[] = [
  { id: 'salary', emoji: '💰', label: 'Salary', color: 'text-emerald-500', bg: 'bg-emerald-500/10', type: 'income' },
  { id: 'freelance', emoji: '💼', label: 'Freelance', color: 'text-blue-500', bg: 'bg-blue-500/10', type: 'income' },
  { id: 'business', emoji: '🏢', label: 'Business', color: 'text-indigo-500', bg: 'bg-indigo-500/10', type: 'income' },
  { id: 'investment', emoji: '📈', label: 'Investment', color: 'text-green-600', bg: 'bg-green-600/10', type: 'income' },
  { id: 'interest', emoji: '🏦', label: 'Interest', color: 'text-teal-500', bg: 'bg-teal-500/10', type: 'income' },
  { id: 'dividend', emoji: '💎', label: 'Dividend', color: 'text-purple-500', bg: 'bg-purple-500/10', type: 'income' },
  { id: 'rental', emoji: '🏘️', label: 'Rental Income', color: 'text-amber-600', bg: 'bg-amber-600/10', type: 'income' },
  { id: 'bonus', emoji: '🎯', label: 'Bonus', color: 'text-yellow-500', bg: 'bg-yellow-500/10', type: 'income' },
  { id: 'gift_income', emoji: '🎁', label: 'Gift', color: 'text-pink-500', bg: 'bg-pink-500/10', type: 'income' },
  { id: 'cashback', emoji: '🔄', label: 'Cashback', color: 'text-cyan-500', bg: 'bg-cyan-500/10', type: 'income' },
  { id: 'refund', emoji: '↩️', label: 'Refund', color: 'text-sky-500', bg: 'bg-sky-500/10', type: 'income' },
  { id: 'other_income', emoji: '✨', label: 'Other', color: 'text-gray-400', bg: 'bg-gray-400/10', type: 'income' },
]

export const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]

/**
 * Get category config by name (fuzzy match)
 */
export function getCategoryConfig(categoryName: string): CategoryConfig {
  const lower = categoryName.toLowerCase().trim()

  // Exact ID match
  const exact = ALL_CATEGORIES.find(c => c.id === lower)
  if (exact) return exact

  // Label match
  const labelMatch = ALL_CATEGORIES.find(c => c.label.toLowerCase() === lower)
  if (labelMatch) return labelMatch

  // Partial match
  const partial = ALL_CATEGORIES.find(c =>
    c.label.toLowerCase().includes(lower) || lower.includes(c.id)
  )
  if (partial) return partial

  // Fallback
  return { id: 'other', emoji: '📌', label: categoryName, color: 'text-gray-400', bg: 'bg-gray-400/10', type: 'expense' }
}

/**
 * Get just the emoji for a category name
 */
export function getCategoryEmoji(categoryName: string): string {
  return getCategoryConfig(categoryName).emoji
}

/**
 * Get color classes for a category
 */
export function getCategoryColors(categoryName: string): { color: string; bg: string } {
  const config = getCategoryConfig(categoryName)
  return { color: config.color, bg: config.bg }
}

/**
 * Donut chart color palette (hex values for Recharts)
 */
export const CHART_COLORS = [
  '#f97316', '#3b82f6', '#ec4899', '#8b5cf6', '#10b981',
  '#f59e0b', '#06b6d4', '#ef4444', '#84cc16', '#6366f1',
  '#14b8a6', '#f43f5e', '#a855f7', '#22c55e', '#0ea5e9',
]
