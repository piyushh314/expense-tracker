import type { Transaction, Category, InsightCard } from '../types';
import type { DateRange } from './date';
import { getDaysInRange, getWeekdayIndex, getDaysRemaining } from './date';
import { formatINR } from './money';

export interface PeriodMetrics {
  totalSpent: number;
  totalIncome: number;
  transactionCount: number;
  averagePerDay: number;
  biggestExpense: Transaction | null;
  topCategory: { categoryId: string; amount: number; percentage: number } | null;
  byCategory: Array<{ categoryId: string; amount: number; percentage: number }>;
  byPaymentMethod: Array<{ paymentMethodId: string; amount: number; percentage: number }>;
  byWeekday: Array<{ day: number; dayName: string; amount: number; count: number }>;
  dailySpend: Array<{ date: string; amount: number }>;
  comparison?: {
    prevTotal: number;
    changeAmount: number;
    changePercentage: number;
    direction: 'up' | 'down' | 'same';
  };
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function calculateMetrics(
  transactions: Transaction[],
  range: DateRange,
  previousTransactions?: Transaction[]
): PeriodMetrics {
  const expenses = transactions.filter(t => t.type === 'expense');
  const incomes = transactions.filter(t => t.type === 'income');

  const totalSpent = expenses.reduce((s, t) => s + t.amount, 0);
  const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
  const days = getDaysInRange(range);
  const numDays = Math.max(days.length, 1);
  const averagePerDay = Math.round(totalSpent / numDays);

  const biggestExpense = expenses.length > 0
    ? expenses.reduce((max, t) => t.amount > max.amount ? t : max, expenses[0])
    : null;

  // By category
  const catTotals = new Map<string, number>();
  expenses.forEach(t => catTotals.set(t.categoryId, (catTotals.get(t.categoryId) || 0) + t.amount));
  const byCategory = Array.from(catTotals.entries())
    .map(([categoryId, amount]) => ({ categoryId, amount, percentage: totalSpent > 0 ? Math.round(amount / totalSpent * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
  const topCategory = byCategory[0] || null;

  // By payment method
  const pmTotals = new Map<string, number>();
  expenses.forEach(t => pmTotals.set(t.paymentMethodId, (pmTotals.get(t.paymentMethodId) || 0) + t.amount));
  const byPaymentMethod = Array.from(pmTotals.entries())
    .map(([paymentMethodId, amount]) => ({ paymentMethodId, amount, percentage: totalSpent > 0 ? Math.round(amount / totalSpent * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  // By weekday
  const weekdayData: { amount: number; count: number }[] = Array(7).fill(null).map(() => ({ amount: 0, count: 0 }));
  expenses.forEach(t => {
    const day = getWeekdayIndex(t.date);
    weekdayData[day].amount += t.amount;
    weekdayData[day].count++;
  });
  const byWeekday = weekdayData.map((d, i) => ({ day: i, dayName: WEEKDAY_NAMES[i], ...d }));

  // Daily spend
  const dailyMap = new Map<string, number>();
  days.forEach(d => dailyMap.set(d, 0));
  expenses.forEach(t => { if (dailyMap.has(t.date)) dailyMap.set(t.date, (dailyMap.get(t.date) || 0) + t.amount); });
  const dailySpend = Array.from(dailyMap.entries()).map(([date, amount]) => ({ date, amount }));

  // Comparison
  let comparison: PeriodMetrics['comparison'];
  if (previousTransactions) {
    const prevExpenses = previousTransactions.filter(t => t.type === 'expense');
    const prevTotal = prevExpenses.reduce((s, t) => s + t.amount, 0);
    const changeAmount = totalSpent - prevTotal;
    const changePercentage = prevTotal > 0 ? Math.round(Math.abs(changeAmount) / prevTotal * 100) : 0;
    comparison = {
      prevTotal,
      changeAmount,
      changePercentage,
      direction: changeAmount > 0 ? 'up' : changeAmount < 0 ? 'down' : 'same',
    };
  }

  return {
    totalSpent, totalIncome, transactionCount: expenses.length,
    averagePerDay, biggestExpense, topCategory, byCategory, byPaymentMethod,
    byWeekday, dailySpend, comparison,
  };
}

export function generateInsightCards(
  metrics: PeriodMetrics,
  categories: Category[],
  range: DateRange,
  transactions: Transaction[],
  prevMetrics?: PeriodMetrics
): InsightCard[] {
  const cards: InsightCard[] = [];
  const catMap = new Map(categories.map(c => [c.id, c]));
  let id = 0;

  // Top category insight
  if (metrics.topCategory) {
    const cat = catMap.get(metrics.topCategory.categoryId);
    let msg = `${cat?.name || 'Unknown'} is ${metrics.topCategory.percentage}% of your spending (${formatINR(metrics.topCategory.amount)}).`;
    if (prevMetrics) {
      const prevCat = prevMetrics.byCategory.find(c => c.categoryId === metrics.topCategory!.categoryId);
      if (prevCat && prevCat.percentage > 0) {
        const diff = metrics.topCategory.percentage - prevCat.percentage;
        if (Math.abs(diff) >= 3) {
          msg += ` ${diff > 0 ? 'Up' : 'Down'} ${Math.abs(diff)}pp from last period.`;
        }
      }
    }
    cards.push({ id: `insight-${id++}`, type: 'top-category', title: 'Top Category', message: msg, icon: cat?.icon, trend: 'neutral', dismissed: false });
  }

  // Weekend vs weekday
  const weekdaySpend = metrics.byWeekday.filter(d => d.day >= 1 && d.day <= 5).reduce((s, d) => s + d.amount, 0);
  const weekendSpend = metrics.byWeekday.filter(d => d.day === 0 || d.day === 6).reduce((s, d) => s + d.amount, 0);
  const weekdayAvg = weekdaySpend / 5;
  const weekendAvg = weekendSpend / 2;
  if (weekdayAvg > 0 && weekendAvg > weekdayAvg * 1.3) {
    const ratio = (weekendAvg / weekdayAvg).toFixed(1);
    cards.push({ id: `insight-${id++}`, type: 'weekend-pattern', title: 'Weekend Spender', message: `You spend ${ratio}x more on weekends than weekdays.`, icon: 'Calendar', trend: 'up', dismissed: false });
  }

  // Small purchases (latte factor)
  const expenses = transactions.filter(t => t.type === 'expense');
  const smallPurchases = expenses.filter(t => t.amount < 20000); // under ₹200
  if (smallPurchases.length >= 5) {
    const total = smallPurchases.reduce((s, t) => s + t.amount, 0);
    cards.push({ id: `insight-${id++}`, type: 'latte-factor', title: 'Small Adds Up', message: `${smallPurchases.length} purchases under ₹200 added up to ${formatINR(total)}.`, icon: 'Coffee', trend: 'neutral', dismissed: false });
  }

  // Projection
  const daysRemaining = getDaysRemaining(range);
  if (daysRemaining > 3 && metrics.averagePerDay > 0) {
    const projected = metrics.totalSpent + metrics.averagePerDay * daysRemaining;
    cards.push({ id: `insight-${id++}`, type: 'projection', title: 'Pace Check', message: `At this pace, you'll spend ${formatINR(projected)} this period.`, icon: 'TrendingUp', trend: 'neutral', dismissed: false });
  }

  // No-spend days
  const noSpendDays = metrics.dailySpend.filter(d => d.amount === 0).length;
  const pastDays = metrics.dailySpend.filter(d => d.date <= new Date().toISOString().split('T')[0]).length;
  if (pastDays > 7 && noSpendDays > 0) {
    cards.push({ id: `insight-${id++}`, type: 'no-spend', title: 'No-Spend Days', message: `You had ${noSpendDays} no-spend day${noSpendDays > 1 ? 's' : ''} this period. 💪`, icon: 'Award', trend: 'down', dismissed: false });
  }

  // Biggest jump vs last period
  if (prevMetrics && prevMetrics.byCategory.length > 0) {
    let maxJump = 0;
    let jumpCatId = '';
    metrics.byCategory.forEach(cur => {
      const prev = prevMetrics.byCategory.find(p => p.categoryId === cur.categoryId);
      const prevAmt = prev?.amount || 0;
      const jump = cur.amount - prevAmt;
      if (jump > maxJump) {
        maxJump = jump;
        jumpCatId = cur.categoryId;
      }
    });
    if (maxJump > 50000) { // > ₹500 jump
      const cat = catMap.get(jumpCatId);
      cards.push({ id: `insight-${id++}`, type: 'biggest-jump', title: 'Biggest Jump', message: `Biggest increase vs last period: ${cat?.name || 'Unknown'} (+${formatINR(maxJump)}).`, icon: 'ArrowUpRight', trend: 'up', dismissed: false });
    }
  }

  // Note keyword frequency
  const keywords = getKeywordFrequency(expenses);
  if (keywords.length > 0 && keywords[0].count >= 3) {
    const top = keywords[0];
    cards.push({ id: `insight-${id++}`, type: 'keyword', title: 'Frequent Purchase', message: `Most frequent note keyword: "${top.keyword}" (${top.count} times, ${formatINR(top.totalAmount)}).`, icon: 'MessageSquare', trend: 'neutral', dismissed: false });
  }

  return cards;
}

export function getKeywordFrequency(transactions: Transaction[]): Array<{ keyword: string; count: number; totalAmount: number }> {
  const stopWords = new Set(['the', 'a', 'an', 'to', 'for', 'and', 'or', 'of', 'in', 'on', 'at', 'with', 'from', 'by', 'is', 'was', 'it', 'my', 'me', 'i']);
  const freq = new Map<string, { count: number; totalAmount: number }>();

  transactions.forEach(t => {
    if (!t.note) return;
    const words = t.note.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));
    const seen = new Set<string>();
    words.forEach(word => {
      if (seen.has(word)) return;
      seen.add(word);
      const entry = freq.get(word) || { count: 0, totalAmount: 0 };
      entry.count++;
      entry.totalAmount += t.amount;
      freq.set(word, entry);
    });
  });

  return Array.from(freq.entries())
    .map(([keyword, data]) => ({ keyword, ...data }))
    .filter(k => k.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}
