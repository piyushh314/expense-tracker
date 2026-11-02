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

export type SplitMode = 'none' | 'equally' | 'custom' | 'fully_theirs' | 'fully_mine';

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
  paidBy?: 'me' | string; // 'me' or personId
  mySharePaise?: number; // integer paise
  totalPaise?: number; // integer paise
  splitMode?: SplitMode;
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

export type PersonLabel = 'Roommate' | 'Friend' | 'Family' | 'Other';

export interface Person {
  id: string;
  name: string;
  nickname?: string;
  phone?: string;
  upiId?: string;
  label: PersonLabel;
  color: string;
  archived: boolean;
  createdAt: number;
}

export type LedgerDirection = 'they_owe_me' | 'i_owe_them';
export type LedgerKind = 'loan' | 'shared_purchase' | 'paid_for_them' | 'paid_for_me';

export interface LedgerEntry {
  id: string;
  personId: string;
  direction: LedgerDirection;
  kind: LedgerKind;
  amount: number; // integer paise
  date: string; // YYYY-MM-DD
  note: string;
  dueDate?: string; // YYYY-MM-DD
  transactionId?: string;
  splitGroupId?: string;
  createdAt: number;
  updatedAt: number;
}

export type SettlementDirection = 'they_paid_me' | 'i_paid_them';
export type SettlementMethod = 'upi' | 'cash' | 'other';

export interface Settlement {
  id: string;
  personId: string;
  direction: SettlementDirection;
  amount: number; // integer paise
  date: string; // YYYY-MM-DD
  method: SettlementMethod;
  note: string;
  createdAt: number;
}

export interface LedgerReminder {
  id: string;
  personId: string;
  entryId?: string | null; // null = whole person
  nextRemindAt: string; // YYYY-MM-DD
  repeatEveryDays?: number;
  snoozedUntil?: string | null;
  active: boolean;
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
  defaultReminderDays: number; // default 7
  remindersEnabled: boolean; // default true
  remindersForDebtsIOwe: boolean; // default true
  userUpiId?: string;
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

