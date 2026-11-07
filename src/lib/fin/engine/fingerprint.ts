import type { RawTransaction } from '../types'

/**
 * cyrb53 — small, fast, deterministic 53-bit string hash. Used only to build a
 * compact de-duplication key; it is not a security primitive.
 */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function normaliseNarration(s: string): string {
  return s.toUpperCase().replace(/\s+/g, ' ').trim()
}

/**
 * Deterministic identity of a bank record.
 *
 * - When the bank/provider supplies a transaction id, identity is
 *   (account, txnId) — robust to narration or timestamp formatting changes.
 * - Otherwise identity is derived from the content of the record. `balanceAfter`
 *   is included because two otherwise identical purchases leave different
 *   balances. `occurrence` disambiguates the rare case of byte-identical
 *   records inside one fetched batch (see `assignFingerprints`).
 *
 * `accountKey` must be the *internal* linked-account id so the same bank record
 * seen through two different connections is not merged by accident.
 */
export function fingerprintOf(accountKey: string, t: RawTransaction, occurrence = 0): string {
  if (t.txnId && t.txnId.trim()) return `f1:${hashString(`${accountKey}|id|${t.txnId.trim()}`)}`
  const content = [
    accountKey,
    t.timestamp,
    t.direction,
    t.amount.toFixed(2),
    normaliseNarration(t.narration),
    t.reference ?? '',
    t.balanceAfter === undefined ? '' : t.balanceAfter.toFixed(2),
    occurrence,
  ].join('|')
  return `f2:${hashString(content)}`
}

/**
 * Fingerprints a whole fetched batch, giving identical records an occurrence
 * index in a stable order so a repeated fetch of the same data always yields
 * the same set of fingerprints.
 */
export function assignFingerprints(accountKey: string, txns: RawTransaction[]): string[] {
  const seen = new Map<string, number>()
  return txns.map((t) => {
    const base = fingerprintOf(accountKey, t, 0)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : fingerprintOf(accountKey, t, n)
  })
}
