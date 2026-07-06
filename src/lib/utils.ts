import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const CURRENCY_SYMBOLS: { [key: string]: string } = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
}

// Format currency helper
export function formatCurrency(amount: number, currency?: string): string {
  let activeCurrency = 'USD';
  if (typeof window !== 'undefined') {
    activeCurrency = localStorage.getItem('finance-os-currency') || 'USD';
  }
  const selectedCurrency = currency || activeCurrency;
  const symbol = CURRENCY_SYMBOLS[selectedCurrency] || '$';
  const formatted = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '-' : ''}${symbol}${formatted}`;
}
