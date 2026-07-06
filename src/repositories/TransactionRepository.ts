/**
 * TransactionRepository
 * 
 * Handles all CRUD operations for transactions.
 * No business logic - only data access.
 */

import { db, Transaction } from '@/db/schema'

export class TransactionRepository {
  /**
   * Create a new transaction
   */
  static async create(data: Omit<Transaction, 'id'>): Promise<string> {
    return await db.transactions.add(data as any)
  }

  /**
   * Get transaction by ID
   */
  static async getById(id: string): Promise<Transaction | undefined> {
    return await db.transactions.get(id)
  }

  /**
   * Get all transactions
   */
  static async getAll(): Promise<Transaction[]> {
    return await db.transactions.toArray()
  }

  /**
   * Get transactions by date range
   */
  static async getByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
    return await db.transactions
      .where('date')
      .between(startDate, endDate)
      .toArray()
  }

  /**
   * Get transactions by type
   */
  static async getByType(type: 'income' | 'expense' | 'transfer'): Promise<Transaction[]> {
    return await db.transactions
      .where('type')
      .equals(type)
      .toArray()
  }

  /**
   * Get transactions by category
   */
  static async getByCategory(category: string): Promise<Transaction[]> {
    return await db.transactions
      .where('category')
      .equals(category)
      .toArray()
  }

  /**
   * Update transaction
   */
  static async update(id: string, data: Partial<Transaction>): Promise<void> {
    await db.transactions.update(id, data)
  }

  /**
   * Delete transaction
   */
  static async delete(id: string): Promise<void> {
    await db.transactions.delete(id)
  }

  /**
   * Get recent transactions
   */
  static async getRecent(limit: number = 10): Promise<Transaction[]> {
    return await db.transactions
      .orderBy('date')
      .reverse()
      .limit(limit)
      .toArray()
  }

  /**
   * Get transactions count
   */
  static async count(): Promise<number> {
    return await db.transactions.count()
  }

  /**
   * Clear all transactions
   */
  static async clear(): Promise<void> {
    await db.transactions.clear()
  }
}
