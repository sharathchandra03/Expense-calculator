import Dexie, { type Table } from 'dexie';

// Define transaction structure
export interface Transaction {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  type: 'income' | 'expense';
  category: string;
  amount: number;
  accountId: string;
  description: string;
  isRecurring: boolean;
  recurrenceRule?: 'weekly' | 'monthly' | 'yearly';
  tags?: string[]; // NEW: Transaction tags
  notes?: string; // NEW: Additional notes
}

// Define lending structure (loans given to/taken from others)
export interface Lending {
  id: string;
  contactName: string;
  type: 'lent' | 'borrowed';
  amount: number;
  interestRate: number; // annual interest in % (e.g. 5 for 5%)
  interestType: 'none' | 'simple' | 'compound';
  expectedRepaymentDate?: string; // YYYY-MM-DD
  status: 'active' | 'paid';
  createdAt: string; // YYYY-MM-DD
  description?: string;
}

// Define assets structure (cash, bank, stock, gold, crypto, etc.)
export interface Asset {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'stock' | 'crypto' | 'real_estate' | 'gold';
  balance: number;
  valuationHistory: { date: string; value: number }[]; // Track over time
}

// Define bills structure
export interface Bill {
  id: string;
  title: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  category: string;
  isPaid: boolean;
  isRecurring: boolean;
  recurrenceRule?: 'monthly' | 'yearly';
}

// Define goals structure
export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string; // YYYY-MM-DD
  category: string;
  priority?: 'low' | 'medium' | 'high'; // NEW
  milestones?: Array<{ amount: number; date: string; completed: boolean }>; // NEW
  autoSave?: boolean; // NEW: Auto-save toward goal
  autoSaveAmount?: number; // NEW: Monthly auto-save amount
}

// Define accounts structure
export interface Account {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'card' | 'investment' | 'crypto'; // UPDATED
  balance: number;
  currency?: string; // NEW: Currency code (USD, INR, etc.)
  icon?: string; // NEW: Account icon/emoji
  balanceHistory?: Array<{ date: string; balance: number }>; // NEW: Historical balances
}

// Define system logs structure (chronological timeline)
export interface SystemLog {
  id: string;
  timestamp: string; // ISO timestamp
  type: 'transaction' | 'lending' | 'asset' | 'bill' | 'goal' | 'system';
  description: string;
  amount?: number;
}

// NEW: Budget structure
export interface Budget {
  id: string;
  name: string;
  category: string;
  limit: number;
  period: 'weekly' | 'monthly' | 'yearly'; // NEW
  spent: number;
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  alertThreshold: number; // % of limit before alert (e.g., 80)
  isActive: boolean;
}

// NEW: Custom Category
export interface CustomCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  color?: string;
  createdAt: string;
}

// NEW: Tag structure
export interface Tag {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

// NEW: Investment structure
export interface Investment {
  id: string;
  name: string;
  type: 'stock' | 'crypto' | 'mutual_fund' | 'etf' | 'real_estate' | 'gold';
  symbol?: string; // e.g., AAPL, BTC
  quantity: number;
  buyPrice: number;
  currentPrice: number;
  currentValue: number;
  purchaseDate: string;
  accountId: string;
  notes?: string;
}

// NEW: Notification structure
export interface Notification {
  id: string;
  type: 'bill_due' | 'budget_warning' | 'goal_progress' | 'transaction' | 'system';
  title: string;
  message: string;
  read: boolean;
  timestamp: string;
  actionUrl?: string;
}

// NEW: Financial Brief structure
export interface FinancialBrief {
  id: string;
  period: 'week' | 'month';
  startDate: string;
  endDate: string;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  topCategories: Array<{ category: string; amount: number }>;
  insights: string[];
  generatedAt: string;
}

class PennyFlowDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  lending!: Table<Lending, string>;
  assets!: Table<Asset, string>;
  bills!: Table<Bill, string>;
  goals!: Table<Goal, string>;
  accounts!: Table<Account, string>;
  systemLogs!: Table<SystemLog, string>;
  budgets!: Table<Budget, string>; // NEW
  customCategories!: Table<CustomCategory, string>; // NEW
  tags!: Table<Tag, string>; // NEW
  investments!: Table<Investment, string>; // NEW
  notifications!: Table<Notification, string>; // NEW
  financialBriefs!: Table<FinancialBrief, string>; // NEW

  constructor() {
    super('PennyFlowDatabase');
    this.version(2).stores({
      transactions: 'id, date, type, category, accountId',
      lending: 'id, contactName, type, status, createdAt',
      assets: 'id, name, type',
      bills: 'id, title, dueDate, isPaid',
      goals: 'id, title, targetDate',
      accounts: 'id, name, type',
      systemLogs: 'id, timestamp, type',
      budgets: 'id, category, period', // NEW
      customCategories: 'id, name, type', // NEW
      tags: 'id, name', // NEW
      investments: 'id, name, symbol, accountId', // NEW
      notifications: 'id, type, timestamp', // NEW
      financialBriefs: 'id, period, startDate', // NEW
    });
  }
}

export const db = new PennyFlowDatabase();

// Utility for safe UUID generation
export function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Helper to initialize database (no seed data - fresh start for real user data)
export async function seedDatabaseIfEmpty() {
  const accountCount = await db.accounts.count();
  if (accountCount > 0) return; // Already initialized

  // Just log a welcome entry so the timeline isn't completely empty
  await db.systemLogs.add({
    id: generateUUID(),
    timestamp: new Date().toISOString(),
    type: 'system',
    description: 'Welcome to PennyFlow. Your local database is ready.',
  });
}

// Synchronize Account Balance changes to Assets table
export async function syncAccountToAsset(accountName: string, newBalance: number) {
  const matchingAsset = await db.assets.where('name').equalsIgnoreCase(accountName).first();
  if (matchingAsset) {
    const todayStr = new Date().toISOString().split('T')[0];
    const updatedHistory = [...matchingAsset.valuationHistory];
    const existingIndex = updatedHistory.findIndex(v => v.date === todayStr);
    
    if (existingIndex >= 0) {
      updatedHistory[existingIndex].value = newBalance;
    } else {
      updatedHistory.push({ date: todayStr, value: newBalance });
    }
    
    await db.assets.update(matchingAsset.id, {
      balance: newBalance,
      valuationHistory: updatedHistory
    });
  }
}

// Synchronize Asset Balance changes to Accounts table
export async function syncAssetToAccount(assetName: string, newBalance: number) {
  const matchingAccount = await db.accounts.where('name').equalsIgnoreCase(assetName).first();
  if (matchingAccount) {
    await db.accounts.update(matchingAccount.id, {
      balance: newBalance
    });
  }
}
