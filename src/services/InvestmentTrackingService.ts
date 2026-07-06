/**
 * InvestmentTrackingService
 * Manages investment portfolio tracking and analysis
 */

import { Investment } from '@/db/schema'

export interface PortfolioAnalysis {
  totalInvested: number
  totalCurrentValue: number
  totalGainLoss: number
  gainLossPercentage: number
  bestPerformer: Investment | null
  worstPerformer: Investment | null
  allocations: Array<{
    type: string
    count: number
    value: number
    percentage: number
  }>
  diversificationScore: number // 0-100
  expectedAnnualReturn: number // estimated
}

export class InvestmentTrackingService {
  /**
   * Calculate gain/loss for single investment
   */
  static calculateGainLoss(investment: Investment): {
    gainLoss: number
    gainLossPercentage: number
    isProfit: boolean
  } {
    const invested = investment.buyPrice * investment.quantity
    const gainLoss = investment.currentValue - invested
    const gainLossPercentage = invested > 0 ? (gainLoss / invested) * 100 : 0

    return {
      gainLoss: Math.round(gainLoss * 100) / 100,
      gainLossPercentage: Math.round(gainLossPercentage * 100) / 100,
      isProfit: gainLoss >= 0,
    }
  }

  /**
   * Analyze portfolio performance
   */
  static analyzePortfolio(investments: Investment[]): PortfolioAnalysis {
    if (investments.length === 0) {
      return {
        totalInvested: 0,
        totalCurrentValue: 0,
        totalGainLoss: 0,
        gainLossPercentage: 0,
        bestPerformer: null,
        worstPerformer: null,
        allocations: [],
        diversificationScore: 0,
        expectedAnnualReturn: 0,
      }
    }

    // Calculate totals
    let totalInvested = 0
    let totalCurrentValue = 0
    let bestPerformer: Investment | null = null
    let worstPerformer: Investment | null = null
    let bestPerformance = -Infinity
    let worstPerformance = Infinity

    investments.forEach(inv => {
      const invested = inv.buyPrice * inv.quantity
      totalInvested += invested
      totalCurrentValue += inv.currentValue

      const gainLoss = this.calculateGainLoss(inv)
      if (gainLoss.gainLossPercentage > bestPerformance) {
        bestPerformance = gainLoss.gainLossPercentage
        bestPerformer = inv
      }
      if (gainLoss.gainLossPercentage < worstPerformance) {
        worstPerformance = gainLoss.gainLossPercentage
        worstPerformer = inv
      }
    })

    // Calculate allocation by type
    const allocationMap: { [key: string]: number } = {}
    investments.forEach(inv => {
      allocationMap[inv.type] = (allocationMap[inv.type] || 0) + inv.currentValue
    })

    const allocations = Object.entries(allocationMap)
      .map(([type, value]) => ({
        type,
        count: investments.filter(i => i.type === type).length,
        value,
        percentage: totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)

    // Calculate diversification score
    const diversificationScore = this.calculateDiversificationScore(allocations)

    // Calculate expected annual return (simplified)
    const expectedAnnualReturn = this.estimateAnnualReturn(investments)

    const totalGainLoss = totalCurrentValue - totalInvested

    return {
      totalInvested,
      totalCurrentValue,
      totalGainLoss,
      gainLossPercentage: totalInvested > 0 ? Math.round((totalGainLoss / totalInvested) * 1000) / 10 : 0,
      bestPerformer,
      worstPerformer,
      allocations,
      diversificationScore,
      expectedAnnualReturn,
    }
  }

  /**
   * Calculate diversification score (Herfindahl index)
   * Score from 0-100 where higher is better diversified
   */
  private static calculateDiversificationScore(
    allocations: Array<{ percentage: number }>
  ): number {
    if (allocations.length === 0) return 0

    // Calculate Herfindahl index
    const herfindahl = allocations.reduce((sum, alloc) => {
      const percentage = alloc.percentage / 100
      return sum + percentage * percentage
    }, 0)

    // Convert to 0-100 scale (1 = perfectly diversified, inverse = concentrated)
    const score = Math.round((1 - herfindahl) * 100)
    return Math.max(0, Math.min(100, score))
  }

  /**
   * Estimate annual return (simplified)
   */
  private static estimateAnnualReturn(investments: Investment[]): number {
    const typeReturns: { [key: string]: number } = {
      stock: 0.1, // 10% average
      crypto: 0.15, // 15% (volatile)
      mutual_fund: 0.08, // 8%
      etf: 0.085, // 8.5%
      real_estate: 0.05, // 5%
      gold: 0.03, // 3%
    }

    let totalExpectedReturn = 0
    let totalValue = 0

    investments.forEach(inv => {
      const rate = typeReturns[inv.type as keyof typeof typeReturns] || 0.06
      totalExpectedReturn += inv.currentValue * rate
      totalValue += inv.currentValue
    })

    return totalValue > 0 ? Math.round((totalExpectedReturn / totalValue) * 1000) / 10 : 0
  }

  /**
   * Get holding period (in years)
   */
  static getHoldingPeriod(purchaseDate: string): number {
    const purchase = new Date(purchaseDate)
    const now = new Date()
    const years = (now.getTime() - purchase.getTime()) / (1000 * 60 * 60 * 24 * 365)
    return Math.round(years * 10) / 10
  }

  /**
   * Recommend rebalancing
   */
  static recommendRebalancing(
    analysis: PortfolioAnalysis,
    targetAllocations?: { [key: string]: number }
  ): Array<{
    type: string
    currentAllocation: number
    recommendedAllocation: number
    action: 'buy' | 'sell' | 'hold'
  }> {
    const defaultTargets = {
      stock: 40,
      mutual_fund: 30,
      etf: 15,
      gold: 10,
      crypto: 5,
      real_estate: 0,
    }

    const targets = targetAllocations || defaultTargets

    return analysis.allocations.map(alloc => {
      const target = targets[alloc.type as keyof typeof targets] || 0
      const difference = alloc.percentage - target
      let action: 'buy' | 'sell' | 'hold' = 'hold'

      if (difference > 5) {
        action = 'sell'
      } else if (difference < -5) {
        action = 'buy'
      }

      return {
        type: alloc.type,
        currentAllocation: Math.round(alloc.percentage * 10) / 10,
        recommendedAllocation: target,
        action,
      }
    })
  }

  /**
   * Generate portfolio report
   */
  static generatePortfolioReport(analysis: PortfolioAnalysis): string {
    return `
📊 Investment Portfolio Report

Total Invested: ₹${analysis.totalInvested.toFixed(2)}
Current Value: ₹${analysis.totalCurrentValue.toFixed(2)}
Gain/Loss: ₹${analysis.totalGainLoss.toFixed(2)} (${analysis.gainLossPercentage > 0 ? '+' : ''}${analysis.gainLossPercentage}%)

Asset Allocation:
${analysis.allocations.map(a => `  • ${a.type}: ${a.percentage.toFixed(1)}% (₹${a.value.toFixed(2)})`).join('\n')}

Performance:
  🏆 Best: ${analysis.bestPerformer?.name || 'N/A'}
  📉 Worst: ${analysis.worstPerformer?.name || 'N/A'}
  📊 Diversification: ${analysis.diversificationScore}/100
  📈 Expected Annual Return: ${analysis.expectedAnnualReturn}%
    `.trim()
  }
}
