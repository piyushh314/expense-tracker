// ============================================================
// Dexie.js Database — IndexedDB wrapper for offline-first storage
// Schema version 1: Initial schema
// Schema version 2: Lend & Owe (People Ledger) with settlements & reminders
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
  Settlement,
  LedgerReminder,
  SavingsGoal,
  PlannedItem,
} from '../types';
import { getPersonAvatarColor } from '../utils/peopleLedger';

export class ExpenseTrackerDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  paymentMethods!: Table<PaymentMethod, string>;
  budgets!: Table<Budget, string>;
  recurringRules!: Table<RecurringRule, string>;
  persons!: Table<Person, string>;
  ledgerEntries!: Table<LedgerEntry, string>;
  settlements!: Table<Settlement, string>;
  ledgerReminders!: Table<LedgerReminder, string>;
  savingsGoals!: Table<SavingsGoal, string>;
  plannedItems!: Table<PlannedItem, string>;

  constructor() {
    super('ExpenseTrackerDB');

    // Version 1 (Preserved for backwards compatibility)
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

    // Version 2: Lend and Owe (People Ledger)
    this.version(2).stores({
      transactions: 'id, type, categoryId, paymentMethodId, date, paidBy, [type+date], [categoryId+date], *tags, createdAt',
      categories: 'id, order, type, archived',
      paymentMethods: 'id, order, archived',
      budgets: 'id, period, categoryId, [period+categoryId]',
      recurringRules: 'id, nextDueDate, active',
      persons: 'id, name, label, archived, createdAt',
      ledgerEntries: 'id, personId, date, direction, kind, transactionId, splitGroupId, dueDate, createdAt',
      settlements: 'id, personId, date, direction, createdAt',
      ledgerReminders: 'id, personId, entryId, nextRemindAt, active',
      savingsGoals: 'id',
    }).upgrade(async tx => {
      // 1. Upgrade persons table to new schema
      await tx.table('persons').toCollection().modify((person: any) => {
        if (!person.label) person.label = 'Friend';
        if (!person.color) person.color = getPersonAvatarColor(person.name || 'Friend');
        if (person.archived === undefined) person.archived = false;
        if (!person.createdAt) person.createdAt = Date.now();
      });

      // 2. Migrate legacy ledger entries and extract settlements if previously marked settled
      const legacyEntries = await tx.table('ledgerEntries').toArray();
      const migratedSettlements: any[] = [];

      for (const entry of legacyEntries) {
        let direction = entry.direction;
        if (direction === 'owed_to_me') direction = 'they_owe_me';
        if (direction === 'i_owe') direction = 'i_owe_them';

        const kind = entry.kind || (entry.transactionId ? 'shared_purchase' : 'loan');
        const createdAt = entry.createdAt || Date.now();
        const updatedAt = entry.updatedAt || createdAt;

        // If previously marked as settled, create an explicit settlement record
        if (entry.settled) {
          const settlementId = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `settlement-migrated-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

          migratedSettlements.push({
            id: settlementId,
            personId: entry.personId,
            direction: direction === 'they_owe_me' ? 'they_paid_me' : 'i_paid_them',
            amount: entry.amount,
            date: entry.date || new Date().toISOString().split('T')[0],
            method: 'other',
            note: 'Settled (migrated)',
            createdAt: createdAt + 1,
          });
        }

        await tx.table('ledgerEntries').update(entry.id, {
          direction,
          kind,
          note: entry.note || '',
          updatedAt,
          createdAt,
        });
      }

      if (migratedSettlements.length > 0) {
        await tx.table('settlements').bulkAdd(migratedSettlements);
      }

      // 3. Migrate transactions with new fields
      await tx.table('transactions').toCollection().modify((t: any) => {
        if (!t.paidBy) t.paidBy = 'me';
        if (t.totalPaise === undefined) t.totalPaise = t.amount;
        if (t.mySharePaise === undefined) {
          t.mySharePaise = t.splitInfo ? t.splitInfo.myShare : t.amount;
        }
        if (!t.splitMode) {
          t.splitMode = t.splitInfo ? 'equally' : 'none';
        }
      });
    });

    // Version 3: Plan (Upcoming expenses, bills, and forecast)
    this.version(3).stores({
      transactions: 'id, type, categoryId, paymentMethodId, date, paidBy, [type+date], [categoryId+date], *tags, createdAt',
      categories: 'id, order, type, archived',
      paymentMethods: 'id, order, archived',
      budgets: 'id, period, categoryId, [period+categoryId]',
      recurringRules: 'id, nextDueDate, active',
      persons: 'id, name, label, archived, createdAt',
      ledgerEntries: 'id, personId, date, direction, kind, transactionId, splitGroupId, dueDate, createdAt',
      settlements: 'id, personId, date, direction, createdAt',
      ledgerReminders: 'id, personId, entryId, nextRemindAt, active',
      savingsGoals: 'id',
      plannedItems: 'id, kind, dueDate, categoryId, status, seriesId, linkedLedgerEntryId, linkedTransactionId, [status+dueDate]',
    }).upgrade(async tx => {
      // Migrate existing recurringRules into plannedItems safely
      try {
        const rules = await tx.table('recurringRules').toArray();
        if (rules && rules.length > 0) {
          const newPlannedItems = rules.map((rule: any) => {
            const tmpl = rule.templateTransaction || {};
            const isIncome = tmpl.type === 'income';
            return {
              id: rule.id || `plan-migrated-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              title: tmpl.note || (isIncome ? 'Expected Income' : 'Recurring Bill'),
              amount: tmpl.amount || 0,
              amountType: 'exact',
              dueDate: rule.nextDueDate || new Date().toISOString().split('T')[0],
              categoryId: tmpl.categoryId || '',
              paymentMethodId: tmpl.paymentMethodId,
              repeat: rule.frequency === 'weekly' ? 'weekly' : rule.frequency === 'yearly' ? 'yearly' : rule.customDayOfMonth ? 'custom_day' : 'monthly',
              customDayOfMonth: rule.customDayOfMonth,
              reminderDaysBefore: 3,
              note: tmpl.note || '',
              status: rule.active ? 'upcoming' : 'skipped',
              seriesId: rule.id,
              createdAt: rule.createdAt || Date.now(),
              updatedAt: Date.now(),
            };
          });
          await tx.table('plannedItems').bulkAdd(newPlannedItems);
        }
      } catch (err) {
        console.warn('Error migrating recurring rules to planned items:', err);
      }
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
