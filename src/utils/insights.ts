import type { Transaction, Category, InsightCard, PlannedItem, Budget } from '../types';
import type { DateRange } from './date';
import { getDaysInRange, getWeekdayIndex, getDaysRemaining, today } from './date';
import { formatINR } from './money';
import { getEffectiveExpensePaise } from './peopleLedger';

export interface CategoryPlanVsActual {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  plannedPaise: number;
  spentPaise: number;
  variancePaise: number; // spent - planned (positive = overspent)
  variancePct: number;
  status: 'over' | 'under' | 'on_track';
}

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

  const totalSpent = expenses.reduce((s, t) => s + getEffectiveExpensePaise(t), 0);
  const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
  const days = getDaysInRange(range);
  const numDays = Math.max(days.length, 1);
  const averagePerDay = Math.round(totalSpent / numDays);

  const biggestExpense = expenses.length > 0
    ? expenses.reduce((max, t) => getEffectiveExpensePaise(t) > getEffectiveExpensePaise(max) ? t : max, expenses[0])
    : null;

  // By category
  const catTotals = new Map<string, number>();
  expenses.forEach(t => catTotals.set(t.categoryId, (catTotals.get(t.categoryId) || 0) + getEffectiveExpensePaise(t)));
  const byCategory = Array.from(catTotals.entries())
    .map(([categoryId, amount]) => ({ categoryId, amount, percentage: totalSpent > 0 ? Math.round(amount / totalSpent * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
  const topCategory = byCategory[0] || null;

  // By payment method
  const pmTotals = new Map<string, number>();
  expenses.forEach(t => pmTotals.set(t.paymentMethodId, (pmTotals.get(t.paymentMethodId) || 0) + getEffectiveExpensePaise(t)));
  const byPaymentMethod = Array.from(pmTotals.entries())
    .map(([paymentMethodId, amount]) => ({ paymentMethodId, amount, percentage: totalSpent > 0 ? Math.round(amount / totalSpent * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  // By weekday
  const weekdayData: { amount: number; count: number }[] = Array(7).fill(null).map(() => ({ amount: 0, count: 0 }));
  expenses.forEach(t => {
    const day = getWeekdayIndex(t.date);
    weekdayData[day].amount += getEffectiveExpensePaise(t);
    weekdayData[day].count++;
  });
  const byWeekday = weekdayData.map((d, i) => ({ day: i, dayName: WEEKDAY_NAMES[i], ...d }));

  // Daily spend
  const dailyMap = new Map<string, number>();
  days.forEach(d => dailyMap.set(d, 0));
  expenses.forEach(t => { if (dailyMap.has(t.date)) dailyMap.set(t.date, (dailyMap.get(t.date) || 0) + getEffectiveExpensePaise(t)); });
  const dailySpend = Array.from(dailyMap.entries()).map(([date, amount]) => ({ date, amount }));

  // Comparison
  let comparison: PeriodMetrics['comparison'];
  if (previousTransactions) {
    const prevExpenses = previousTransactions.filter(t => t.type === 'expense');
    const prevTotal = prevExpenses.reduce((s, t) => s + getEffectiveExpensePaise(t), 0);
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
  prevMetrics?: PeriodMetrics,
  plannedItems?: PlannedItem[],
  budgets?: Budget[]
): InsightCard[] {
  const cards: InsightCard[] = [];
  const catMap = new Map(categories.map(c => [c.id, c]));
  let id = 0;

  // Upcoming bills in next 30 days insight
  if (plannedItems && plannedItems.length > 0) {
    const todayStr = today();
    const d30 = new Date(todayStr + 'T00:00:00');
    d30.setDate(d30.getDate() + 30);
    const thirtyDaysStr = d30.toISOString().split('T')[0];

    const upcoming30Bills = plannedItems.filter(
      i =>
        i.status === 'upcoming' &&
        (i.kind === 'bill' || i.kind === 'one_off') &&
        i.dueDate >= todayStr &&
        i.dueDate <= thirtyDaysStr
    );
    const totalUpcoming30Paise = upcoming30Bills.reduce((s, i) => s + i.amount, 0);

    if (totalUpcoming30Paise > 0) {
      cards.push({
        id: `insight-${id++}`,
        type: 'upcoming-bills',
        title: 'Upcoming Bills',
        message: `Upcoming bills in the next 30 days: ${formatINR(totalUpcoming30Paise)}.`,
        icon: 'CalendarClock',
        trend: 'neutral',
        dismissed: false,
      });
    }
  }

  // Estimate variance insight
  if (plannedItems && plannedItems.length > 0) {
    const paidEstimates = plannedItems.filter(
      i =>
        i.status === 'paid' &&
        i.amountType === 'estimate' &&
        i.actualAmount !== undefined &&
        i.actualAmount > 0 &&
        i.dueDate >= range.from &&
        i.dueDate <= range.to
    );

    for (const item of paidEstimates) {
      const planned = item.amount;
      const actual = item.actualAmount!;
      const diff = actual - planned;
      const pct = Math.round((Math.abs(diff) / planned) * 100);

      if (pct >= 10) {
        const direction = diff > 0 ? 'above' : 'below';
        cards.push({
          id: `insight-${id++}`,
          type: 'estimate-variance',
          title: 'Estimate Variance',
          message: `${item.title} was ${pct}% ${direction} your estimate.`,
          icon: 'Sparkles',
          trend: diff > 0 ? 'up' : 'down',
          dismissed: false,
        });
      }
    }
  }

  // Plan vs actual category insight
  if ((plannedItems && plannedItems.length > 0) || (budgets && budgets.length > 0)) {
    const breakdown = calculatePlanVsActualBreakdown(
      plannedItems || [],
      budgets || [],
      transactions,
      categories,
      range
    );

    const significant = breakdown.filter(b => b.plannedPaise > 0 && Math.abs(b.variancePaise) >= 10000); // >= ₹100 diff
    if (significant.length > 0) {
      const topDiff = significant.sort((a, b) => Math.abs(b.variancePaise) - Math.abs(a.variancePaise))[0];
      cards.push({
        id: `insight-${id++}`,
        type: 'plan-vs-actual',
        title: `Plan vs Actual: ${topDiff.categoryName}`,
        message: `You planned ${formatINR(topDiff.plannedPaise)} for ${topDiff.categoryName.toLowerCase()} and spent ${formatINR(topDiff.spentPaise)}.`,
        icon: topDiff.categoryIcon || 'Target',
        trend: topDiff.variancePaise > 0 ? 'up' : 'down',
        dismissed: false,
      });
    }
  }

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

export function calculatePlanVsActualBreakdown(
  plannedItems: PlannedItem[],
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  range: DateRange
): CategoryPlanVsActual[] {
  const catMap = new Map(categories.map(c => [c.id, c]));
  const period = range.from.slice(0, 7); // YYYY-MM

  // 1. Calculate actual spending per category in range
  const spentByCat = new Map<string, number>();
  transactions
    .filter(t => t.type === 'expense' && t.date >= range.from && t.date <= range.to)
    .forEach(t => {
      spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) || 0) + getEffectiveExpensePaise(t));
    });

  // 2. Calculate planned per category (budget or planned items in range)
  const budgetByCat = new Map<string, number>();
  budgets
    .filter(b => b.period === period && b.categoryId)
    .forEach(b => {
      budgetByCat.set(b.categoryId!, b.amount);
    });

  const plannedItemsByCat = new Map<string, number>();
  plannedItems
    .filter(
      i =>
        (i.kind === 'bill' || i.kind === 'one_off') &&
        i.status !== 'skipped' &&
        i.dueDate >= range.from &&
        i.dueDate <= range.to
    )
    .forEach(i => {
      plannedItemsByCat.set(i.categoryId, (plannedItemsByCat.get(i.categoryId) || 0) + i.amount);
    });

  // Collect all category IDs with spending or planning
  const relevantCatIds = new Set<string>();
  spentByCat.forEach((_, id) => relevantCatIds.add(id));
  budgetByCat.forEach((_, id) => relevantCatIds.add(id));
  plannedItemsByCat.forEach((_, id) => relevantCatIds.add(id));

  const results: CategoryPlanVsActual[] = [];

  relevantCatIds.forEach(catId => {
    const cat = catMap.get(catId);
    if (!cat || cat.type === 'income') return;

    const budgetAmt = budgetByCat.get(catId) || 0;
    const itemsAmt = plannedItemsByCat.get(catId) || 0;
    const plannedPaise = budgetAmt > 0 ? budgetAmt : itemsAmt;
    const spentPaise = spentByCat.get(catId) || 0;

    if (plannedPaise === 0 && spentPaise === 0) return;

    const variancePaise = spentPaise - plannedPaise;
    const variancePct = plannedPaise > 0 ? Math.round((variancePaise / plannedPaise) * 100) : 0;
    const status: CategoryPlanVsActual['status'] =
      variancePaise > 0 ? 'over' : variancePaise < 0 ? 'under' : 'on_track';

    results.push({
      categoryId: catId,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      categoryColor: cat.color,
      plannedPaise,
      spentPaise,
      variancePaise,
      variancePct,
      status,
    });
  });

  return results.sort((a, b) => b.spentPaise - a.spentPaise);
}
