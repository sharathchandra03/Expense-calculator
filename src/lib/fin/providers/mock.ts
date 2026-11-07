import { hashString } from '../engine/fingerprint'
import { mapRebitDepositAccount } from './rebit'
import type {
  ConsentStatusResult,
  CreateConsentRequest,
  CreateConsentResult,
  FetchDataRequest,
  FetchDataResult,
  FinancialDataProvider,
  ProviderAvailability,
  RawAccount,
  RawTransaction,
} from '../types'

/**
 * SANDBOX provider. Generates deterministic, obviously fictional bank data in
 * the ReBIT deposit shape so the full pipeline (consent -> fetch -> map ->
 * enrich -> dedupe -> store) can be exercised without live credentials.
 *
 * Safety rails:
 *  - `simulated = true`: everything imported through it is flagged
 *    `isSimulated` and is labelled "Sandbox" in the UI.
 *  - Only available outside production unless PENNYFLOW_ENABLE_MOCK_AA=true.
 *  - Institution names are fictional ("Sandbox Bank …").
 */

type Decision = 'awaiting_consent' | 'active' | 'rejected' | 'revoked'
const g = globalThis as unknown as { __pfMockConsents?: Map<string, Decision> }
const decisions = (g.__pfMockConsents ??= new Map<string, Decision>())

export function mockAvailability(): ProviderAvailability {
  const forced = process.env.PENNYFLOW_ENABLE_MOCK_AA
  if (forced === 'true') return { ready: true }
  if (forced === 'false') return { ready: false, reason: 'Sandbox provider disabled (PENNYFLOW_ENABLE_MOCK_AA=false).' }
  if (process.env.NODE_ENV === 'production') {
    return { ready: false, reason: 'Sandbox provider is disabled in production.' }
  }
  return { ready: true }
}

export function setMockDecision(ref: string, d: Decision) {
  decisions.set(ref, d)
}

const ACCOUNTS = [
  { ref: 'sbx-acc-1', institution: 'Sandbox Bank (Savings)', mask: 'XXXX1001', opening: 85000 },
  { ref: 'sbx-acc-2', institution: 'Sandbox Bank (Salary)', mask: 'XXXX2002', opening: 40000 },
] as const

/** Deterministic pseudo-random in [0,1) from a string. */
function rnd(seed: string): number {
  return (parseInt(hashString(seed).slice(0, 8), 36) % 100000) / 100000
}

interface Spec {
  day: string // YYYY-MM-DD
  hour: number
  acc: 0 | 1
  type: 'CREDIT' | 'DEBIT'
  amount: number
  mode: string
  narration: string
  withId?: boolean
}

function* days(from: Date, to: Date) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  while (d <= to) {
    yield new Date(d)
    d.setUTCDate(d.getUTCDate() + 1)
  }
}

function build(from: Date, to: Date): Spec[] {
  const out: Spec[] = []
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const upi = (m: string, rrn: string) => `UPI/${m}/${rrn}`
  for (const d of days(from, to)) {
    const day = iso(d)
    const dom = d.getUTCDate()
    const rrn = () => String(400000000000 + Math.floor(rnd(`rrn${day}${out.length}`) * 99999999999))
    if (dom === 1) out.push({ day, hour: 9, acc: 1, type: 'CREDIT', amount: 85000, mode: 'FT', narration: 'NEFT-SANDBOX TECH PVT LTD-SALARY', withId: true })
    if (dom === 3) out.push({ day, hour: 11, acc: 0, type: 'DEBIT', amount: 22000, mode: 'UPI', narration: `UPI/DR/${rrn()}/Ramesh Kumar/ybl/Rent`, withId: true })
    if (dom === 5) out.push({ day, hour: 7, acc: 0, type: 'DEBIT', amount: 649, mode: 'OTHERS', narration: 'ACH D- NETFLIX COM-MANDATE', withId: true })
    if (dom === 7) out.push({ day, hour: 8, acc: 0, type: 'DEBIT', amount: 5000, mode: 'OTHERS', narration: 'ACH D- ZERODHA COIN SIP-MUTUAL FUND', withId: true })
    if (dom === 10) out.push({ day, hour: 14, acc: 0, type: 'DEBIT', amount: 1800 + Math.round(rnd(`el${day}`) * 900), mode: 'UPI', narration: `UPI-BESCOM ELECTRICITY-bescom@icici-${rrn()}-Bill`, withId: true })
    if (dom === 12) {
      const amt = 15000
      out.push({ day, hour: 10, acc: 1, type: 'DEBIT', amount: amt, mode: 'FT', narration: 'IMPS/OWN ACCOUNT TRANSFER' })
      out.push({ day, hour: 10, acc: 0, type: 'CREDIT', amount: amt, mode: 'FT', narration: 'IMPS/FROM OWN ACCOUNT' })
    }
    if (dom === 15) out.push({ day, hour: 18, acc: 0, type: 'DEBIT', amount: 8000, mode: 'OTHERS', narration: 'CRED CLUB CREDIT CARD PAYMENT', withId: true })
    if (dom === 18) out.push({ day, hour: 12, acc: 0, type: 'DEBIT', amount: 2499, mode: 'CARD', narration: 'POS AMAZON PAY INDIA', withId: true })
    if (dom === 21) out.push({ day, hour: 12, acc: 0, type: 'CREDIT', amount: 2499, mode: 'OTHERS', narration: 'REFUND AMAZON PAY INDIA', withId: true })
    if (dom === 23) out.push({ day, hour: 17, acc: 0, type: 'DEBIT', amount: 3000, mode: 'ATM', narration: 'ATM WDL SANDBOX BANK ATM 4412', withId: true })
    if (dom === 28) out.push({ day, hour: 23, acc: 0, type: 'CREDIT', amount: 612, mode: 'OTHERS', narration: 'INT.PD:SB INT', withId: true })

    // Daily everyday spending (not every day).
    const r = rnd(`day${day}`)
    if (r < 0.35) out.push({ day, hour: 13, acc: 0, type: 'DEBIT', amount: 180 + Math.round(rnd(`sw${day}`) * 420), mode: 'UPI', narration: upi('Swiggy', rrn()) })
    if (r > 0.2 && r < 0.45) out.push({ day, hour: 20, acc: 0, type: 'DEBIT', amount: 250 + Math.round(rnd(`zo${day}`) * 500), mode: 'UPI', narration: upi('ZOMATO', rrn()) })
    if (r > 0.5 && r < 0.62) out.push({ day, hour: 19, acc: 0, type: 'DEBIT', amount: 900 + Math.round(rnd(`dm${day}`) * 2200), mode: 'UPI', narration: upi('DMART', rrn()) })
    if (r > 0.62 && r < 0.8) out.push({ day, hour: 9, acc: 0, type: 'DEBIT', amount: 90 + Math.round(rnd(`ub${day}`) * 330), mode: 'UPI', narration: upi('UBER', rrn()) })
    if (r > 0.9) out.push({ day, hour: 16, acc: 0, type: 'DEBIT', amount: 100 + Math.round(rnd(`pp${day}`) * 800), mode: 'UPI', narration: `UPI/DR/${rrn()}/Anita Sharma/okaxis/Payment` })
  }
  return out
}

const ANCHOR = new Date('2024-01-01T00:00:00Z')

function toRebit(from: Date, to: Date, req: FetchDataRequest) {
  void req
  // Always generate from a fixed anchor so running balances and ids are identical
  // no matter which window is requested (as with a real bank statement).
  const fromDay = from.toISOString().slice(0, 10)
  const specs = build(ANCHOR, to).sort((a, b) => (a.day + a.hour).localeCompare(b.day + b.hour))
  return ACCOUNTS.map((a, idx) => {
    let bal = a.opening
    const txns = specs
      .filter((s) => s.acc === idx)
      .map((s) => {
        bal += s.type === 'CREDIT' ? s.amount : -s.amount
        return {
          day: s.day,
          // Some banks omit ids: only the "special" rows carry one, plain UPI rows rely on content fingerprints.
          txnId: s.withId ? `SBX${idx}-${hashString(`${s.day}|${s.hour}|${s.narration}|${s.amount}`)}` : undefined,
          type: s.type,
          mode: s.mode,
          amount: s.amount.toFixed(2),
          currentBalance: bal.toFixed(2),
          transactionTimestamp: `${s.day}T${String(s.hour).padStart(2, '0')}:00:00+05:30`,
          valueDate: s.day,
          narration: s.narration,
          reference: undefined as string | undefined,
        }
      })
      .filter((t) => t.day >= fromDay)
    return {
      meta: { providerAccountRef: a.ref, institutionName: a.institution },
      doc: {
        maskedAccNumber: a.mask,
        Profile: { Holders: { Holder: [{ name: 'SANDBOX USER' }] } },
        Summary: { currentBalance: bal.toFixed(2), balanceDateTime: to.toISOString(), type: 'SAVINGS', currency: 'INR' },
        Transactions: { Transaction: txns },
      },
    }
  })
}

export const mockProvider: FinancialDataProvider = {
  id: 'mock',
  displayName: 'Sandbox (simulated data)',
  simulated: true,
  fiTypes: ['DEPOSIT'],
  availability: mockAvailability,

  async createConsent(req: CreateConsentRequest): Promise<CreateConsentResult> {
    const ref = `mock_${req.consentId}`
    decisions.set(ref, 'awaiting_consent')
    // The "official consent UI" for the sandbox is rendered by the app itself and clearly labelled.
    const url = new URL(req.redirectUrl)
    url.searchParams.set('finMockConsent', ref)
    return { providerConsentRef: ref, consentUrl: url.toString() }
  },

  async getConsentStatus(ref: string): Promise<ConsentStatusResult> {
    const d = decisions.get(ref)
    // Unknown after a server restart: surface as awaiting rather than inventing a success.
    return { status: d ?? 'awaiting_consent' }
  },

  async revokeConsent(ref: string) {
    decisions.set(ref, 'revoked')
  },

  async fetchData(req: FetchDataRequest): Promise<FetchDataResult> {
    if (decisions.get(req.providerConsentRef) !== 'active') throw new Error('Consent is not active')
    const from = new Date(req.from)
    const to = new Date(Math.min(Date.parse(req.to), Date.now()))
    const accounts: RawAccount[] = []
    const transactions: RawTransaction[] = []
    for (const a of toRebit(from, to, req)) {
      const mapped = mapRebitDepositAccount(a.doc, a.meta)
      accounts.push(mapped.account)
      transactions.push(...mapped.transactions)
    }
    return { accounts, transactions, fetchedAt: new Date().toISOString() }
  },
}
