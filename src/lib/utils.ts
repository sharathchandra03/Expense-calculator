import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CURRENCY_SYMBOLS: { [key: string]: string } = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
  AED: 'د.إ',
  SGD: 'S$',
  CHF: 'CHF',
  CNY: '¥',
  KRW: '₩',
  BRL: 'R$',
  ZAR: 'R',
  MXN: 'MX$',
  THB: '฿',
}

// Cached currency to avoid reading localStorage on every call
let _cachedCurrency: string | null = null

/** Read (and cache) the user's currency preference */
function getActiveCurrency(): string {
  if (_cachedCurrency) return _cachedCurrency
  if (typeof window !== 'undefined') {
    _cachedCurrency = localStorage.getItem('finance-os-currency') || 'INR'
  }
  return _cachedCurrency || 'INR'
}

/** Call when currency preference changes to bust the cache */
export function invalidateCurrencyCache() {
  _cachedCurrency = null
}

// Locale map for number formatting
const CURRENCY_LOCALES: { [key: string]: string } = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  CAD: 'en-CA',
  AUD: 'en-AU',
  AED: 'ar-AE',
  SGD: 'en-SG',
  CHF: 'de-CH',
  CNY: 'zh-CN',
  KRW: 'ko-KR',
  BRL: 'pt-BR',
  ZAR: 'en-ZA',
  MXN: 'es-MX',
  THB: 'th-TH',
}

// Format currency helper — uses Indian number system for INR
export function formatCurrency(amount: number, currency?: string): string {
  const selectedCurrency = currency || getActiveCurrency()
  const symbol = CURRENCY_SYMBOLS[selectedCurrency] || '₹'
  const locale = CURRENCY_LOCALES[selectedCurrency] || 'en-IN'
  const formatted = Math.abs(amount).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${amount < 0 ? '-' : ''}${symbol}${formatted}`
}
