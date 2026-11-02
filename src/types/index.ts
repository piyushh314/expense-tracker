// ============================================================
// Expense Tracker — Core Type Definitions
// Money is always stored as integer paise (1 INR = 100 paise)
// Dates are local calendar dates as YYYY-MM-DD strings
// ============================================================

export type TransactionType = 'expense' | 'income' | 'transfer';
export type Scope = 'personal' | 'business';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface DateRange {
  from: string;
  to: string;
}

export interface SplitParticipant {
  personId: string;
  amount: number; // paise
  settled: boolean;
}

export interface SplitInfo {
  participants: SplitParticipant[];
  myShare: number; // paise
  iPaid: boolean; // true = I paid full, false = someone paid for me
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number; // integer paise
  categoryId: string;
  paymentMethodId: string;
  date: string; // YYYY-MM-DD local date
  note: string;
  tags: string[];
  scope: Scope;
  splitInfo?: SplitInfo;
  recurringRuleId?: string;
  receiptUrl?: string;
  createdAt: number; // timestamp ms
  updatedAt: number; // timestamp ms
}

export interface Category {
  id: string;
  name: string;
  icon: string; // lucide icon name
  color: string; // hex color
  order: number;
  archived: boolean;
  budgetAmount?: number; // paise, monthly budget for this category
  type: TransactionType; // which transaction type this category is for
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: 'upi' | 'cash' | 'debit_card' | 'credit_card' | 'net_banking' | 'wallet' | 'custom';
  archived: boolean;
  order: number;
}

export interface Budget {
  id: string;
  period: string; // YYYY-MM
  categoryId: string | null; // null = overall budget
  amount: number; // paise
}

export interface RecurringRule {
  id: string;
  templateTransaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'date'>;
  frequency: Frequency;
  customDayOfMonth?: number;
  nextDueDate: string; // YYYY-MM-DD
  active: boolean;
  createdAt: number;
}

export interface Person {
  id: string;
  name: string;
}

export interface LedgerEntry {
  id: string;
  personId: string;
  transactionId: string;
  amount: number; // paise
  direction: 'owed_to_me' | 'i_owe';
  settled: boolean;
  date: string; // YYYY-MM-DD
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number; // paise
  targetDate: string; // YYYY-MM-DD
  savedAmount: number; // paise
  createdAt: number;
}

export interface AppSettings {
  currency: string;
  locale: string;
  theme: ThemeMode;
  reminderTime: string | null; // HH:mm or null
  firstDayOfWeek: number; // 0=Sun, 1=Mon
  monthStartDay: number; // 1-28
  lastUsedCategoryId: string | null;
  lastUsedPaymentMethodId: string | null;
  monthlyBudget: number | null; // paise
}

// For insight cards
export interface InsightCard {
  id: string;
  type: string;
  title: string;
  message: string;
  icon?: string;
  trend?: 'up' | 'down' | 'neutral';
  value?: number;
  dismissed: boolean;
  linkFilter?: Partial<TransactionFilter>;
}

export interface TransactionFilter {
  dateFrom: string;
  dateTo: string;
  categoryIds: string[];
  paymentMethodIds: string[];
  tags: string[];
  scope: Scope | 'all';
  amountMin: number | null;
  amountMax: number | null;
  search: string;
  type: TransactionType | 'all';
}

// Presentation mode slide
export interface PresentationSlide {
  id: string;
  type: 'title' | 'breakdown' | 'trend' | 'top-expenses' | 'patterns' | 'budget' | 'takeaways' | 'plan';
  title: string;
  visible: boolean;
  order: number;
  editableContent?: string; // for the plan slide
}

