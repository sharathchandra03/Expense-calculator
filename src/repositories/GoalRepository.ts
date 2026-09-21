/**
 * GoalRepository
 * 
 * Handles all CRUD operations for goals.
 * No business logic - only data access.
 */

import { db, Goal } from '@/db/schema'

export class GoalRepository {
  /**
   * Create a new goal
   */
  static async create(data: Omit<Goal, 'id'>): Promise<string> {
    return await db.goals.add(data as any)
  }

  /**
   * Get goal by ID
   */
  static async getById(id: string): Promise<Goal | undefined> {
    return await db.goals.get(id)
  }

  /**
   * Get all goals
   */
  static async getAll(): Promise<Goal[]> {
    return await db.goals.toArray()
  }

  /**
   * Get active goals (not yet completed)
   */
  static async getActive(): Promise<Goal[]> {
    const goals = await this.getAll()
    return goals.filter(g => g.currentAmount < g.targetAmount)
  }

  /**
   * Get completed goals
   */
  static async getCompleted(): Promise<Goal[]> {
    const goals = await this.getAll()
    return goals.filter(g => g.currentAmount >= g.targetAmount)
  }

  /**
   * Get goals by category
   */
  static async getByCategory(category: string): Promise<Goal[]> {
    return await db.goals
      .where('category')
      .equals(category)
      .toArray()
  }

  /**
   * Update goal
   */
  static async update(id: string, data: Partial<Goal>): Promise<void> {
    await db.goals.update(id, data)
  }

  /**
   * Update goal current amount
   */
  static async updateAmount(id: string, newAmount: number): Promise<void> {
    await db.goals.update(id, { currentAmount: newAmount })
  }

  /**
   * Contribute to a goal
   */
  static async contribute(id: string, amount: number): Promise<void> {
    const goal = await this.getById(id)
    if (goal) {
      await db.goals.update(id, { currentAmount: goal.currentAmount + amount })
    }
  }

  /**
   * Delete goal
   */
  static async delete(id: string): Promise<void> {
    await db.goals.delete(id)
  }

  /**
   * Get progress percentage for a goal
   */
  static async getProgress(id: string): Promise<number> {
    const goal = await this.getById(id)
    if (!goal) return 0
    return Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)
  }

  /**
   * Get total target amount for all goals
   */
  static async getTotalTarget(): Promise<number> {
    const goals = await this.getAll()
    return goals.reduce((sum, g) => sum + g.targetAmount, 0)
  }

  /**
   * Get total current amount saved across all goals
   */
  static async getTotalCurrent(): Promise<number> {
    const goals = await this.getAll()
    return goals.reduce((sum, g) => sum + g.currentAmount, 0)
  }

  /**
   * Clear all goals
   */
  static async clear(): Promise<void> {
    await db.goals.clear()
  }
}
