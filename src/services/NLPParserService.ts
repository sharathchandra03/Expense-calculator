/**
 * Phase 0.7: Natural Language Parser for Quick-Add
 * Parses inputs like "food 200", "salary 50000 cash", "auto 150"
 * Extracts: category, amount, account (optional), type (expense/income)
 */

export interface ParsedTransaction {
  category: string | null
  amount: number | null
  accountHint: string | null
  type: 'expense' | 'income'
  confidence: number // 0-1
  rawInput: string
}

// Category mappings (aliases → normalized category name)
const CATEGORY_ALIASES: Record<string, { name: string; type: 'expense' | 'income' }> = {
  // Expense categories
  'food': { name: 'Food', type: 'expense' },
  'eat': { name: 'Food', type: 'expense' },
  'lunch': { name: 'Food', type: 'expense' },
  'dinner': { name: 'Food', type: 'expense' },
  'breakfast': { name: 'Food', type: 'expense' },
  'snack': { name: 'Food', type: 'expense' },
  'coffee': { name: 'Food', type: 'expense' },
  'tea': { name: 'Food', type: 'expense' },
  'groceries': { name: 'Food', type: 'expense' },
  'grocery': { name: 'Food', type: 'expense' },
  'transport': { name: 'Transport', type: 'expense' },
  'auto': { name: 'Transport', type: 'expense' },
  'cab': { name: 'Transport', type: 'expense' },
  'uber': { name: 'Transport', type: 'expense' },
  'ola': { name: 'Transport', type: 'expense' },
  'bus': { name: 'Transport', type: 'expense' },
  'metro': { name: 'Transport', type: 'expense' },
  'petrol': { name: 'Transport', type: 'expense' },
  'fuel': { name: 'Transport', type: 'expense' },
  'shopping': { name: 'Shopping', type: 'expense' },
  'shop': { name: 'Shopping', type: 'expense' },
  'clothes': { name: 'Shopping', type: 'expense' },
  'amazon': { name: 'Shopping', type: 'expense' },
  'flipkart': { name: 'Shopping', type: 'expense' },
  'entertainment': { name: 'Entertainment', type: 'expense' },
  'movie': { name: 'Entertainment', type: 'expense' },
  'movies': { name: 'Entertainment', type: 'expense' },
  'netflix': { name: 'Subscriptions', type: 'expense' },
  'spotify': { name: 'Subscriptions', type: 'expense' },
  'subscription': { name: 'Subscriptions', type: 'expense' },
  'sub': { name: 'Subscriptions', type: 'expense' },
  'utilities': { name: 'Utilities', type: 'expense' },
  'electric': { name: 'Utilities', type: 'expense' },
  'electricity': { name: 'Utilities', type: 'expense' },
  'water': { name: 'Utilities', type: 'expense' },
  'wifi': { name: 'Utilities', type: 'expense' },
  'internet': { name: 'Utilities', type: 'expense' },
  'phone': { name: 'Utilities', type: 'expense' },
  'recharge': { name: 'Utilities', type: 'expense' },
  'rent': { name: 'Rent', type: 'expense' },
  'health': { name: 'Healthcare', type: 'expense' },
  'hospital': { name: 'Healthcare', type: 'expense' },
  'medicine': { name: 'Healthcare', type: 'expense' },
  'medical': { name: 'Healthcare', type: 'expense' },
  'doctor': { name: 'Healthcare', type: 'expense' },
  'gym': { name: 'Healthcare', type: 'expense' },
  'education': { name: 'Education', type: 'expense' },
  'course': { name: 'Education', type: 'expense' },
  'books': { name: 'Education', type: 'expense' },
  'book': { name: 'Education', type: 'expense' },
  // Income categories
  'salary': { name: 'Salary', type: 'income' },
  'freelance': { name: 'Freelance', type: 'income' },
  'bonus': { name: 'Bonus', type: 'income' },
  'interest': { name: 'Interest', type: 'income' },
  'dividend': { name: 'Investment', type: 'income' },
  'investment': { name: 'Investment', type: 'income' },
  'gift': { name: 'Gift', type: 'income' },
  'refund': { name: 'Other', type: 'income' },
  'cashback': { name: 'Other', type: 'income' },
}

// Account hints
const ACCOUNT_ALIASES: Record<string, string> = {
  'cash': 'cash',
  'bank': 'bank',
  'card': 'card',
  'upi': 'bank',
  'gpay': 'bank',
  'phonepe': 'bank',
  'paytm': 'bank',
  'credit': 'card',
  'debit': 'bank',
}

export class NLPParserService {
  /**
   * Parse a natural language input into transaction components
   * Examples:
   *  "food 200" → { category: 'Food', amount: 200, type: 'expense' }
   *  "salary 50000 bank" → { category: 'Salary', amount: 50000, type: 'income', accountHint: 'bank' }
   *  "auto 150 cash" → { category: 'Transport', amount: 150, type: 'expense', accountHint: 'cash' }
   *  "200 coffee" → { category: 'Food', amount: 200, type: 'expense' }
   */
  static parse(input: string): ParsedTransaction {
    const raw = input.trim().toLowerCase()
    const tokens = raw.split(/\s+/)

    let category: string | null = null
    let amount: number | null = null
    let accountHint: string | null = null
    let type: 'expense' | 'income' = 'expense'
    let confidence = 0

    for (const token of tokens) {
      // Try to match as number (amount)
      const num = parseFloat(token.replace(/[₹,$,]/g, ''))
      if (!isNaN(num) && num > 0 && amount === null) {
        amount = num
        confidence += 0.4
        continue
      }

      // Try to match as category
      if (!category && CATEGORY_ALIASES[token]) {
        const match = CATEGORY_ALIASES[token]
        category = match.name
        type = match.type
        confidence += 0.4
        continue
      }

      // Try to match as account
      if (!accountHint && ACCOUNT_ALIASES[token]) {
        accountHint = ACCOUNT_ALIASES[token]
        confidence += 0.2
        continue
      }

      // Fuzzy match for category (partial match)
      if (!category) {
        const fuzzyMatch = Object.keys(CATEGORY_ALIASES).find(key => 
          key.startsWith(token) || token.startsWith(key)
        )
        if (fuzzyMatch) {
          const match = CATEGORY_ALIASES[fuzzyMatch]
          category = match.name
          type = match.type
          confidence += 0.3
        }
      }
    }

    return {
      category,
      amount,
      accountHint,
      type,
      confidence: Math.min(1, confidence),
      rawInput: input,
    }
  }

  /**
   * Check if the parsed result has enough info to create a transaction
   */
  static isComplete(parsed: ParsedTransaction): boolean {
    return parsed.amount !== null && parsed.amount > 0 && parsed.category !== null
  }

  /**
   * Get a human-readable summary of the parsed input
   */
  static getSummary(parsed: ParsedTransaction): string {
    const parts: string[] = []
    if (parsed.type === 'income') parts.push('Income:')
    if (parsed.category) parts.push(parsed.category)
    if (parsed.amount) parts.push(`₹${parsed.amount.toLocaleString()}`)
    if (parsed.accountHint) parts.push(`(${parsed.accountHint})`)
    return parts.join(' ') || 'Type something like "food 200"'
  }
}
