'use client'

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Format a number string with Indian number system commas
 * e.g. 100000 → 1,00,000 | 1234567 → 12,34,567
 */
function formatIndianNumber(value: string): string {
  // Remove all non-numeric characters except decimal point
  const cleaned = value.replace(/[^0-9.]/g, '')
  if (!cleaned) return ''

  const parts = cleaned.split('.')
  const integerPart = parts[0]
  const decimalPart = parts.length > 1 ? '.' + parts[1] : ''

  if (!integerPart) return decimalPart

  // Indian number system: last 3 digits, then groups of 2
  const len = integerPart.length
  if (len <= 3) return integerPart + decimalPart

  let formatted = integerPart.slice(-3)
  let remaining = integerPart.slice(0, -3)

  while (remaining.length > 2) {
    formatted = remaining.slice(-2) + ',' + formatted
    remaining = remaining.slice(0, -2)
  }
  if (remaining.length > 0) {
    formatted = remaining + ',' + formatted
  }

  return formatted + decimalPart
}

/** Extract numeric value from formatted string */
function parseAmount(formatted: string): string {
  return formatted.replace(/,/g, '')
}

export interface AmountInputProps {
  value: string | number
  onChange: (rawValue: string) => void
  placeholder?: string
  className?: string
  error?: string
  label?: string
  prefixSymbol?: string
  disabled?: boolean
}

export function AmountInput({
  value,
  onChange,
  placeholder = '0',
  className,
  error,
  label,
  prefixSymbol,
  disabled,
}: AmountInputProps) {
  // Convert incoming value to display format
  const displayValue = React.useMemo(() => {
    const raw = String(value || '')
    const cleaned = raw.replace(/,/g, '')
    if (!cleaned || cleaned === '0') return ''
    return formatIndianNumber(cleaned)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value

    // Allow empty
    if (!input) {
      onChange('')
      return
    }

    // Only allow digits, commas (we'll strip), and one decimal
    const cleaned = input.replace(/[^0-9.,]/g, '')
    const raw = parseAmount(cleaned)

    // Validate: only one decimal point, reasonable format
    const dotCount = (raw.match(/\./g) || []).length
    if (dotCount > 1) return

    // Limit decimal places to 2
    const parts = raw.split('.')
    if (parts[1] && parts[1].length > 2) return

    onChange(raw)
  }

  // Handle cursor position after formatting
  const inputRef = React.useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col space-y-1.5 w-full">
      {label && (
        <label className="text-xs font-semibold text-muted-foreground/80 tracking-wide uppercase px-0.5">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {prefixSymbol && (
          <span className="absolute left-4 text-muted-foreground font-medium text-sm select-none">
            {prefixSymbol}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex h-11 w-full rounded-2xl border border-border/70 bg-secondary px-4 py-2 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring/80 disabled:cursor-not-allowed disabled:opacity-50",
            prefixSymbol && "pl-8",
            error && "border-destructive focus-visible:ring-destructive focus-visible:border-destructive/80",
            className
          )}
        />
      </div>
      {error && (
        <span className="text-xs text-destructive px-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {error}
        </span>
      )}
    </div>
  )
}

/** Utility: format a number for display (used outside inputs) */
export function formatIndianAmount(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'
  return formatIndianNumber(Math.abs(num).toFixed(2))
}
