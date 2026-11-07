import { isDefaultHidden } from '@/lib/category-meta'

/**
 * The engine uses the product taxonomy (Food & Dining, Groceries, …). The rest
 * of PennyFlow (budgets, statistics, pickers) works on the app's category
 * names. Where an app default exists we use it so imported spending lands in
 * the user's existing budgets; if the user removed that default, or there is no
 * equivalent, the engine's own name is kept.
 */
const MAP: Record<string, string> = {
  'Food & Dining': 'Food',
  Transportation: 'Transport',
  Fuel: 'Transport',
  Utilities: 'Utilities',
  Rent: 'Rent',
  Healthcare: 'Healthcare',
  Education: 'Education',
  Entertainment: 'Entertainment',
  Shopping: 'Shopping',
  Salary: 'Salary',
  Interest: 'Interest',
  'Other Income': 'Other',
}

export function toAppCategory(engineCategory: string): string {
  const mapped = MAP[engineCategory]
  if (!mapped || isDefaultHidden(mapped)) return engineCategory
  return mapped
}
