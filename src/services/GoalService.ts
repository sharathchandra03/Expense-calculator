/**
 * GoalService
 *
 * Business logic for savings goals. The Goals UI delegates every mutation here
 * so behaviour is consistent and testable:
 *
 *  - contribute / withdraw  → optionally moves REAL money via MoneyMovementService
 *                             and records a GoalContribution on the goal
 *  - auto-save engine        → runs monthly, idempotent per 'YYYY-MM'
 *  - milestones              → 25/50/75/100% auto-tracked
 *  - pacing analytics        → required monthly savings, on-track status, ETA
 *
 * This is also where Goals connects to the rest of the app (accounts,
 * transactions, timeline) so a contribution actually changes your balance.
 */

import { db, Goal, GoalContribution, generateUUID } from '@/db/schema'
import { MoneyMovementService } from '@/services/MoneyMovementService'
import { formatCurrency } from '@/lib/utils'

export interface GoalPacing {
  progress: number // 0-100
  remaining: number
  monthsLeft: number | null // null if no target date / past due
  requiredPerMonth: number | null // amount/month needed to hit target by date
  projectedCompletion: Date | null // based on recent contribution rate
  status: 'achieved' | 'on_track' | 'behind' | 'no_date' | 'at_risk'
  isAchieved: boolean
}

export const GOAL_MILESTONE_PERCENTS = [25, 50, 75, 100]

export class GoalService {
  /** Standard milestone set (25/50/75/100%) for a target amount. */
  static buildMilestones(targetAmount: number): NonNullable<Goal['milestones']> {
    return GOAL_MILESTONE_PERCENTS.map(pct => ({
      amount: Math.round((targetAmount * pct) / 100),
      date: '',
      completed: false,
    }))
  }

  /** Create a goal with sensible defaults + milestones. */
  static async create(input: {
    title: string
    targetAmount: number
    targetDate?: string
    category?: string
    priority?: Goal['priority']
    fundingAccountId?: string
    autoSave?: boolean
    autoSaveAmount?: number
    autoSaveDay?: number
    initialAmount?: number
  }): Promise<string> {
    const id = generateUUID()
    const goal: Goal = {
      id,
      title: input.title.trim(),
      targetAmount: input.targetAmount,
      currentAmount: 0,
      targetDate: input.targetDate || '',
      category: input.category?.trim() || 'General',
      priority: input.priority || 'medium',
      milestones: this.buildMilestones(input.targetAmount),
      autoSave: input.autoSave ?? false,
      autoSaveAmount: input.autoSaveAmount,
      autoSaveDay: input.autoSaveDay,
      fundingAccountId: input.fundingAccountId || undefined,
      contributions: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    await db.goals.add(goal)

    if (input.initialAmount && input.initialAmount > 0) {
      await this.contribute(id, input.initialAmount)
    }
    return id
  }

  /**
   * Contribute (delta > 0) or withdraw (delta < 0) toward a goal.
   * Clamps so currentAmount stays within [0, targetAmount]. When the goal has
   * a fundingAccountId, real money moves and a ledger transaction is created.
   */
  static async applyDelta(
    goalId: string,
    delta: number,
    opts: { auto?: boolean; date?: string } = {}
  ): Promise<void> {
    if (delta === 0) return

    await db.transaction(
      'rw',
      [db.goals, db.accounts, db.assets, db.transactions, db.systemLogs],
      async () => {
        const goal = await db.goals.get(goalId)
        if (!goal) return

        const nextAmount = Math.max(0, Math.min(goal.targetAmount, goal.currentAmount + delta))
        const actualDelta = nextAmount - goal.currentAmount
        if (actualDelta === 0) return

        const isContribution = actualDelta > 0
        const magnitude = Math.abs(actualDelta)
        let transactionId: string | undefined
        let accountId: string | undefined

        if (goal.fundingAccountId) {
          const account = await db.accounts.get(goal.fundingAccountId)
          if (account) {
            accountId = account.id
            const res = await MoneyMovementService.apply({
              accountId: account.id,
              type: isContribution ? 'expense' : 'income',
              amount: magnitude,
              category: isContribution ? 'Savings' : 'Savings Withdrawal',
              description: isContribution
                ? `Contribution to goal: ${goal.title}`
                : `Withdrawal from goal: ${goal.title}`,
              logType: 'goal',
              date: opts.date,
              tags: ['goal', goal.title],
            })
            transactionId = res.transactionId
          }
        }

        const contribution: GoalContribution = {
          id: generateUUID(),
          date: opts.date || new Date().toISOString().split('T')[0],
          amount: actualDelta,
          accountId,
          transactionId,
          auto: opts.auto,
        }

        const milestones = this.updateMilestones(goal.milestones, nextAmount, goal.targetAmount)
        const status: Goal['status'] = nextAmount >= goal.targetAmount ? 'achieved' : 'active'

        await db.goals.update(goal.id, {
          currentAmount: nextAmount,
          contributions: [...(goal.contributions || []), contribution],
          milestones,
          status,
        })
      }
    )
  }

  static contribute(goalId: string, amount: number, opts?: { auto?: boolean; date?: string }) {
    return this.applyDelta(goalId, Math.abs(amount), opts)
  }

  static withdraw(goalId: string, amount: number, opts?: { date?: string }) {
    return this.applyDelta(goalId, -Math.abs(amount), opts)
  }

  /** Mark milestones complete as the saved amount crosses each threshold. */
  static updateMilestones(
    milestones: Goal['milestones'],
    currentAmount: number,
    targetAmount: number
  ): Goal['milestones'] {
    const base = milestones && milestones.length > 0 ? milestones : this.buildMilestones(targetAmount)
    const today = new Date().toISOString().split('T')[0]
    return base.map(m => {
      const reached = currentAmount >= m.amount
      if (reached && !m.completed) {
        return { ...m, completed: true, date: today }
      }
      if (!reached && m.completed) {
        // Withdrew below a milestone — un-complete it.
        return { ...m, completed: false, date: '' }
      }
      return m
    })
  }

  /**
   * Run the monthly auto-save engine. Idempotent per calendar month via
   * `lastAutoSaveMonth`. For each eligible goal (autoSave on, has account &
   * amount, not yet achieved, due day has passed), move the configured amount.
   * Returns the number of goals funded this run.
   */
  static async runAutoSave(now: Date = new Date()): Promise<number> {
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const dayOfMonth = now.getDate()
    const goals = await db.goals.toArray()
    let funded = 0

    for (const goal of goals) {
      if (!goal.autoSave) continue
      if (!goal.fundingAccountId) continue
      if (!goal.autoSaveAmount || goal.autoSaveAmount <= 0) continue
      if (goal.currentAmount >= goal.targetAmount) continue
      if (goal.lastAutoSaveMonth === monthKey) continue

      const due = Math.min(28, goal.autoSaveDay || 1)
      if (dayOfMonth < due) continue // not time yet this month

      const account = await db.accounts.get(goal.fundingAccountId)
      if (!account) continue

      const remaining = goal.targetAmount - goal.currentAmount
      const amount = Math.min(goal.autoSaveAmount, remaining, Math.max(0, account.balance))
      if (amount <= 0) {
        // Not enough funds — record the attempt so we don't retry endlessly
        await db.goals.update(goal.id, { lastAutoSaveMonth: monthKey })
        continue
      }

      await this.contribute(goal.id, amount, { auto: true })
      await db.goals.update(goal.id, { lastAutoSaveMonth: monthKey })

      await db.notifications.add({
        id: generateUUID(),
        type: 'goal_progress',
        title: 'Auto-save ran',
        message: `${formatCurrency(amount)} moved into "${goal.title}" from ${account.name}.`,
        read: false,
        timestamp: new Date().toISOString(),
      })
      funded++
    }
    return funded
  }

  /** Pacing analytics for a single goal. */
  static getPacing(goal: Goal, now: Date = new Date()): GoalPacing {
    const progress = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount)
    const isAchieved = goal.currentAmount >= goal.targetAmount

    if (isAchieved) {
      return {
        progress: 100, remaining: 0, monthsLeft: null, requiredPerMonth: null,
        projectedCompletion: null, status: 'achieved', isAchieved: true,
      }
    }

    // Recent contribution rate (last 90 days) → projected completion.
    const contributions = goal.contributions || []
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 90)
    const recentNet = contributions
      .filter(c => new Date(c.date) >= cutoff)
      .reduce((s, c) => s + c.amount, 0)
    const monthlyRate = recentNet / 3 // per month over the 90-day window
    let projectedCompletion: Date | null = null
    if (monthlyRate > 0) {
      const monthsToFinish = Math.ceil(remaining / monthlyRate)
      projectedCompletion = new Date(now)
      projectedCompletion.setMonth(projectedCompletion.getMonth() + monthsToFinish)
    }

    if (!goal.targetDate) {
      return {
        progress, remaining, monthsLeft: null, requiredPerMonth: null,
        projectedCompletion, status: 'no_date', isAchieved: false,
      }
    }

    const target = new Date(goal.targetDate)
    const msLeft = target.getTime() - now.getTime()
    const monthsLeft = msLeft <= 0 ? 0 : Math.max(1, Math.round(msLeft / (1000 * 60 * 60 * 24 * 30.44)))
    const requiredPerMonth = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining

    let status: GoalPacing['status']
    if (msLeft <= 0) {
      status = 'at_risk' // past the target date and not done
    } else if (monthlyRate >= requiredPerMonth) {
      status = 'on_track'
    } else if (monthlyRate > 0) {
      status = 'behind'
    } else {
      status = 'at_risk'
    }

    return {
      progress, remaining, monthsLeft, requiredPerMonth,
      projectedCompletion, status, isAchieved: false,
    }
  }

  static async delete(goalId: string): Promise<void> {
    await db.goals.delete(goalId)
  }

  /** Aggregate totals for the summary header. */
  static summarize(goals: Goal[]) {
    const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0)
    const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0)
    const achieved = goals.filter(g => g.currentAmount >= g.targetAmount).length
    const monthlyCommitment = goals
      .filter(g => g.autoSave && g.autoSaveAmount && g.currentAmount < g.targetAmount)
      .reduce((s, g) => s + (g.autoSaveAmount || 0), 0)
    return {
      totalTarget,
      totalSaved,
      achieved,
      active: goals.length - achieved,
      overallProgress: totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0,
      monthlyCommitment,
    }
  }

  /** Priority sort: high → medium → low, then soonest target date. */
  static sortByPriority(goals: Goal[]): Goal[] {
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 }
    return [...goals].sort((a, b) => {
      const pa = rank[a.priority || 'medium'] ?? 1
      const pb = rank[b.priority || 'medium'] ?? 1
      if (pa !== pb) return pa - pb
      if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate)
      if (a.targetDate) return -1
      if (b.targetDate) return 1
      return 0
    })
  }
}
