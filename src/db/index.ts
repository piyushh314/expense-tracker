// ============================================================
// Dexie.js Database — IndexedDB wrapper for offline-first storage
// ============================================================
import Dexie, { type Table } from 'dexie';
import type {
  Transaction,
  Category,
  PaymentMethod,
  Budget,
  RecurringRule,
  Person,
  LedgerEntry,
  SavingsGoal,
} from '../types';

export class ExpenseTrackerDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  paymentMethods!: Table<PaymentMethod, string>;
  budgets!: Table<Budget, string>;
  recurringRules!: Table<RecurringRule, string>;
  persons!: Table<Person, string>;
  ledgerEntries!: Table<LedgerEntry, string>;
  savingsGoals!: Table<SavingsGoal, string>;

  constructor() {
    super('ExpenseTrackerDB');
    this.version(1).stores({
      transactions: 'id, type, categoryId, paymentMethodId, date, [type+date], [categoryId+date], *tags, createdAt',
      categories: 'id, order, type, archived',
      paymentMethods: 'id, order, archived',
      budgets: 'id, period, categoryId, [period+categoryId]',
      recurringRules: 'id, nextDueDate, active',
      persons: 'id, name',
      ledgerEntries: 'id, personId, transactionId, settled',
      savingsGoals: 'id',
    });
  }
}

export const db = new ExpenseTrackerDB();

// ============================================================
// Seed default data on first run
// ============================================================
export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Food & Drinks', icon: 'UtensilsCrossed', color: '#F97316', order: 0, archived: false, type: 'expense' },
  { name: 'Groceries', icon: 'ShoppingBasket', color: '#84CC16', order: 1, archived: false, type: 'expense' },
  { name: 'Transport', icon: 'Car', color: '#3B82F6', order: 2, archived: false, type: 'expense' },
  { name: 'Shopping', icon: 'ShoppingBag', color: '#EC4899', order: 3, archived: false, type: 'expense' },
  { name: 'Bills & Recharge', icon: 'Zap', color: '#EAB308', order: 4, archived: false, type: 'expense' },
  { name: 'Rent', icon: 'Home', color: '#8B5CF6', order: 5, archived: false, type: 'expense' },
  { name: 'Entertainment', icon: 'Gamepad2', color: '#F43F5E', order: 6, archived: false, type: 'expense' },
  { name: 'Subscriptions', icon: 'CreditCard', color: '#6366F1', order: 7, archived: false, type: 'expense' },
  { name: 'Education', icon: 'GraduationCap', color: '#14B8A6', order: 8, archived: false, type: 'expense' },
  { name: 'Health', icon: 'Heart', color: '#EF4444', order: 9, archived: false, type: 'expense' },
  { name: 'Travel', icon: 'Plane', color: '#0EA5E9', order: 10, archived: false, type: 'expense' },
  { name: 'Gifts', icon: 'Gift', color: '#D946EF', order: 11, archived: false, type: 'expense' },
  { name: 'Startup/Business', icon: 'Briefcase', color: '#78716C', order: 12, archived: false, type: 'expense' },
  { name: 'Personal Care', icon: 'Sparkles', color: '#FB923C', order: 13, archived: false, type: 'expense' },
  { name: 'Other', icon: 'MoreHorizontal', color: '#94A3B8', order: 14, archived: false, type: 'expense' },
  // Income categories
  { name: 'Salary/Stipend', icon: 'Banknote', color: '#22C55E', order: 0, archived: false, type: 'income' },
  { name: 'Freelance', icon: 'Laptop', color: '#3B82F6', order: 1, archived: false, type: 'income' },
  { name: 'Pocket Money', icon: 'Wallet', color: '#F97316', order: 2, archived: false, type: 'income' },
  { name: 'Gift Received', icon: 'Gift', color: '#D946EF', order: 3, archived: false, type: 'income' },
  { name: 'Other Income', icon: 'Plus', color: '#94A3B8', order: 4, archived: false, type: 'income' },
];

export const DEFAULT_PAYMENT_METHODS: Omit<PaymentMethod, 'id'>[] = [
  { name: 'UPI', type: 'upi', archived: false, order: 0 },
  { name: 'Cash', type: 'cash', archived: false, order: 1 },
  { name: 'Debit Card', type: 'debit_card', archived: false, order: 2 },
  { name: 'Credit Card', type: 'credit_card', archived: false, order: 3 },
  { name: 'Net Banking', type: 'net_banking', archived: false, order: 4 },
  { name: 'Wallet', type: 'wallet', archived: false, order: 5 },
];

export async function seedDatabase() {
  const catCount = await db.categories.count();
  if (catCount === 0) {
    const { v4: uuid } = await import('uuid');
    const categories = DEFAULT_CATEGORIES.map(c => ({ ...c, id: uuid() }));
    await db.categories.bulkAdd(categories);
  }

  const pmCount = await db.paymentMethods.count();
  if (pmCount === 0) {
    const { v4: uuid } = await import('uuid');
    const methods = DEFAULT_PAYMENT_METHODS.map(m => ({ ...m, id: uuid() }));
    await db.paymentMethods.bulkAdd(methods);
  }
}

