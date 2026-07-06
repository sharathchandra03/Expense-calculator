/**
 * LendingRepository
 * 
 * Handles all CRUD operations for lending records.
 * No business logic - only data access.
 */

import { db, Lending } from '@/db/schema'

export class LendingRepository {
  /**
   * Create a new lending record
   */
  static async create(data: Omit<Lending, 'id'>): Promise<string> {
    return await db.lending.add(data as any)
  }

  /**
   * Get lending record by ID
   */
  static async getById(id: string): Promise<Lending | undefined> {
    return await db.lending.get(id)
  }

  /**
   * Get all lending records
   */
  static async getAll(): Promise<Lending[]> {
    return await db.lending.toArray()
  }

  /**
   * Get active lending records
   */
  static async getActive(): Promise<Lending[]> {
    const records = await this.getAll()
    return records.filter(l => l.status === 'active')
  }

  /**
   * Get paid lending records
   */
  static async getPaid(): Promise<Lending[]> {
    const records = await this.getAll()
    return records.filter(l => l.status === 'paid')
  }

  /**
   * Get money lent (not borrowed)
   */
  static async getLent(): Promise<Lending[]> {
    return await db.lending
      .where('type')
      .equals('lent')
      .toArray()
  }

  /**
   * Get money borrowed
   */
  static async getBorrowed(): Promise<Lending[]> {
    return await db.lending
      .where('type')
      .equals('borrowed')
      .toArray()
  }

  /**
   * Get active lending (money lent out)
   */
  static async getActiveLent(): Promise<Lending[]> {
    return await db.lending
      .where('type')
      .equals('lent')
      .filter(l => l.status === 'active')
      .toArray()
  }

  /**
   * Get active borrowing (money owed)
   */
  static async getActiveBorrowed(): Promise<Lending[]> {
    return await db.lending
      .where('type')
      .equals('borrowed')
      .filter(l => l.status === 'active')
      .toArray()
  }

  /**
   * Get overdue lending (past repayment date and unpaid)
   */
  static async getOverdue(): Promise<Lending[]> {
    const active = await this.getActive()
    const today = new Date().toISOString().split('T')[0]
    return active.filter(l => l.expectedRepaymentDate && l.expectedRepaymentDate < today)
  }

  /**
   * Get lending records by contact
   */
  static async getByContact(contactName: string): Promise<Lending[]> {
    return await db.lending
      .where('contactName')
      .equals(contactName)
      .toArray()
  }

  /**
   * Update lending record
   */
  static async update(id: string, data: Partial<Lending>): Promise<void> {
    await db.lending.update(id, data)
  }

  /**
   * Mark lending as paid
   */
  static async markPaid(id: string): Promise<void> {
    await db.lending.update(id, { status: 'paid' })
  }

  /**
   * Delete lending record
   */
  static async delete(id: string): Promise<void> {
    await db.lending.delete(id)
  }

  /**
   * Get total amount lent (active)
   */
  static async getTotalLent(): Promise<number> {
    const lent = await this.getActiveLent()
    return lent.reduce((sum, l) => sum + l.amount, 0)
  }

  /**
   * Get total amount borrowed (active)
   */
  static async getTotalBorrowed(): Promise<number> {
    const borrowed = await this.getActiveBorrowed()
    return borrowed.reduce((sum, l) => sum + l.amount, 0)
  }

  /**
   * Calculate accrued interest for a record
   */
  static async calculateInterest(id: string): Promise<number> {
    const lending = await this.getById(id)
    if (!lending || lending.interestType === 'none') return 0

    const createdAt = new Date(lending.createdAt)
    const now = new Date()
    const daysPassed = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
    const annualRate = lending.interestRate / 100

    if (lending.interestType === 'simple') {
      return lending.amount * annualRate * (daysPassed / 365)
    } else if (lending.interestType === 'compound') {
      const principal = lending.amount
      return principal * (Math.pow(1 + annualRate / 365, daysPassed) - 1)
    }

    return 0
  }

  /**
   * Get total accrued interest from all active lending
   */
  static async getTotalInterest(): Promise<number> {
    const active = await this.getActiveLent()
    let total = 0
    for (const record of active) {
      total += await this.calculateInterest(record.id)
    }
    return total
  }

  /**
   * Clear all lending records
   */
  static async clear(): Promise<void> {
    await db.lending.clear()
  }
}
