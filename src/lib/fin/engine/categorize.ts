import {
  CATEGORY_REVIEW_THRESHOLD,
  UNCATEGORISED,
  type Classification,
  type ClassificationPreference,
  type Direction,
  type MerchantMatch,
  type TransactionMode,
} from '../types'
import { preferenceKey } from './merchant'

export interface CategorizeInput {
  narration: string
  direction: Direction
  mode: TransactionMode
  merchant: MerchantMatch
}

/** Past categorisations per counterparty key, built from the user's own history. */
export type CategoryHistory = Map<string, Map<string, number>>

/**
 * Optional model-based classifier for the transactions rules could not place.
 * Intentionally an interface only: sending bank narrations to a third-party
 * model is a privacy decision (consent purpose, DPA) that must be made
 * explicitly. No vendor is wired in by default.
 */
export interface AiCategoryClassifier {
  classify(input: CategorizeInput): Promise<Pick<Classification, 'category' | 'subcategory' | 'confidence'> | null>
}

interface Rule {
  re: RegExp
  direction?: Direction
  category: string
  subcategory?: string
  confidence: number
}

const NARRATION_RULES: Rule[] = [
  { re: /\bSALARY\b|\bSAL CR\b|\bPAYROLL\b|\bSAL-|\bSALARY CREDIT\b/i, direction: 'credit', category: 'Salary', confidence: 0.9 },
  { re: /\bINT\.? ?PD\b|\bINTEREST (PAID|CREDIT)|\bINT CREDIT\b|\bSB INT\b/i, direction: 'credit', category: 'Interest', confidence: 0.9 },
  { re: /\bDIVIDEND\b|\bDIV\b/i, direction: 'credit', category: 'Other Income', subcategory: 'Dividend', confidence: 0.8 },
  { re: /\bINVOICE\b|\bCONSULTING\b|\bFREELANCE\b/i, direction: 'credit', category: 'Business Income', confidence: 0.6 },
  { re: /\bMUTUAL FUND\b|\bSIP\b|\bBSE STAR\b|\bNSE CLEARING\b|\bICCL\b|\bZERODHA\b/i, category: 'Investments', confidence: 0.85 },
  { re: /\bRECURRING DEPOSIT\b|\bFIXED DEPOSIT\b|\bFD ?(BOOKING|OPEN)\b|\bRD ?INSTALL/i, direction: 'debit', category: 'Transfers', subcategory: 'Savings', confidence: 0.85 },
  { re: /\bCREDIT CARD\b|\bCC PAYMENT\b|\bCARD PAYMENT\b|\bCRED\b/i, direction: 'debit', category: 'Credit Card Payments', confidence: 0.85 },
  { re: /\bEMI\b|\bLOAN\b/i, direction: 'debit', category: 'Loan Repayment', confidence: 0.8 },
  { re: /\bRENT\b/i, direction: 'debit', category: 'Rent', confidence: 0.7 },
  { re: /\bINSURANCE\b|\bPREMIUM\b/i, direction: 'debit', category: 'Insurance', confidence: 0.7 },
  { re: /\bCHRG\b|\bCHARGES?\b|\bSMS ALERT\b|\bANNUAL FEE\b|\bGST\b/i, direction: 'debit', category: 'Other', subcategory: 'Bank charges', confidence: 0.8 },
  { re: /\bATM\b|\bNWD\b|\bCASH WDL\b|\bCASH WITHDRAWAL\b/i, direction: 'debit', category: 'Other', subcategory: 'Cash withdrawal', confidence: 0.75 },
]

function review(c: Omit<Classification, 'needsReview'>): Classification {
  return { ...c, needsReview: c.confidence < CATEGORY_REVIEW_THRESHOLD || c.category === UNCATEGORISED }
}

function bestFromHistory(history: CategoryHistory | undefined, key: string | undefined) {
  if (!history || !key) return undefined
  const counts = history.get(key)
  if (!counts || counts.size === 0) return undefined
  let best: [string, number] | undefined
  let total = 0
  for (const entry of counts) {
    total += entry[1]
    if (!best || entry[1] > best[1]) best = entry
  }
  if (!best) return undefined
  // Consistent history is strong evidence; mixed history is weak.
  const share = best[1] / total
  const confidence = Math.min(0.85, (0.5 + 0.1 * Math.min(best[1], 3)) * (0.5 + share / 2))
  return { category: best[0], confidence }
}

/**
 * Rule + preference + history classifier. Order of authority:
 *   1. explicit user preference (learned from a manual correction)
 *   2. merchant dictionary
 *   3. narration rules
 *   4. the user's own history for the same counterparty
 *   5. otherwise Uncategorised / Review Required
 */
export function classify(
  input: CategorizeInput,
  prefs: Map<string, string>,
  history?: CategoryHistory,
): Classification {
  const key = preferenceKey(input.merchant)
  const vpaKey = input.merchant.vpa ? `v:${input.merchant.vpa}` : undefined

  const pref = (key && prefs.get(key)) || (vpaKey && prefs.get(vpaKey))
  if (pref) return review({ category: pref, confidence: 0.98, source: 'user_preference' })

  if (input.merchant.category && input.merchant.confidence >= 0.7) {
    // Credits from a known merchant are usually refunds, not new categories of income.
    if (input.direction === 'debit') {
      return review({ category: input.merchant.category, confidence: input.merchant.confidence, source: 'merchant_dictionary' })
    }
  }

  for (const r of NARRATION_RULES) {
    if (r.direction && r.direction !== input.direction) continue
    if (r.re.test(input.narration)) {
      return review({ category: r.category, subcategory: r.subcategory, confidence: r.confidence, source: 'narration_rules' })
    }
  }

  const fromHistory = bestFromHistory(history, key ?? vpaKey)
  if (fromHistory) return review({ ...fromHistory, source: 'history' })

  if (input.direction === 'credit') {
    // An unexplained credit is income, but we do not know what kind.
    return review({ category: 'Other Income', confidence: 0.4, source: 'none' })
  }
  return review({ category: UNCATEGORISED, confidence: 0, source: 'none' })
}

/** Convenience for building the prefs map from stored rows. */
export function prefsToMap(prefs: ClassificationPreference[]): Map<string, string> {
  return new Map(prefs.map((p) => [p.key, p.category]))
}
