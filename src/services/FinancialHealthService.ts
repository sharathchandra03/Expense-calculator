/**
 * FinancialHealthService
 *
 * Comprehensive Financial Wellness Index (0–100) based on measurable financial behaviour.
 * Gracefully degrades when data is missing by redistributing weights.
 * Pure business logic — no UI dependencies.
 */

import { Transaction, Lending, Asset, Bill, Budget, Goal, Investment, Account } from '@/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetricStatus = 'excellent' | 'good' | 'fair' | 'needs_improvement' | 'poor' | 'not_configured'

export interface MetricResult {
  id: string
  label: string
  score: number          // 0–100
  weight: number         // assigned weight (before redistribution)
  effectiveWeight: number // actual weight after redistribution
  status: MetricStatus
  explanation: string
  available: boolean     // whether enough data exists to calculate
}

export interface HealthRecommendation {
  priority: number       // 1 = highest
  metric: string
  message: string
  actionLabel: string
  targetTab?: string     // navigation target in-app
}

export interface FinancialHealthResult {
  score: number                 // 0–100 overall
  trend: 'improving' | 'declining' | 'stable'
  metrics: MetricResult[]
  topRecommendation: HealthRecommendation | null
  allRecommendations: HealthRecommendation[]
  lastCalculated: string        // ISO timestamp
  hasData: boolean              // true if at least one meaningful metric exists
}

export interface HealthInputData {
  transactions: Transaction[]
  lending: Lending[]
  assets: Asset[]
  bills: Bill[]
  budgets: Budget[]
  goals: Goal[]
  investments: Investment[]
  accounts: Account[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_WEIGHTS: Record<string, number> = {
  savingsRate: 25,
  cashFlowStability: 15,
  budgetAdherence: 15,
  emergencyFund: 15,
  debtHealth: 10,
  investmentConsistency: 10,
  billDiscipline: 5,
  lendingRecovery: 5,
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FinancialHealthService {
  private static cache: { result: FinancialHealthResult; hash: string } | null = null

  /**
   * Main entry point. Calculates the full Financial Wellness Index.
   */
  static calculate(data: HealthInputData): FinancialHealthResult {
    const hash = this.computeHash(data)
    if (this.cache && this.cache.hash === hash) {
      return this.cache.result
    }

    const metrics = this.calculateAllMetrics(data)
    const availableMetrics = metrics.filter(m => m.available)

    // If no data at all
    if (availableMetrics.length === 0) {
      const result: FinancialHealthResult = {
        score: 0,
        trend: 'stable',
        metrics,
        topRecommendation: { priority: 1, metric: 'data', message: 'Start tracking your income and expenses to see your financial health score.', actionLabel: 'Add Transaction', targetTab: 'ledger' },
        allRecommendations: [],
        lastCalculated: new Date().toISOString(),
        hasData: false,
      }
      this.cache = { result, hash }
      return result
    }

    // Redistribute weights among available metrics
    const totalAvailableWeight = availableMetrics.reduce((s, m) => s + m.weight, 0)
    availableMetrics.forEach(m => {
      m.effectiveWeight = (m.weight / totalAvailableWeight) * 100
    })
    // Mark unavailable metrics
    metrics.filter(m => !m.available).forEach(m => { m.effectiveWeight = 0 })

    // Calculate weighted score
    const score = Math.round(
      availableMetrics.reduce((sum, m) => sum + (m.score * m.effectiveWeight / 100), 0)
    )

    // Determine trend
    const trend = this.determineTrend(data.transactions)

    // Generate recommendations
    const allRecommendations = this.generateRecommendations(metrics)
    const topRecommendation = allRecommendations.length > 0 ? allRecommendations[0] : null

    const result: FinancialHealthResult = {
      score: Math.max(0, Math.min(100, score)),
      trend,
      metrics,
      topRecommendation,
      allRecommendations,
      lastCalculated: new Date().toISOString(),
      hasData: true,
    }

    this.cache = { result, hash }
    return result
  }

  /** Invalidate cache (call when data changes) */
  static invalidate() {
    this.cache = null
  }

  // ─── Individual Metric Calculators ──────────────────────────────────────────

  private static calculateAllMetrics(data: HealthInputData): MetricResult[] {
    return [
      this.calcSavingsRate(data),
      this.calcCashFlowStability(data),
      this.calcBudgetAdherence(data),
      this.calcEmergencyFund(data),
      this.calcDebtHealth(data),
      this.calcInvestmentConsistency(data),
      this.calcBillDiscipline(data),
      this.calcLendingRecovery(data),
    ]
  }

  private static calcSavingsRate(data: HealthInputData): MetricResult {
    const { income, expenses } = this.getMonthlyFlow(data.transactions, 0)
    const { income: prevIncome, expenses: prevExpenses } = this.getMonthlyFlow(data.transactions, 1)

    // Need at least some income to calculate
    const totalIncome = income + prevIncome
    const totalExpenses = expenses + prevExpenses
    const available = totalIncome > 0

    let score = 0
    let explanation = 'No income data yet'

    if (available) {
      // Use current month if has data, else use previous
      const refIncome = income > 0 ? income : prevIncome
      const refExpenses = income > 0 ? expenses : prevExpenses
      const rate = ((refIncome - refExpenses) / refIncome) * 100

      if (rate >= 30) score = 100
      else if (rate >= 20) score = 90
      else if (rate >= 15) score = 80
      else if (rate >= 10) score = 70
      else if (rate >= 5) score = 60
      else if (rate >= 0) score = 45
      else if (rate >= -10) score = 25
      else score = 10

      explanation = rate >= 0
        ? `Saving ${Math.round(rate)}% of income`
        : `Overspending by ${Math.abs(Math.round(rate))}%`
    }

    return {
      id: 'savingsRate',
      label: 'Savings Rate',
      score,
      weight: BASE_WEIGHTS.savingsRate,
      effectiveWeight: 0,
      status: this.scoreToStatus(score),
      explanation,
      available,
    }
  }

  private static calcCashFlowStability(data: HealthInputData): MetricResult {
    // Compare last 3 months of expenses — lower variance = more stable
    const months: number[] = []
    for (let i = 0; i < 3; i++) {
      const { expenses } = this.getMonthlyFlow(data.transactions, i)
      if (expenses > 0) months.push(expenses)
    }

    const available = months.length >= 2

    let score = 50
    let explanation = 'Not enough history yet'

    if (available) {
      const avg = months.reduce((s, v) => s + v, 0) / months.length
      const variance = months.reduce((s, v) => s + Math.abs(v - avg), 0) / months.length
      const variancePercent = avg > 0 ? (variance / avg) * 100 : 0

      if (variancePercent <= 10) { score = 100; explanation = 'Very stable spending pattern' }
      else if (variancePercent <= 20) { score = 85; explanation = 'Mostly consistent spending' }
      else if (variancePercent <= 35) { score = 65; explanation = 'Some spending fluctuation' }
      else if (variancePercent <= 50) { score = 45; explanation = 'Irregular spending patterns' }
      else { score = 25; explanation = 'Highly variable spending' }
    }

    return {
      id: 'cashFlowStability',
      label: 'Cash Flow Stability',
      score,
      weight: BASE_WEIGHTS.cashFlowStability,
      effectiveWeight: 0,
      status: available ? this.scoreToStatus(score) : 'not_configured',
      explanation,
      available,
    }
  }

  private static calcBudgetAdherence(data: HealthInputData): MetricResult {
    const activeBudgets = data.budgets.filter(b => b.isActive)
    const available = activeBudgets.length > 0

    let score = 0
    let explanation = 'No budgets configured'

    if (available) {
      // Calculate how many budgets are within limit
      const now = new Date()
      const thisMonth = now.getMonth()
      const thisYear = now.getFullYear()

      let withinBudget = 0
      let totalBudgets = activeBudgets.length

      activeBudgets.forEach(budget => {
        const spent = data.transactions
          .filter(tx => {
            const d = new Date(tx.date)
            return tx.type === 'expense' &&
              tx.category.toLowerCase() === budget.category.toLowerCase() &&
              d.getMonth() === thisMonth &&
              d.getFullYear() === thisYear
          })
          .reduce((s, tx) => s + tx.amount, 0)

        if (spent <= budget.limit) withinBudget++
      })

      const adherenceRate = (withinBudget / totalBudgets) * 100
      score = Math.round(adherenceRate)
      explanation = `${withinBudget}/${totalBudgets} budgets within limit`
    }

    return {
      id: 'budgetAdherence',
      label: 'Budget Adherence',
      score,
      weight: BASE_WEIGHTS.budgetAdherence,
      effectiveWeight: 0,
      status: available ? this.scoreToStatus(score) : 'not_configured',
      explanation,
      available,
    }
  }

  private static calcEmergencyFund(data: HealthInputData): MetricResult {
    const liquidAssets = data.accounts
      .filter(a => a.type === 'cash' || a.type === 'bank')
      .reduce((s, a) => s + a.balance, 0)

    // Fallback to assets table if no accounts
    const liquidFromAssets = liquidAssets > 0 ? liquidAssets : data.assets
      .filter(a => a.type === 'cash' || a.type === 'bank')
      .reduce((s, a) => s + a.balance, 0)

    const { expenses } = this.getMonthlyFlow(data.transactions, 0)
    const { expenses: prevExpenses } = this.getMonthlyFlow(data.transactions, 1)
    const avgExpenses = expenses > 0 && prevExpenses > 0
      ? (expenses + prevExpenses) / 2
      : expenses > 0 ? expenses : prevExpenses

    const available = avgExpenses > 0 && liquidFromAssets > 0

    let score = 0
    let explanation = 'Not configured'

    if (available) {
      const monthsCovered = avgExpenses > 0 ? liquidFromAssets / avgExpenses : 0

      if (monthsCovered >= 6) { score = 100; explanation = `${monthsCovered.toFixed(1)} months covered` }
      else if (monthsCovered >= 4) { score = 85; explanation = `${monthsCovered.toFixed(1)} months covered` }
      else if (monthsCovered >= 3) { score = 70; explanation = `${monthsCovered.toFixed(1)} months covered` }
      else if (monthsCovered >= 2) { score = 55; explanation = `${monthsCovered.toFixed(1)} months covered` }
      else if (monthsCovered >= 1) { score = 40; explanation = `${monthsCovered.toFixed(1)} months covered` }
      else { score = 20; explanation = `Only ${(monthsCovered * 30).toFixed(0)} days covered` }
    }

    return {
      id: 'emergencyFund',
      label: 'Emergency Fund',
      score,
      weight: BASE_WEIGHTS.emergencyFund,
      effectiveWeight: 0,
      status: available ? this.scoreToStatus(score) : 'not_configured',
      explanation,
      available,
    }
  }

  private static calcDebtHealth(data: HealthInputData): MetricResult {
    const activeBorrowed = data.lending.filter(l => l.type === 'borrowed' && l.status === 'active')
    const totalDebt = activeBorrowed.reduce((s, l) => s + l.amount, 0)
    const available = activeBorrowed.length > 0

    let score = 100
    let explanation = 'No active debts'

    if (available) {
      const { income } = this.getMonthlyFlow(data.transactions, 0)
      const annualIncome = income * 12

      if (annualIncome > 0) {
        const debtToIncome = (totalDebt / annualIncome) * 100
        if (debtToIncome <= 20) { score = 95; explanation = 'Debt well under control' }
        else if (debtToIncome <= 35) { score = 80; explanation = 'Manageable debt level' }
        else if (debtToIncome <= 50) { score = 60; explanation = 'Moderate debt load' }
        else if (debtToIncome <= 75) { score = 40; explanation = 'High debt-to-income ratio' }
        else { score = 20; explanation = 'Debt exceeds safe levels' }
      } else {
        // No income data but has debt — partial score
        score = 40
        explanation = `Active debt: ${activeBorrowed.length} loan(s)`
      }
    }

    return {
      id: 'debtHealth',
      label: 'Debt Health',
      score,
      weight: BASE_WEIGHTS.debtHealth,
      effectiveWeight: 0,
      status: available ? this.scoreToStatus(score) : 'excellent',
      explanation,
      available: true, // Always available — no debt = excellent
    }
  }

  private static calcInvestmentConsistency(data: HealthInputData): MetricResult {
    const hasInvestments = data.investments.length > 0
    const available = hasInvestments

    let score = 0
    let explanation = 'No investments tracked'

    if (available) {
      const totalValue = data.investments.reduce((s, i) => s + (i.currentValue || 0), 0)
      const totalCost = data.investments.reduce((s, i) => s + (i.buyPrice * i.quantity), 0)

      // Simple: having diversified investments = good
      const uniqueTypes = new Set(data.investments.map(i => i.type)).size
      const diversification = Math.min(100, uniqueTypes * 25)

      // Growth indicator
      const growthPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0
      const growthScore = growthPct >= 10 ? 100 : growthPct >= 0 ? 70 : growthPct >= -10 ? 40 : 20

      score = Math.round(diversification * 0.4 + growthScore * 0.6)
      explanation = `${data.investments.length} investment(s), ${uniqueTypes} type(s)`
    }

    return {
      id: 'investmentConsistency',
      label: 'Investment Health',
      score,
      weight: BASE_WEIGHTS.investmentConsistency,
      effectiveWeight: 0,
      status: available ? this.scoreToStatus(score) : 'not_configured',
      explanation,
      available,
    }
  }

  private static calcBillDiscipline(data: HealthInputData): MetricResult {
    const allBills = data.bills
    const available = allBills.length > 0

    let score = 0
    let explanation = 'No bills tracked'

    if (available) {
      const paid = allBills.filter(b => b.isPaid).length
      const total = allBills.length
      const paidRate = (paid / total) * 100

      // Check overdue
      const now = new Date()
      const overdue = allBills.filter(b => !b.isPaid && new Date(b.dueDate) < now).length

      if (overdue === 0 && paidRate >= 80) { score = 100; explanation = 'All bills on time' }
      else if (overdue === 0) { score = 85; explanation = `${paid}/${total} bills paid` }
      else if (overdue <= 1) { score = 60; explanation = `${overdue} bill overdue` }
      else if (overdue <= 3) { score = 40; explanation = `${overdue} bills overdue` }
      else { score = 20; explanation = `${overdue} bills past due` }
    }

    return {
      id: 'billDiscipline',
      label: 'Bill Discipline',
      score,
      weight: BASE_WEIGHTS.billDiscipline,
      effectiveWeight: 0,
      status: available ? this.scoreToStatus(score) : 'not_configured',
      explanation,
      available,
    }
  }

  private static calcLendingRecovery(data: HealthInputData): MetricResult {
    const activeLent = data.lending.filter(l => l.type === 'lent' && l.status === 'active')
    const available = activeLent.length > 0

    let score = 0
    let explanation = 'No active loans given'

    if (available) {
      const now = new Date()
      const overdue = activeLent.filter(l => l.expectedRepaymentDate && new Date(l.expectedRepaymentDate) < now)
      const overdueRate = (overdue.length / activeLent.length) * 100

      if (overdueRate === 0) { score = 100; explanation = 'All loans within expected period' }
      else if (overdueRate <= 25) { score = 75; explanation = `${overdue.length} loan(s) past expected date` }
      else if (overdueRate <= 50) { score = 50; explanation = 'Half of loans overdue' }
      else { score = 25; explanation = 'Most loans overdue for recovery' }
    }

    return {
      id: 'lendingRecovery',
      label: 'Lending Recovery',
      score,
      weight: BASE_WEIGHTS.lendingRecovery,
      effectiveWeight: 0,
      status: available ? this.scoreToStatus(score) : 'not_configured',
      explanation,
      available,
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private static getMonthlyFlow(transactions: Transaction[], monthsAgo: number): { income: number; expenses: number } {
    const now = new Date()
    const targetDate = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
    const targetMonth = targetDate.getMonth()
    const targetYear = targetDate.getFullYear()

    let income = 0
    let expenses = 0

    transactions.forEach(tx => {
      const d = new Date(tx.date)
      if (d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
        if (tx.type === 'income') income += tx.amount
        else if (tx.type === 'expense') expenses += tx.amount
      }
    })

    return { income, expenses }
  }

  private static determineTrend(transactions: Transaction[]): 'improving' | 'declining' | 'stable' {
    const current = this.getMonthlyFlow(transactions, 0)
    const prev = this.getMonthlyFlow(transactions, 1)

    if (current.income === 0 && prev.income === 0) return 'stable'

    const currentRate = current.income > 0 ? (current.income - current.expenses) / current.income : 0
    const prevRate = prev.income > 0 ? (prev.income - prev.expenses) / prev.income : 0

    const diff = currentRate - prevRate
    if (diff > 0.05) return 'improving'
    if (diff < -0.05) return 'declining'
    return 'stable'
  }

  private static scoreToStatus(score: number): MetricStatus {
    if (score >= 85) return 'excellent'
    if (score >= 70) return 'good'
    if (score >= 50) return 'fair'
    if (score >= 30) return 'needs_improvement'
    return 'poor'
  }

  private static generateRecommendations(metrics: MetricResult[]): HealthRecommendation[] {
    const recs: HealthRecommendation[] = []

    const available = metrics.filter(m => m.available)
    const sorted = [...available].sort((a, b) => a.score - b.score)

    sorted.forEach((m, idx) => {
      if (m.score >= 85) return // No recommendation needed

      const rec = this.getRecommendationForMetric(m)
      if (rec) {
        recs.push({ ...rec, priority: idx + 1 })
      }
    })

    // Add recommendations for unconfigured metrics
    metrics.filter(m => !m.available && m.status === 'not_configured').forEach(m => {
      const rec = this.getConfigRecommendation(m)
      if (rec) recs.push(rec)
    })

    return recs.slice(0, 5)
  }

  private static getRecommendationForMetric(m: MetricResult): Omit<HealthRecommendation, 'priority'> | null {
    switch (m.id) {
      case 'savingsRate':
        return { metric: m.label, message: 'Increase monthly savings by reducing discretionary spending.', actionLabel: 'View Expenses', targetTab: 'analytics' }
      case 'cashFlowStability':
        return { metric: m.label, message: 'Stabilize spending by setting consistent monthly budgets.', actionLabel: 'Set Budget', targetTab: 'budgets' }
      case 'budgetAdherence':
        return { metric: m.label, message: 'Review overspent budget categories and adjust limits.', actionLabel: 'View Budgets', targetTab: 'budgets' }
      case 'emergencyFund':
        return { metric: m.label, message: 'Build emergency savings to cover at least 3 months of expenses.', actionLabel: 'View Accounts', targetTab: 'accounts' }
      case 'debtHealth':
        return { metric: m.label, message: 'Prioritize paying down high-interest debt.', actionLabel: 'Debt Planner', targetTab: 'debtplanner' }
      case 'investmentConsistency':
        return { metric: m.label, message: 'Diversify investments across multiple asset types.', actionLabel: 'Investments', targetTab: 'investments' }
      case 'billDiscipline':
        return { metric: m.label, message: 'Pay upcoming bills before their due date.', actionLabel: 'View Bills', targetTab: 'bills' }
      case 'lendingRecovery':
        return { metric: m.label, message: 'Follow up on overdue loan repayments.', actionLabel: 'Lending', targetTab: 'lending' }
      default:
        return null
    }
  }

  private static getConfigRecommendation(m: MetricResult): HealthRecommendation | null {
    switch (m.id) {
      case 'budgetAdherence':
        return { priority: 10, metric: m.label, message: 'Create budgets to track your spending limits.', actionLabel: 'Create Budget', targetTab: 'budgets' }
      case 'investmentConsistency':
        return { priority: 11, metric: m.label, message: 'Start tracking your investments for a complete picture.', actionLabel: 'Add Investment', targetTab: 'investments' }
      case 'emergencyFund':
        return { priority: 9, metric: m.label, message: 'Set up an emergency fund for financial security.', actionLabel: 'View Accounts', targetTab: 'accounts' }
      default:
        return null
    }
  }

  private static computeHash(data: HealthInputData): string {
    // Simple hash based on counts and totals for cache invalidation
    const txCount = data.transactions.length
    const totalAmount = data.transactions.slice(-10).reduce((s, t) => s + t.amount, 0)
    const billCount = data.bills.length
    const lendCount = data.lending.length
    return `${txCount}-${totalAmount.toFixed(0)}-${billCount}-${lendCount}-${data.budgets.length}-${data.investments.length}`
  }

  // ─── UI Helpers ─────────────────────────────────────────────────────────────

  static getScoreColor(score: number): string {
    if (score >= 80) return '#10b981'
    if (score >= 60) return '#f59e0b'
    if (score >= 40) return '#f97316'
    return '#ef4444'
  }

  static getScoreLabel(score: number): string {
    if (score >= 85) return 'Excellent'
    if (score >= 70) return 'Good'
    if (score >= 50) return 'Fair'
    if (score >= 30) return 'Needs Work'
    return 'Poor'
  }

  static getStatusColor(status: MetricStatus): string {
    switch (status) {
      case 'excellent': return '#10b981'
      case 'good': return '#22c55e'
      case 'fair': return '#f59e0b'
      case 'needs_improvement': return '#f97316'
      case 'poor': return '#ef4444'
      case 'not_configured': return '#6b7280'
    }
  }
}
