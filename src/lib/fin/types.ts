/**
 * Financial data integration — shared types.
 *
 * Layering (see docs/FINANCIAL_INTEGRATION.md):
 *   provider adapters  -> RawAccount / RawTransaction   (provider-specific JSON mapped to these)
 *   engine             -> EnrichedTransaction           (mode, merchant, category, accounting kind)
 *   ImportService      -> Dexie tables                  (idempotent, de-duplicated)
 *
 * Nothing in this file may import from React, Dexie or Next so that it can be
 * used from API routes (server) and from the browser alike.
 */

export type FinancialProviderId =
  | 'mock'
  | 'setu'
  | 'finvu'
  | 'camsfinserv'
  | 'onemoney'
  | 'anumati'

/** Account Aggregator FI types (ReBIT). Only the ones PennyFlow handles are listed. */
export type FiType = 'DEPOSIT' | 'MUTUAL_FUNDS' | 'EQUITIES' | 'ETF'

export type ConsentStatus =
  | 'awaiting_consent' // created with the provider, user has not approved yet
  | 'active' // approved by the user, data may be fetched
  | 'rejected' // user declined at the AA
  | 'expired' // consent validity ended
  | 'revoked' // revoked by the user (here or at the AA)
  | 'failed' // provider-side error while creating / activating

export type SyncState = 'idle' | 'syncing' | 'success' | 'failed'

/** Everything the UI shows as a connection state (derived, never stored as "success" early). */
export type ConnectionState =
  | 'not_connected'
  | 'awaiting_consent'
  | 'connected'
  | 'syncing'
  | 'synced'
  | 'sync_failed'
  | 'consent_expired'
  | 'consent_revoked'

export type TransactionMode =
  | 'UPI'
  | 'IMPS'
  | 'NEFT'
  | 'RTGS'
  | 'CARD'
  | 'ATM'
  | 'CHEQUE'
  | 'AUTO_DEBIT'
  | 'INTEREST'
  | 'CHARGES'
  | 'CASH'
  | 'OTHER'

export type Direction = 'debit' | 'credit'

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

export interface ProviderAvailability {
  /** True when the adapter can make real calls right now. */
  ready: boolean
  /** Human-readable reason when not ready (missing env, onboarding pending…). */
  reason?: string
}

export interface ProviderInfo {
  id: FinancialProviderId
  displayName: string
  /** Simulated providers return generated data and must be labelled as such in the UI. */
  simulated: boolean
  fiTypes: FiType[]
  availability: ProviderAvailability
}

export interface CreateConsentRequest {
  /** Our internal consent id; sent to the provider as a client reference. */
  consentId: string
  userId: string
  /** Mobile number as required by the AA flow (the AA identifies users by mobile@handle). */
  mobile?: string
  fiTypes: FiType[]
  /** Data range the user is asked to share. ISO timestamps. */
  dataFrom: string
  dataTo: string
  /** Consent validity. ISO timestamps. */
  validFrom: string
  validTo: string
  /** Where the AA should return the user after approval. */
  redirectUrl: string
  /** Purpose shown on the consent screen. */
  purpose: string
}

export interface CreateConsentResult {
  providerConsentRef: string
  /** URL of the provider's official consent UI. The user approves there, never in PennyFlow. */
  consentUrl: string
}

export interface ConsentStatusResult {
  status: ConsentStatus
  /** Present once approved. */
  approvedFrom?: string
  approvedTo?: string
  validTo?: string
  detail?: string
}

export interface FetchDataRequest {
  consentId: string
  providerConsentRef: string
  fiTypes: FiType[]
  from: string
  to: string
}

export interface RawAccount {
  /** Stable reference for the account inside the provider (e.g. linkRefNumber). */
  providerAccountRef: string
  fiType: FiType
  institutionName: string
  accountType: string // SAVINGS | CURRENT | …
  /** Masked by the adapter. Adapters must never return an unmasked number. */
  maskedNumber: string
  holderName?: string
  currentBalance?: number
  balanceAsOf?: string
  currency: string
}

export interface RawTransaction {
  providerAccountRef: string
  /** Provider / bank supplied transaction id, when the bank provides one. */
  txnId?: string
  /** Absolute amount in rupees. */
  amount: number
  direction: Direction
  /** ISO timestamp (UTC). */
  timestamp: string
  narration: string
  /** Provider's own mode code (e.g. ReBIT: CARD, UPI, ATM, CASH, OTHERS…). */
  modeHint?: string
  reference?: string
  balanceAfter?: number
}

export interface FetchDataResult {
  accounts: RawAccount[]
  transactions: RawTransaction[]
  /** When the data was generated at the FIP. */
  fetchedAt: string
}

/**
 * The only thing the rest of the app knows about a provider. Adding a provider
 * means implementing this interface and registering it; the engine and the
 * import pipeline are untouched.
 *
 * Adapters are server-side only. They read secrets from process.env.
 */
export interface FinancialDataProvider {
  readonly id: FinancialProviderId
  readonly displayName: string
  readonly simulated: boolean
  readonly fiTypes: FiType[]
  availability(): ProviderAvailability
  createConsent(req: CreateConsentRequest): Promise<CreateConsentResult>
  getConsentStatus(providerConsentRef: string): Promise<ConsentStatusResult>
  revokeConsent(providerConsentRef: string): Promise<void>
  fetchData(req: FetchDataRequest): Promise<FetchDataResult>
}

// ---------------------------------------------------------------------------
// Engine output
// ---------------------------------------------------------------------------

/**
 * How a transaction should be treated by cash-flow maths.
 *  - income / expense: real money in / out of the user's pocket.
 *  - everything else is movement of the user's own money (or its reversal) and
 *    must NOT be counted as income or expense.
 */
export type AccountingKind =
  | 'income'
  | 'expense'
  | 'transfer_own' // between the user's own connected accounts
  | 'card_bill_payment' // payment of a credit card bill
  | 'investment' // MF / SIP / stock purchase or redemption
  | 'savings_transfer' // into FD/RD/savings pots
  | 'refund' // credit that reverses an earlier expense
  | 'unknown'

export interface MerchantMatch {
  /** Normalised merchant name, e.g. "Swiggy". Undefined if none could be derived. */
  name?: string
  /** Category suggested by the merchant dictionary. */
  category?: string
  /** UPI virtual payment address when present in the narration. */
  vpa?: string
  /** 'merchant' = known/likely business, 'person' = looks like a person-to-person UPI. */
  counterpartyType: 'merchant' | 'person' | 'unknown'
  /** 0..1 */
  confidence: number
}

export type CategorySource =
  | 'user_preference' // learned from a user correction
  | 'merchant_dictionary'
  | 'narration_rules'
  | 'history'
  | 'ai'
  | 'none'

export interface Classification {
  category: string
  subcategory?: string
  confidence: number // 0..1
  source: CategorySource
  needsReview: boolean
}

export interface EnrichedTransaction {
  /** Deterministic de-duplication key. Same bank record => same key, always. */
  fingerprint: string
  providerAccountRef: string
  txnId?: string
  reference?: string
  amount: number
  direction: Direction
  timestamp: string
  narration: string
  mode: TransactionMode
  upiRef?: string
  merchant: MerchantMatch
  classification: Classification
  accounting: AccountingKind
  balanceAfter?: number
}

/** A learned user preference: counterparty/merchant key -> category. */
export interface ClassificationPreference {
  key: string // normalised merchant name or VPA
  category: string
}

export const CATEGORY_REVIEW_THRESHOLD = 0.6

/** Spec taxonomy. */
export const FIN_EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Shopping',
  'Transportation',
  'Fuel',
  'Rent',
  'Utilities',
  'Healthcare',
  'Education',
  'Entertainment',
  'Travel',
  'Personal Care',
  'Insurance',
  'Loan Repayment',
  'Credit Card Payments',
  'Investments',
  'Transfers',
] as const

export const FIN_INCOME_CATEGORIES = ['Salary', 'Business Income', 'Other Income', 'Interest'] as const

export const UNCATEGORISED = 'Uncategorised'
