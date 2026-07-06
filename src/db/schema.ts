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

class FinanceOSDatabase extends Dexie {
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
    super('FinanceOSDatabase');
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

export const db = new FinanceOSDatabase();

// Utility for safe UUID generation
export function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Helper to seed data if database is empty
export async function seedDatabaseIfEmpty() {
  const accountCount = await db.accounts.count();
  if (accountCount > 0) return; // Already seeded

  console.log('Seeding mock data for premium personal finance experience...');

  // Setup Accounts
  const chaseCheckingId = generateUUID();
  const cashWalletId = generateUUID();
  const vanguardId = generateUUID();
  const bitcoinId = generateUUID();

  const mockAccounts: Account[] = [
    { id: chaseCheckingId, name: 'Chase Checking', type: 'bank', balance: 14750.80 },
    { id: cashWalletId, name: 'Cash Wallet', type: 'cash', balance: 450.00 },
    { id: vanguardId, name: 'Vanguard Brokerage', type: 'bank', balance: 45000.00 },
    { id: bitcoinId, name: 'Bitcoin Wallet', type: 'bank', balance: 14148.00 },
  ];

  // Setup Assets
  const mockAssets: Asset[] = [
    {
      id: generateUUID(),
      name: 'Chase Checking',
      type: 'bank',
      balance: 14750.80,
      valuationHistory: [
        { date: '2026-04-01', value: 12100.00 },
        { date: '2026-05-01', value: 13500.00 },
        { date: '2026-06-01', value: 14750.80 }
      ]
    },
    {
      id: generateUUID(),
      name: 'Cash Wallet',
      type: 'cash',
      balance: 450.00,
      valuationHistory: [
        { date: '2026-04-01', value: 400.00 },
        { date: '2026-05-01', value: 420.00 },
        { date: '2026-06-01', value: 450.00 }
      ]
    },
    {
      id: generateUUID(),
      name: 'Vanguard Brokerage',
      type: 'stock',
      balance: 45000.00,
      valuationHistory: [
        { date: '2026-04-01', value: 41200.00 },
        { date: '2026-05-01', value: 43100.00 },
        { date: '2026-06-01', value: 45000.00 }
      ]
    },
    {
      id: generateUUID(),
      name: 'Bitcoin Wallet',
      type: 'crypto',
      balance: 14148.00,
      valuationHistory: [
        { date: '2026-04-01', value: 11000.00 },
        { date: '2026-05-01', value: 12500.00 },
        { date: '2026-06-01', value: 14148.00 }
      ]
    },
    {
      id: generateUUID(),
      name: 'Physical Gold Bar',
      type: 'gold',
      balance: 3200.00,
      valuationHistory: [
        { date: '2026-04-01', value: 3100.00 },
        { date: '2026-05-01', value: 3150.00 },
        { date: '2026-06-01', value: 3200.00 }
      ]
    }
  ];

  // Setup Transactions
  const mockTransactions: Transaction[] = [
    {
      id: generateUUID(),
      date: '2026-06-01',
      type: 'income',
      category: 'Salary',
      amount: 4500.00,
      accountId: chaseCheckingId,
      description: 'Acme Corp Monthly Salary',
      isRecurring: true,
      recurrenceRule: 'monthly'
    },
    {
      id: generateUUID(),
      date: '2026-06-04',
      type: 'expense',
      category: 'Entertainment',
      amount: 179.00,
      accountId: chaseCheckingId,
      description: 'Spotify Premium Duo Yearly',
      isRecurring: true,
      recurrenceRule: 'monthly'
    },
    {
      id: generateUUID(),
      date: '2026-06-04',
      type: 'expense',
      category: 'Shopping',
      amount: 1248.00,
      accountId: chaseCheckingId,
      description: 'Amazon Prime Purchases',
      isRecurring: false
    },
    {
      id: generateUUID(),
      date: '2026-06-10',
      type: 'expense',
      category: 'Food',
      amount: 320.50,
      accountId: chaseCheckingId,
      description: 'Weekly Groceries Whole Foods',
      isRecurring: false
    },
    {
      id: generateUUID(),
      date: '2026-06-12',
      type: 'expense',
      category: 'Utilities',
      amount: 85.00,
      accountId: chaseCheckingId,
      description: 'Electricity Bill',
      isRecurring: true,
      recurrenceRule: 'monthly'
    },
    {
      id: generateUUID(),
      date: '2026-06-15',
      type: 'income',
      category: 'Investments',
      amount: 320.00,
      accountId: vanguardId,
      description: 'Vanguard Dividend Payout',
      isRecurring: false
    },
    {
      id: generateUUID(),
      date: '2026-06-20',
      type: 'expense',
      category: 'Food',
      amount: 98.40,
      accountId: cashWalletId,
      description: 'Dinner with Friends',
      isRecurring: false
    },
    {
      id: generateUUID(),
      date: '2026-06-25',
      type: 'expense',
      category: 'Transport',
      amount: 45.00,
      accountId: chaseCheckingId,
      description: 'Fuel Fillup',
      isRecurring: false
    }
  ];

  // Setup Lending (contacts and interest tracking)
  const mockLending: Lending[] = [
    {
      id: generateUUID(),
      contactName: 'Sarah Chen',
      type: 'lent',
      amount: 5000.00,
      interestRate: 8.0, // 8% simple interest per year
      interestType: 'simple',
      expectedRepaymentDate: '2026-12-01',
      status: 'active',
      createdAt: '2026-04-15',
      description: 'Assisted with boutique business launch'
    },
    {
      id: generateUUID(),
      contactName: 'Alex Rivera',
      type: 'lent',
      amount: 1500.00,
      interestRate: 0.0,
      interestType: 'none',
      expectedRepaymentDate: '2026-08-30',
      status: 'active',
      createdAt: '2026-05-20',
      description: 'Interest-free personal help'
    },
    {
      id: generateUUID(),
      contactName: 'John Davis (Uncle)',
      type: 'borrowed',
      amount: 2500.00,
      interestRate: 3.0,
      interestType: 'simple',
      expectedRepaymentDate: '2026-11-15',
      status: 'active',
      createdAt: '2026-06-01',
      description: 'Family support loan'
    }
  ];

  // Setup Bills due
  const mockBills: Bill[] = [
    {
      id: generateUUID(),
      title: 'Adobe Creative Suite',
      amount: 30.00,
      dueDate: '2026-07-08',
      category: 'Work',
      isPaid: false,
      isRecurring: true,
      recurrenceRule: 'monthly'
    },
    {
      id: generateUUID(),
      title: 'Apartment Rent',
      amount: 1200.00,
      dueDate: '2026-07-10',
      category: 'Housing',
      isPaid: false,
      isRecurring: true,
      recurrenceRule: 'monthly'
    },
    {
      id: generateUUID(),
      title: 'Fiber Internet',
      amount: 65.00,
      dueDate: '2026-07-15',
      category: 'Utilities',
      isPaid: false,
      isRecurring: true,
      recurrenceRule: 'monthly'
    }
  ];

  // Setup Savings Goals
  const mockGoals: Goal[] = [
    {
      id: generateUUID(),
      title: 'Emergency Reserve Fund',
      targetAmount: 15000.00,
      currentAmount: 12000.00,
      targetDate: '2026-12-31',
      category: 'Safety'
    },
    {
      id: generateUUID(),
      title: 'New Carbon Road Bicycle',
      targetAmount: 3500.00,
      currentAmount: 700.00,
      targetDate: '2026-10-01',
      category: 'Leisure'
    }
  ];

  // Setup System/Timeline Logs
  const mockLogs: SystemLog[] = [
    {
      id: generateUUID(),
      timestamp: new Date('2026-06-01T09:00:00Z').toISOString(),
      type: 'system',
      description: 'Welcome to FinanceOS. Local secure IndexedDB initialized.'
    },
    {
      id: generateUUID(),
      timestamp: new Date('2026-06-01T10:00:00Z').toISOString(),
      type: 'transaction',
      description: 'Received monthly salary from Acme Corp',
      amount: 4500.00
    },
    {
      id: generateUUID(),
      timestamp: new Date('2026-06-04T15:30:00Z').toISOString(),
      type: 'transaction',
      description: 'Paid Spotify Premium subscription',
      amount: -179.00
    },
    {
      id: generateUUID(),
      timestamp: new Date('2026-06-15T12:00:00Z').toISOString(),
      type: 'transaction',
      description: 'Vanguard Index Fund valuation updated'
    },
    {
      id: generateUUID(),
      timestamp: new Date('2026-06-20T19:30:00Z').toISOString(),
      type: 'transaction',
      description: 'Added dining expense',
      amount: -98.40
    }
  ];

  // Run initial write inside a transaction
  await db.transaction('rw', [db.accounts, db.assets, db.transactions, db.lending, db.bills, db.goals, db.systemLogs], async () => {
    await db.accounts.bulkAdd(mockAccounts);
    await db.assets.bulkAdd(mockAssets);
    await db.transactions.bulkAdd(mockTransactions);
    await db.lending.bulkAdd(mockLending);
    await db.bills.bulkAdd(mockBills);
    await db.goals.bulkAdd(mockGoals);
    await db.systemLogs.bulkAdd(mockLogs);
  });

  console.log('Seeding finished successfully.');
}

// Synchronize Account Balance changes to Assets table
export async function syncAccountToAsset(accountName: string, newBalance: number) {
  let targetName = accountName;
  if (accountName === 'Chase Bank Account') targetName = 'Chase Checking';
  
  const matchingAsset = await db.assets.where('name').equalsIgnoreCase(targetName).first();
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
  let targetName = assetName;
  if (assetName === 'Chase Checking') targetName = 'Chase Bank Account';
  
  const matchingAccount = await db.accounts.where('name').equalsIgnoreCase(targetName).first();
  if (matchingAccount) {
    await db.accounts.update(matchingAccount.id, {
      balance: newBalance
    });
  }
}
