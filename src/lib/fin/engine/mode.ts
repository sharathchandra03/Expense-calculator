import type { TransactionMode } from '../types'

/**
 * Ordered keyword rules. Banks differ wildly in narration format, so these are
 * deliberately keyword based (not position based) and the provider's own mode
 * code is only used as a fallback.
 */
const RULES: Array<[TransactionMode, RegExp]> = [
  ['UPI', /\bUPI(?:AR)?\b|\bUPI[-/]/i],
  ['IMPS', /\bIMPS\b|\bMMT[/-]/i],
  ['NEFT', /\bNEFT\b/i],
  ['RTGS', /\bRTGS\b/i],
  ['ATM', /\bATM\b|\bNWD\b|\bATW\b|\bCASH WDL\b|\bCASH WITHDRAWAL\b/i],
  ['CHEQUE', /\bCHQ\b|\bCHEQUE\b|\bCHECK\b|\bCLG\b|\bCLEARING\b/i],
  ['AUTO_DEBIT', /\bACH\b|\bNACH\b|\bECS\b|\bE-?MANDATE\b|\bAUTO ?PAY\b|\bSI[-/ ]|\bSTANDING INSTRUCTION\b/i],
  ['CARD', /\bPOS\b|\bECOM\b|\bDEBIT CARD\b|\bCARD\b|\bVISA\b|\bMASTERCARD\b/i],
  ['INTEREST', /\bINT\.? ?PD\b|\bINTEREST\b|\bINT CREDIT\b/i],
  ['CHARGES', /\bCHRG\b|\bCHARGES?\b|\bSMS ALERT\b|\bGST\b|\bANNUAL FEE\b/i],
]

const HINTS: Record<string, TransactionMode> = {
  UPI: 'UPI',
  CARD: 'CARD',
  ATM: 'ATM',
  CASH: 'CASH',
  IMPS: 'IMPS',
  NEFT: 'NEFT',
  RTGS: 'RTGS',
  CHEQUE: 'CHEQUE',
  ACH: 'AUTO_DEBIT',
  NACH: 'AUTO_DEBIT',
}

export function detectMode(narration: string, modeHint?: string): TransactionMode {
  for (const [mode, re] of RULES) if (re.test(narration)) return mode
  if (modeHint) {
    const mapped = HINTS[modeHint.trim().toUpperCase()]
    if (mapped) return mapped
  }
  return 'OTHER'
}

export const MODE_LABELS: Record<TransactionMode, string> = {
  UPI: 'UPI',
  IMPS: 'IMPS',
  NEFT: 'NEFT',
  RTGS: 'RTGS',
  CARD: 'Card',
  ATM: 'ATM',
  CHEQUE: 'Cheque',
  AUTO_DEBIT: 'Auto debit',
  INTEREST: 'Interest',
  CHARGES: 'Charges',
  CASH: 'Cash',
  OTHER: 'Other',
}
