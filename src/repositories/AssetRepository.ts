/**
 * AssetRepository
 * 
 * Handles all CRUD operations for assets.
 * No business logic - only data access.
 */

import { db, Asset } from '@/db/schema'

export class AssetRepository {
  /**
   * Create a new asset
   */
  static async create(data: Omit<Asset, 'id'>): Promise<string> {
    return await db.assets.add(data as any)
  }

  /**
   * Get asset by ID
   */
  static async getById(id: string): Promise<Asset | undefined> {
    return await db.assets.get(id)
  }

  /**
   * Get all assets
   */
  static async getAll(): Promise<Asset[]> {
    return await db.assets.toArray()
  }

  /**
   * Get assets by type
   */
  static async getByType(type: string): Promise<Asset[]> {
    return await db.assets
      .where('type')
      .equals(type)
      .toArray()
  }

  /**
   * Get liquid assets (cash and bank)
   */
  static async getLiquid(): Promise<Asset[]> {
    return await db.assets
      .filter(a => a.type === 'cash' || a.type === 'bank')
      .toArray()
  }

  /**
   * Get invested assets (stocks, crypto, etc)
   */
  static async getInvested(): Promise<Asset[]> {
    return await db.assets
      .filter(a => a.type !== 'cash' && a.type !== 'bank')
      .toArray()
  }

  /**
   * Update asset
   */
  static async update(id: string, data: Partial<Asset>): Promise<void> {
    await db.assets.update(id, data)
  }

  /**
   * Update asset balance
   */
  static async updateBalance(id: string, newBalance: number): Promise<void> {
    const asset = await this.getById(id)
    if (asset) {
      const valuationEntry = {
        date: new Date().toISOString().split('T')[0],
        value: newBalance
      }
      const updatedHistory = asset.valuationHistory ? [...asset.valuationHistory, valuationEntry] : [valuationEntry]
      await db.assets.update(id, { balance: newBalance, valuationHistory: updatedHistory })
    }
  }

  /**
   * Delete asset
   */
  static async delete(id: string): Promise<void> {
    await db.assets.delete(id)
  }

  /**
   * Get total value of all assets
   */
  static async getTotalValue(): Promise<number> {
    const assets = await this.getAll()
    return assets.reduce((sum, a) => sum + a.balance, 0)
  }

  /**
   * Clear all assets
   */
  static async clear(): Promise<void> {
    await db.assets.clear()
  }
}
