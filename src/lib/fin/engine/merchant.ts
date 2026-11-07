import type { MerchantMatch, TransactionMode } from '../types'

/**
 * Merchant dictionary: pattern -> canonical name + default category.
 * Patterns run against the upper-cased, de-noised counterparty text (and, as a
 * fallback, the whole narration). Extend freely; order matters (first hit wins).
 */
const DICTIONARY: Array<[RegExp, string, string]> = [
  // Food & dining
  [/SWIGGY/, 'Swiggy', 'Food & Dining'],
  [/ZOMATO/, 'Zomato', 'Food & Dining'],
  [/DOMINO/, "Domino's", 'Food & Dining'],
  [/MCDONALD|MCDONALDS/, "McDonald's", 'Food & Dining'],
  [/STARBUCKS/, 'Starbucks', 'Food & Dining'],
  [/\bKFC\b/, 'KFC', 'Food & Dining'],
  [/BURGER ?KING/, 'Burger King', 'Food & Dining'],
  [/PIZZA ?HUT/, 'Pizza Hut', 'Food & Dining'],
  // Groceries
  [/ZEPTO/, 'Zepto', 'Groceries'],
  [/BLINK ?IT|GROFERS/, 'Blinkit', 'Groceries'],
  [/BIG ?BASKET|BBDAILY/, 'BigBasket', 'Groceries'],
  [/INSTAMART/, 'Swiggy Instamart', 'Groceries'],
  [/D ?MART|AVENUE SUPERMARTS/, 'DMart', 'Groceries'],
  [/RELIANCE (FRESH|SMART)|JIOMART/, 'Reliance Retail', 'Groceries'],
  [/MORE RETAIL|SPENCER/, 'Supermarket', 'Groceries'],
  // Transport & fuel
  [/\bUBER\b/, 'Uber', 'Transportation'],
  [/\bOLA ?(CABS?|MONEY)?\b/, 'Ola', 'Transportation'],
  [/RAPIDO/, 'Rapido', 'Transportation'],
  [/NAMMA YATRI/, 'Namma Yatri', 'Transportation'],
  [/FASTAG|NETC/, 'FASTag', 'Transportation'],
  [/DMRC|METRO RAIL|BMRCL|BMTC|KSRTC|MSRTC/, 'Public transport', 'Transportation'],
  [/INDIAN ?OIL|IOCL|HPCL|HINDUSTAN PETROL|BPCL|BHARAT PETROL|\bSHELL\b|NAYARA|PETROL|FUEL/, 'Fuel station', 'Fuel'],
  // Travel
  [/IRCTC/, 'IRCTC', 'Travel'],
  [/REDBUS/, 'redBus', 'Travel'],
  [/MAKEMYTRIP|MMT INDIA/, 'MakeMyTrip', 'Travel'],
  [/GOIBIBO/, 'Goibibo', 'Travel'],
  [/CLEARTRIP/, 'Cleartrip', 'Travel'],
  [/INDIGO|AIR INDIA|VISTARA|AKASA|SPICEJET/, 'Airline', 'Travel'],
  [/\bOYO\b|AIRBNB|TREEBO/, 'Stay', 'Travel'],
  // Shopping
  [/AMAZON|AMZN/, 'Amazon', 'Shopping'],
  [/FLIPKART/, 'Flipkart', 'Shopping'],
  [/MYNTRA/, 'Myntra', 'Shopping'],
  [/AJIO/, 'Ajio', 'Shopping'],
  [/MEESHO/, 'Meesho', 'Shopping'],
  [/NYKAA/, 'Nykaa', 'Personal Care'],
  [/DECATHLON/, 'Decathlon', 'Shopping'],
  [/IKEA/, 'IKEA', 'Shopping'],
  // Entertainment & subscriptions
  [/NETFLIX/, 'Netflix', 'Entertainment'],
  [/SPOTIFY/, 'Spotify', 'Entertainment'],
  [/HOTSTAR|DISNEY/, 'Disney+ Hotstar', 'Entertainment'],
  [/PRIME VIDEO|AMAZON PRIME/, 'Amazon Prime', 'Entertainment'],
  [/YOUTUBE|GOOGLE ?\*? ?YOUTUBE/, 'YouTube', 'Entertainment'],
  [/BOOKMYSHOW|\bBMS\b/, 'BookMyShow', 'Entertainment'],
  [/PVR|INOX/, 'PVR INOX', 'Entertainment'],
  // Utilities & telecom
  [/AIRTEL/, 'Airtel', 'Utilities'],
  [/\bJIO\b|RELIANCE JIO/, 'Jio', 'Utilities'],
  [/VODAFONE|\bVI\b|IDEA CELLULAR/, 'Vi', 'Utilities'],
  [/BSNL/, 'BSNL', 'Utilities'],
  [/ACT FIBERNET|HATHWAY|TATA ?PLAY|TATA SKY|DEN NETWORKS/, 'Broadband / DTH', 'Utilities'],
  [/BESCOM|MSEDCL|TNEB|TANGEDCO|TORRENT POWER|TATA POWER|ADANI ELECTRICITY|BSES|CESC|ELECTRICITY|POWER BILL/, 'Electricity', 'Utilities'],
  [/BWSSB|JAL BOARD|WATER BILL/, 'Water', 'Utilities'],
  [/MAHANAGAR GAS|INDRAPRASTHA GAS|ADANI GAS|GAS BILL|LPG|BHARATGAS|HP GAS/, 'Gas', 'Utilities'],
  // Healthcare
  [/APOLLO|PHARMEASY|1MG|TATA 1MG|NETMEDS|PRACTO|MEDPLUS|MANIPAL|FORTIS|PHARMACY|HOSPITAL|CLINIC/, 'Healthcare', 'Healthcare'],
  // Education
  [/UDEMY|COURSERA|BYJU|UNACADEMY|VEDANTU|SCHOOL FEE|COLLEGE FEE|TUITION/, 'Education', 'Education'],
  // Insurance
  [/\bLIC\b|LIFE INSURANCE|HDFC LIFE|ICICI PRU|SBI LIFE|MAX LIFE|STAR HEALTH|NIVA BUPA|CARE HEALTH|ACKO|DIGIT INSURANCE|INSURANCE|PREMIUM/, 'Insurance', 'Insurance'],
  // Investments
  [/ZERODHA|GROWW|UPSTOX|KUVERA|COIN BY|ANGEL ONE|ANGELONE|PAYTM MONEY|ICCL|NSE CLEARING|INDIAN CLEARING|BSE STAR|MUTUAL FUND|\bSIP\b|\bAMC\b|NPS TRUST/, 'Investments', 'Investments'],
  // Cards & loans
  [/\bCRED\b|CRED CLUB|CREDIT CARD|\bCC PAYMENT|CARD PAYMENT|BILLDESK.*CARD/, 'Credit card payment', 'Credit Card Payments'],
  [/\bEMI\b|LOAN|BAJAJ FIN|HDFC LTD|HOME LOAN|FULLERTON|TATA CAPITAL/, 'Loan EMI', 'Loan Repayment'],
  // Rent
  [/NOBROKER|\bRENT\b|HOUSE RENT|LANDLORD/, 'Rent', 'Rent'],
]

/** Tokens that are protocol noise, not counterparties. */
const NOISE = new Set([
  'UPI', 'UPIAR', 'DR', 'CR', 'PAYMENT', 'PAYMENTS', 'PAY', 'PAID', 'FROM', 'TO', 'PHONE', 'PAYTM', 'GPAY', 'PHONEPE',
  'BHIM', 'OK', 'MR', 'MRS', 'MS', 'IMPS', 'NEFT', 'REF', 'TRANSFER', 'TRF', 'P2A', 'P2M', 'P2P', 'DEBIT', 'CREDIT',
  'UPI/P2A', 'UPI/P2M', 'NA', 'SENT', 'RECEIVED', 'COLLECT', 'MANDATE',
])

const VPA_RE = /([a-z0-9._]{2,})@([a-z]{2,})/i
const RRN_RE = /(?<!\d)(\d{12})(?!\d)/
// VPA handles known to be consumer PSP handles (person-to-person is likely).
const PSP_HANDLES = /^(ok(axis|icici|hdfcbank|sbi)|ybl|ibl|axl|paytm|apl|upi|fbl|jupiter|slice|freecharge|airtel|postbank|aubank|barodampay|sbi|axisbank|icici|hdfcbank|okhdfcbank|ikwik|pz|waaxis|wahdfcbank|waicici|wasbi)$/i

export function extractUpiRef(narration: string): string | undefined {
  return RRN_RE.exec(narration)?.[1]
}

export function extractVpa(narration: string): string | undefined {
  const m = VPA_RE.exec(narration)
  return m ? `${m[1]}@${m[2]}`.toLowerCase() : undefined
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Splits a narration into candidate chunks and drops protocol noise. */
function candidateChunks(narration: string): string[] {
  const withoutVpa = narration.replace(VPA_RE, ' ')
  return withoutVpa
    .split(/[\/|\-:;,]+/)
    .map((c) => c.replace(/\d{6,}/g, ' ').replace(/[^A-Za-z0-9&.' ]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((c) => c.length >= 2 && !/^\d+$/.test(c) && !NOISE.has(c.toUpperCase()))
    .filter((c) => !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(c.toUpperCase())) // IFSC
}

const GENERIC_NAMES = new Set(['Rent', 'Healthcare', 'Education', 'Insurance', 'Loan EMI', 'Fuel station', 'Credit card payment'])
const BUSINESS_RE = /\b(PVT|LTD|LLP|INC|CORP|TECH|TECHNOLOGIES|SOLUTIONS|SERVICES|ENTERPRISES?|TRADERS?|STORES?|SYSTEMS|INDUSTRIES|BANK|FINANCE|FOODS?|MART|SHOP)\b/i

function lookup(text: string): { name: string; category: string } | undefined {
  const t = text.toUpperCase()
  for (const [re, name, category] of DICTIONARY) if (re.test(t)) return { name, category }
  return undefined
}

/** Normalised key for preferences/history: lower-case merchant name or VPA. */
export function preferenceKey(m: Pick<MerchantMatch, 'name' | 'vpa'>): string | undefined {
  if (m.name) return `m:${m.name.toLowerCase()}`
  if (m.vpa) return `v:${m.vpa}`
  return undefined
}

/**
 * Derives the counterparty from a narration. Never assumes a fixed bank layout:
 * it looks for a known merchant anywhere first, then falls back to the first
 * meaningful chunk. Everything not in the dictionary is reported with low
 * confidence so the categoriser can send it to review instead of guessing.
 */
export function identifyMerchant(narration: string, mode: TransactionMode): MerchantMatch {
  const vpa = extractVpa(narration)
  const chunks = candidateChunks(narration)

  // 1. Known merchant in any chunk, then in the whole narration (+VPA).
  for (const c of chunks) {
    const hit = lookup(c)
    if (!hit) continue
    // "Rent", "Insurance"… describe the payment, not who was paid. For UPI keep the
    // payee as the counterparty and use the dictionary only for the category.
    if (GENERIC_NAMES.has(hit.name) && mode === 'UPI' && chunks[0] && chunks[0] !== c) {
      return { name: titleCase(chunks[0]), category: hit.category, vpa, counterpartyType: 'person', confidence: 0.75 }
    }
    return { ...hit, vpa, counterpartyType: 'merchant', confidence: 0.92 }
  }
  const whole = lookup(`${narration}`)
  if (whole) return { ...whole, vpa, counterpartyType: 'merchant', confidence: 0.85 }

  if (mode === 'UPI' || mode === 'IMPS' || mode === 'NEFT') {
    const name = chunks[0]
    const handle = vpa?.split('@')[1]
    const local = vpa?.split('@')[0] ?? ''
    const phoneLike = /^(\+?91)?\d{10}$/.test(local)
    const businessLike = /(store|shop|mart|enterprise|trader|foods?|cafe|restaurant|mobility|services|solutions|ltd|pvt|co|bakery|sweets|medical|stores|hotel)/i.test(local)
    if (name) {
      // Person-looking: short alphabetic name paid via a consumer PSP handle or phone-number VPA.
      const looksLikeName = /^[A-Za-z.' ]{2,40}$/.test(name) && name.split(' ').length <= 4
      const consumerHandle = !vpa || phoneLike || (!!handle && PSP_HANDLES.test(handle))
      const person = looksLikeName && consumerHandle && !businessLike && !BUSINESS_RE.test(name)
      return {
        name: titleCase(name),
        vpa,
        counterpartyType: person ? 'person' : 'merchant',
        confidence: person ? 0.35 : 0.5,
      }
    }
    if (vpa) return { vpa, counterpartyType: phoneLike ? 'person' : 'unknown', confidence: 0.25 }
  }

  const first = chunks[0]
  if (first && /[A-Za-z]{3,}/.test(first)) {
    return { name: titleCase(first.slice(0, 40)), vpa, counterpartyType: 'unknown', confidence: 0.3 }
  }
  return { vpa, counterpartyType: 'unknown', confidence: 0 }
}
