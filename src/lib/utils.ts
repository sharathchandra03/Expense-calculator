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

// Format currency helper
export function formatCurrency(amount: number, currency?: string): string {
  let activeCurrency = 'INR';
  if (typeof window !== 'undefined') {
    activeCurrency = localStorage.getItem('finance-os-currency') || 'INR';
  }
  const selectedCurrency = currency || activeCurrency;
  const symbol = CURRENCY_SYMBOLS[selectedCurrency] || '₹';
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '-' : ''}${symbol}${formatted}`;
}
