'use client'

import React from 'react'
import { formatCurrency, cn } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Amount: a currency value that NEVER truncates or wraps, and steps its
 * own font size down as the formatted string grows (lakhs / crores / very
 * large values). Use it anywhere a money figure must stay whole.
 * ------------------------------------------------------------------ */
export type AmountSize = 'hero' | 'lg' | 'md' | 'sm'

const SIZE_LADDER: Record<AmountSize, { max: number; cls: string }[]> = {
  hero: [
    { max: 11, cls: 'text-[28px]' },
    { max: 14, cls: 'text-[24px]' },
    { max: 17, cls: 'text-[20px]' },
    { max: 20, cls: 'text-[17px]' },
    { max: Infinity, cls: 'text-[15px]' },
  ],
  lg: [
    { max: 11, cls: 'text-[22px]' },
    { max: 14, cls: 'text-[19px]' },
    { max: 17, cls: 'text-[16px]' },
    { max: 20, cls: 'text-[14px]' },
    { max: Infinity, cls: 'text-[12.5px]' },
  ],
  md: [
    { max: 12, cls: 'text-[15px]' },
    { max: 15, cls: 'text-[14px]' },
    { max: 18, cls: 'text-[12.5px]' },
    { max: Infinity, cls: 'text-[11.5px]' },
  ],
  sm: [
    { max: 13, cls: 'text-[13.5px]' },
    { max: 16, cls: 'text-[12.5px]' },
    { max: 19, cls: 'text-[11.5px]' },
    { max: Infinity, cls: 'text-[10.5px]' },
  ],
}

export function Amount({
  value,
  size = 'md',
  className,
  signed = false,
}: {
  value: number
  size?: AmountSize
  className?: string
  /** When true, renders a leading '-' for negatives. */
  signed?: boolean
}) {
  const text = signed
    ? `${value < 0 ? '-' : ''}${formatCurrency(Math.abs(value))}`
    : formatCurrency(value)
  const ladder = SIZE_LADDER[size]
  const sizeCls = (ladder.find(step => text.length <= step.max) ?? ladder[ladder.length - 1]).cls
  return (
    <span
      className={cn('font-extrabold tabular-nums whitespace-nowrap leading-tight', sizeCls, className)}
      title={text}
    >
      {text}
    </span>
  )
}
