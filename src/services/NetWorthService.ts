/**
 * NetWorthService
 *
 * Single definition of "total assets" and "net worth" so every screen
 * (Home, Investments, Assets & Lending, Statistics) shows the same numbers.
 *
 *   Accounts      : sum of account balances. These are updated by every
 *                   transaction, so they are the source of truth for cash/bank.
 *   Other assets  : Assets-table rows that are NOT mirrors of an account
 *                   (property, gold, etc). Assets matched to an account by name
 *                   are skipped so the same money is never counted twice.
 *   Investments   : current value of every holding.
 *   Lent out      : principal still owed TO you (active 'lent' records).
 *   Total assets  : the four above.
 *   Liabilities   : principal you still owe (active 'borrowed' records).
 *   Net worth     : total assets - liabilities.
 */

import type { Account, Asset, Investment, Lending } from '@/db/schema'

export interface NetWorthBreakdown {
  accounts: number
  otherAssets: number
  investments: number
  lent: number
  borrowed: number
  totalAssets: number
  netWorth: number
}

export interface NetWorthSegment {
  key: 'accounts' | 'otherAssets' | 'investments' | 'lent'
  label: string
  value: number
  /** Share of total assets, 0-100. Negative or zero parts are reported as 0. */
  percentage: number
  color: string
}

export const NET_WORTH_COLORS = {
  accounts: '#6d5efc',
  otherAssets: '#06b6d4',
  investments: '#10b981',
  lent: '#f59e0b',
  borrowed: '#ef4444',
} as const

export class NetWorthService {
  static compute(
    accounts: Account[],
    assets: Asset[],
    investments: Investment[],
    lending: Lending[],
  ): NetWorthBreakdown {
    const accountNames = new Set(accounts.map(a => a.name.trim().toLowerCase()))

    const accountsTotal = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
    const otherAssets = assets
      .filter(a => !accountNames.has(a.name.trim().toLowerCase()))
      .reduce((sum, a) => sum + (Number(a.balance) || 0), 0)
    const investmentsValue = investments.reduce((sum, i) => sum + (Number(i.currentValue) || 0), 0)
    const lent = lending
      .filter(l => l.type === 'lent' && l.status === 'active')
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0)
    const borrowed = lending
      .filter(l => l.type === 'borrowed' && l.status === 'active')
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0)

    const totalAssets = accountsTotal + otherAssets + investmentsValue + lent
    return {
      accounts: accountsTotal,
      otherAssets,
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
      { key: 'accounts', label: 'Accounts', value: b.accounts, color: NET_WORTH_COLORS.accounts },
      { key: 'otherAssets', label: 'Other assets', value: b.otherAssets, color: NET_WORTH_COLORS.otherAssets },
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
