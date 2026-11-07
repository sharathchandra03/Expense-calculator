import type { RawAccount, RawTransaction } from '../types'

/**
 * Maps a ReBIT "deposit" FI document to PennyFlow's provider-neutral raw
 * models. Every Account Aggregator delivers FI data in the ReBIT schema, so a
 * real provider adapter only needs to obtain + decrypt the FI payload and hand
 * the decoded JSON here.
 *
 * The field names below follow the ReBIT deposit schema (Profile/Summary/
 * Transactions). Providers occasionally omit or rename optional fields, so
 * everything is read defensively. Verify against the sandbox payloads of the
 * provider you onboard with before enabling live access.
 */

interface RebitTxn {
  txnId?: string
  type?: string
  mode?: string
  amount?: string | number
  currentBalance?: string | number
  transactionTimestamp?: string
  valueDate?: string
  narration?: string
  reference?: string
}

interface RebitAccount {
  linkedAccRef?: string
  maskedAccNumber?: string
  type?: string
  Profile?: { Holders?: { Holder?: Array<{ name?: string }> | { name?: string } } }
  Summary?: { currentBalance?: string | number; balanceDateTime?: string; type?: string; currency?: string }
  Transactions?: { Transaction?: RebitTxn[] | RebitTxn }
}

const toArray = <T,>(v: T[] | T | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const toNumber = (v: string | number | undefined): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

/** Never let more than the last 4 characters of an account number through. */
export function maskAccountNumber(raw: string | undefined): string {
  const digits = (raw ?? '').replace(/[^A-Za-z0-9]/g, '')
  if (digits.length === 0) return 'XXXX'
  return `XXXX${digits.slice(-4)}`
}

export function mapRebitDepositAccount(
  doc: RebitAccount,
  meta: { providerAccountRef: string; institutionName: string },
): { account: RawAccount; transactions: RawTransaction[] } {
  const holder = toArray(doc.Profile?.Holders?.Holder)[0]
  const account: RawAccount = {
    providerAccountRef: meta.providerAccountRef,
    fiType: 'DEPOSIT',
    institutionName: meta.institutionName,
    accountType: (doc.Summary?.type ?? 'SAVINGS').toUpperCase(),
    maskedNumber: maskAccountNumber(doc.maskedAccNumber),
    holderName: holder?.name,
    currentBalance: toNumber(doc.Summary?.currentBalance),
    balanceAsOf: doc.Summary?.balanceDateTime,
    currency: doc.Summary?.currency ?? 'INR',
  }

  const transactions: RawTransaction[] = []
  for (const t of toArray(doc.Transactions?.Transaction)) {
    const amount = toNumber(t.amount)
    const ts = t.transactionTimestamp ?? t.valueDate
    if (amount === undefined || amount <= 0 || !ts || Number.isNaN(Date.parse(ts))) continue // skip malformed rows
    const type = (t.type ?? '').toUpperCase()
    if (type !== 'CREDIT' && type !== 'DEBIT') continue
    transactions.push({
      providerAccountRef: meta.providerAccountRef,
      txnId: t.txnId || undefined,
      amount,
      direction: type === 'CREDIT' ? 'credit' : 'debit',
      timestamp: new Date(ts).toISOString(),
      narration: (t.narration ?? '').trim(),
      modeHint: t.mode,
      reference: t.reference || undefined,
      balanceAfter: toNumber(t.currentBalance),
    })
  }
  return { account, transactions }
}
