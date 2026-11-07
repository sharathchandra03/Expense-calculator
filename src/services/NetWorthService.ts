/**
 * NetWorthService
 *
 * Single definition of "total assets" and "net worth" so every screen
 * (Investments, Assets & Lending, Statistics) shows the same numbers.
 *
 *   Accounts & assets : sum of the Assets table. Bank/cash/card accounts are
 *                       mirrored into it by name, so this already covers them.
 *   Investments       : current value of every holding in the Investments table.
 *   Lent out          : principal still owed TO you (active 'lent' records).
 *   Total assets      : the three above.
 *   Liabilities       : principal you still owe (active 'borrowed' records).
 *   Net worth         : total assets - liabilities.
 */

import type { Asset, Investment, Lending } from '@/db/schema'

export interface NetWorthBreakdown {
  accountsAndAssets: number
  investments: number
  lent: number
  borrowed: number
  totalAssets: number
  netWorth: number
}

export interface NetWorthSegment {
  key: 'accountsAndAssets' | 'investments' | 'lent'
  label: string
  value: number
  /** Share of total assets, 0-100. Negative or zero parts are reported as 0. */
  percentage: number
  color: string
}

export const NET_WORTH_COLORS = {
  accountsAndAssets: '#6d5efc',
  investments: '#10b981',
  lent: '#f59e0b',
  borrowed: '#ef4444',
} as const

export class NetWorthService {
  static compute(
    assets: Asset[],
    investments: Investment[],
    lending: Lending[],
  ): NetWorthBreakdown {
    const accountsAndAssets = assets.reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
    const investmentsValue = investments.reduce((sum, i) => sum + (Number(i.currentValue) || 0), 0)
    const lent = lending
      .filter(l => l.type === 'lent' && l.status === 'active')
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0)
    const borrowed = lending
      .filter(l => l.type === 'borrowed' && l.status === 'active')
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0)

    const totalAssets = accountsAndAssets + investmentsValue + lent
    return {
      accountsAndAssets,
      investments: investmentsValue,
      lent,
      borrowed,
      totalAssets,
      netWorth: totalAssets - borrowed,
    }
  }

  /** Ordered segments (with % of total assets) for the stacked bar + legend. */
  static segments(b: NetWorthBreakdown): NetWorthSegment[] {
    const parts: Omit<NetWorthSegment, 'percentage'>[] = [
      { key: 'accountsAndAssets', label: 'Accounts & assets', value: b.accountsAndAssets, color: NET_WORTH_COLORS.accountsAndAssets },
      { key: 'investments', label: 'Investments', value: b.investments, color: NET_WORTH_COLORS.investments },
      { key: 'lent', label: 'Lent out', value: b.lent, color: NET_WORTH_COLORS.lent },
    ]
    const positiveTotal = parts.reduce((s, p) => s + Math.max(0, p.value), 0)
    return parts.map(p => ({
      ...p,
      percentage: positiveTotal > 0 ? (Math.max(0, p.value) / positiveTotal) * 100 : 0,
    }))
  }
}
