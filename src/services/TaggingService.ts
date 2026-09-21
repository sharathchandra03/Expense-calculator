/**
 * TaggingService
 * Manages transaction tagging and filtering
 */

import { Transaction, Tag } from '@/db/schema'

export interface TagCloud {
  tag: string
  count: number
  percentage: number
  color?: string
}

export class TaggingService {
  /**
   * Get all tags from transactions
   */
  static extractAllTags(transactions: Transaction[]): string[] {
    const tags = new Set<string>()
    transactions.forEach(tx => {
      if (tx.tags && Array.isArray(tx.tags)) {
        tx.tags.forEach(tag => tags.add(tag))
      }
    })
    return Array.from(tags)
  }

  /**
   * Generate tag cloud
   */
  static generateTagCloud(transactions: Transaction[]): TagCloud[] {
    const tagCounts: { [key: string]: number } = {}
    let totalTags = 0

    transactions.forEach(tx => {
      if (tx.tags) {
        tx.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1
          totalTags++
        })
      }
    })

    return Object.entries(tagCounts)
      .map(([tag, count]) => ({
        tag,
        count,
        percentage: totalTags > 0 ? (count / totalTags) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }

  /**
   * Filter transactions by tag
   */
  static filterByTag(transactions: Transaction[], tag: string): Transaction[] {
    return transactions.filter(tx => tx.tags && tx.tags.includes(tag))
  }

  /**
   * Filter transactions by multiple tags
   */
  static filterByMultipleTags(transactions: Transaction[], tags: string[], matchAll = false): Transaction[] {
    if (matchAll) {
      return transactions.filter(tx =>
        tx.tags && tags.every(tag => tx.tags!.includes(tag))
      )
    }
    return transactions.filter(tx =>
      tx.tags && tags.some(tag => tx.tags!.includes(tag))
    )
  }

  /**
   * Add tag to transaction
   */
  static addTag(transaction: Transaction, tag: string): Transaction {
    const tags = transaction.tags || []
    if (!tags.includes(tag)) {
      tags.push(tag)
    }
    return { ...transaction, tags }
  }

  /**
   * Remove tag from transaction
   */
  static removeTag(transaction: Transaction, tag: string): Transaction {
    return {
      ...transaction,
      tags: transaction.tags?.filter(t => t !== tag) || [],
    }
  }

  /**
   * Get tag statistics
   */
  static getTagStats(transactions: Transaction[]): {
    totalTags: number
    uniqueTags: number
    mostUsedTag: string | null
    averageTagsPerTransaction: number
  } {
    const tagCloud = this.generateTagCloud(transactions)
    const totalTags = tagCloud.reduce((sum, item) => sum + item.count, 0)
    const transactionsWithTags = transactions.filter(tx => tx.tags && tx.tags.length > 0)

    return {
      totalTags,
      uniqueTags: tagCloud.length,
      mostUsedTag: tagCloud.length > 0 ? tagCloud[0].tag : null,
      averageTagsPerTransaction: transactionsWithTags.length > 0
        ? totalTags / transactionsWithTags.length
        : 0,
    }
  }

  /**
   * Suggest tags based on category
   */
  static suggestTags(category: string, amount: number): string[] {
    const suggestions: { [key: string]: string[] } = {
      Food: ['grocery', 'dining', 'coffee'],
      Entertainment: ['movie', 'game', 'hobby'],
      Transport: ['commute', 'travel', 'uber'],
      Shopping: ['retail', 'online', 'sale'],
      Utilities: ['recurring', 'bill', 'household'],
    }

    const baseSuggestions = suggestions[category] || ['expense', 'transaction']
    if (amount > 5000) baseSuggestions.push('expensive')
    if (amount < 100) baseSuggestions.push('small')

    return baseSuggestions
  }
}
