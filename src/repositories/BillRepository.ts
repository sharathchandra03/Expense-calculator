/**
 * BillRepository
 * 
 * Handles all CRUD operations for bills.
 * No business logic - only data access.
 */

import { db, Bill } from '@/db/schema'

export class BillRepository {
  /**
   * Create a new bill
   */
  static async create(data: Omit<Bill, 'id'>): Promise<string> {
    return await db.bills.add(data as any)
  }

  /**
   * Get bill by ID
   */
  static async getById(id: string): Promise<Bill | undefined> {
    return await db.bills.get(id)
  }

  /**
   * Get all bills
   */
  static async getAll(): Promise<Bill[]> {
    return await db.bills.toArray()
  }

  /**
   * Get unpaid bills
   */
  static async getUnpaid(): Promise<Bill[]> {
    const bills = await this.getAll()
    return bills.filter(b => !b.isPaid)
  }

  /**
   * Get paid bills
   */
  static async getPaid(): Promise<Bill[]> {
    const bills = await this.getAll()
    return bills.filter(b => b.isPaid)
  }

  /**
   * Get upcoming bills (unpaid and due in future)
   */
  static async getUpcoming(): Promise<Bill[]> {
    const unpaid = await this.getUnpaid()
    const today = new Date().toISOString().split('T')[0]
    return unpaid.filter(b => b.dueDate >= today).sort((a, b) => 
      new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    )
  }

  /**
   * Get overdue bills
   */
  static async getOverdue(): Promise<Bill[]> {
    const unpaid = await this.getUnpaid()
    const today = new Date().toISOString().split('T')[0]
    return unpaid.filter(b => b.dueDate < today)
  }

  /**
   * Get bills due this month
   */
  static async getThisMonth(): Promise<Bill[]> {
    const now = new Date()
    const bills = await this.getAll()
    return bills.filter(b => {
      const dueDate = new Date(b.dueDate)
      return dueDate.getMonth() === now.getMonth() && dueDate.getFullYear() === now.getFullYear()
    })
  }

  /**
   * Get recurring bills
   */
  static async getRecurring(): Promise<Bill[]> {
    const bills = await this.getAll()
    return bills.filter(b => b.isRecurring)
  }

  /**
   * Get bills by category
   */
  static async getByCategory(category: string): Promise<Bill[]> {
    return await db.bills
      .where('category')
      .equals(category)
      .toArray()
  }

  /**
   * Update bill
   */
  static async update(id: string, data: Partial<Bill>): Promise<void> {
    await db.bills.update(id, data)
  }

  /**
   * Mark bill as paid
   */
  static async markPaid(id: string): Promise<void> {
    await db.bills.update(id, { isPaid: true })
  }

  /**
   * Mark bill as unpaid
   */
  static async markUnpaid(id: string): Promise<void> {
    await db.bills.update(id, { isPaid: false })
  }

  /**
   * Delete bill
   */
  static async delete(id: string): Promise<void> {
    await db.bills.delete(id)
  }

  /**
   * Get total of unpaid bills this month
   */
  static async getMonthlyTotal(): Promise<number> {
    const bills = await this.getThisMonth()
    return bills.filter(b => !b.isPaid).reduce((sum, b) => sum + b.amount, 0)
  }

  /**
   * Clear all bills
   */
  static async clear(): Promise<void> {
    await db.bills.clear()
  }
}
