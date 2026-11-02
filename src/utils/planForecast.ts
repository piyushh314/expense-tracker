// ============================================================
// Plan Forecast & Recurring Calculations (Pure, Offline Tested Utilities)
// ============================================================

import type {
  PlannedItem,
  PlannedRepeat,
  PlannedDisplayStatus,
} from '../types';

export interface MonthForecast {
  monthlyBudgetPaise: number | null;
  spentSoFarPaise: number;
  unpaidPlannedExpensesThisMonthPaise: number;
  expectedIncomeThisMonthPaise: number;
  expectedRepaymentsThisMonthPaise: number;
  daysLeftInMonth: number;
  daysElapsedSoFar: number;
  safeToSpendPerDayPaise: number; // in integer paise
  safeToSpendPerDayRupees: number; // in decimal rupees
  projectedMonthEndSpendPaise: number;
  projectionRangePaise: {
    low: number;
    expected: number;
    high: number;
  };
  startingBalancePaise: number | null;
  monthlyIncomePaise: number | null;
  totalFundsAvailablePaise: number | null;
  projectedLeftoverPaise: number | null;
  isDeficit: boolean;
}

export interface AffordabilityResult {
  candidateAmountPaise: number;
  currentSafeToSpendPerDayPaise: number;
  newSafeToSpendPerDayPaise: number;
  safeToSpendDiffPaise: number;
  currentProjectedMonthEndPaise: number;
  newProjectedMonthEndPaise: number;
  projectedLeftoverPaise: number | null;
  newProjectedLeftoverPaise: number | null;
  affordable: boolean;
}

/**
 * Clamps target day to the last valid day of the specified month.
 * Handles February (including leap years), April, June, Sept, Nov (30 days), etc.
 */
export function clampDateToMonthEnd(year: number, month: number, targetDay: number): string {
  // In JS Date, day 0 of month (1-indexed) returns the last day of the previous month.
  // E.g., new Date(2026, 4, 0).getDate() gives last day of April (month 4).
  const maxDays = new Date(year, month, 0).getDate();
  const day = Math.min(Math.max(1, targetDay), maxDays);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Calculates the next occurrence date based on repeat type and custom day of month.
 * Automatically clamps short month ends (e.g. 31st in a 30-day month lands on the 30th).
 */
export function calculateNextOccurrenceDate(
  currentDueDate: string,
  repeat: PlannedRepeat,
  customDayOfMonth?: number
): string {
  if (repeat === 'none') {
    return currentDueDate;
  }

  const [yStr, mStr, dStr] = currentDueDate.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);

  if (repeat === 'weekly') {
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + 7);
    const ny = d.getFullYear();
    const nm = String(d.getMonth() + 1).padStart(2, '0');
    const nd = String(d.getDate()).padStart(2, '0');
    return `${ny}-${nm}-${nd}`;
  }

  if (repeat === 'monthly' || repeat === 'custom_day') {
    const targetDay = customDayOfMonth || day;
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    return clampDateToMonthEnd(nextYear, nextMonth, targetDay);
  }

  if (repeat === 'yearly') {
    const nextYear = year + 1;
    return clampDateToMonthEnd(nextYear, month, day);
  }

  return currentDueDate;
}

/**
 * Generates future occurrences for a recurring item up to `untilDate` (~3 months ahead).
 * Idempotent and safely repeatable: skips any dates in `existingDates`.
 */
export function generateOccurrences(
  baseItem: PlannedItem,
  untilDate: string,
  existingDates: Set<string>,
  idGenerator: () => string = () => `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
): PlannedItem[] {
  if (baseItem.repeat === 'none') {
    return [];
  }

  const occurrences: PlannedItem[] = [];
  let currentDate = baseItem.dueDate;
  const seriesId = baseItem.seriesId || baseItem.id;

  // Max 52 iterations to guard against runaway loops
  for (let i = 0; i < 52; i++) {
    const nextDate = calculateNextOccurrenceDate(currentDate, baseItem.repeat, baseItem.customDayOfMonth);
    if (nextDate === currentDate || nextDate > untilDate) {
      break;
    }

    if (!existingDates.has(nextDate)) {
      occurrences.push({
        ...baseItem,
        id: idGenerator(),
        seriesId,
        dueDate: nextDate,
        status: 'upcoming',
        linkedTransactionId: undefined,
        actualAmount: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      existingDates.add(nextDate);
    }

    currentDate = nextDate;
  }

  return occurrences;
}

/**
 * Returns the active display status for an item based on today's date and its reminder window.
 * Statuses: 'paid' | 'skipped' | 'overdue' | 'due_soon' | 'upcoming'
 */
export function getItemDisplayStatus(
  item: Pick<PlannedItem, 'status' | 'dueDate' | 'reminderDaysBefore'>,
  todayStr: string
): PlannedDisplayStatus {
  if (item.status === 'paid') return 'paid';
  if (item.status === 'skipped') return 'skipped';

  if (item.dueDate < todayStr) {
    return 'overdue';
  }

  // Calculate day difference
  const todayDate = new Date(todayStr + 'T00:00:00');
  const dueDate = new Date(item.dueDate + 'T00:00:00');
  const diffMs = dueDate.getTime() - todayDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const windowDays = item.reminderDaysBefore ?? 3;
  if (diffDays <= windowDays) {
    return 'due_soon';
  }

  return 'upcoming';
}

/**
 * Calculates safe to spend per day based on monthly budget, spent so far, and unpaid planned expenses.
 * Formula:
 * safe_to_spend_per_day = (monthly budget - spent so far - unpaid planned expenses due this month) / days left in month
 */
export function calculateSafeToSpendPerDay(params: {
  monthlyBudgetPaise: number | null;
  spentSoFarPaise: number;
  unpaidPlannedExpensesThisMonthPaise: number;
  daysLeftInMonth: number;
}): { safeToSpendPerDayPaise: number; safeToSpendPerDayRupees: number } {
  const {
    monthlyBudgetPaise,
    spentSoFarPaise,
    unpaidPlannedExpensesThisMonthPaise,
    daysLeftInMonth,
  } = params;

  if (monthlyBudgetPaise === null || monthlyBudgetPaise <= 0) {
    return { safeToSpendPerDayPaise: 0, safeToSpendPerDayRupees: 0 };
  }

  const daysLeft = Math.max(1, daysLeftInMonth);
  const remainingBudgetPaise = monthlyBudgetPaise - spentSoFarPaise - unpaidPlannedExpensesThisMonthPaise;

  if (remainingBudgetPaise <= 0) {
    return { safeToSpendPerDayPaise: 0, safeToSpendPerDayRupees: 0 };
  }

  // Exact paise per day
  const paisePerDay = remainingBudgetPaise / daysLeft;
  // Convert paise to rupees rounded to 2 decimals
  const rupeesPerDay = Math.round((paisePerDay / 100) * 100) / 100;

  return {
    safeToSpendPerDayPaise: Math.round(paisePerDay),
    safeToSpendPerDayRupees: rupeesPerDay,
  };
}

/**
 * Calculates the full monthly forecast including safe to spend, month-end projection range,
 * expected income, repayments, and leftover balance.
 */
export function calculateMonthForecast(params: {
  monthlyBudgetPaise: number | null;
  spentSoFarPaise: number;
  plannedItems: PlannedItem[];
  currentMonthRange: { from: string; to: string };
  daysElapsedSoFar: number;
  daysLeftInMonth: number;
  startingBalancePaise?: number | null;
  monthlyIncomePaise?: number | null;
}): MonthForecast {
  const {
    monthlyBudgetPaise,
    spentSoFarPaise,
    plannedItems,
    currentMonthRange,
    daysElapsedSoFar,
    daysLeftInMonth,
    startingBalancePaise = null,
    monthlyIncomePaise = null,
  } = params;

  let unpaidPlannedExpensesThisMonthPaise = 0;
  let expectedIncomeThisMonthPaise = 0;
  let expectedRepaymentsThisMonthPaise = 0;

  // Process planned items for this month
  for (const item of plannedItems) {
    // Only items due this month or overdue unpaid items belonging to the cycle
    const isDueInMonth = item.dueDate >= currentMonthRange.from && item.dueDate <= currentMonthRange.to;
    const isOverdueUnpaid = item.status === 'upcoming' && item.dueDate < currentMonthRange.from;

    if (!isDueInMonth && !isOverdueUnpaid) {
      continue;
    }

    if (item.status === 'upcoming') {
      if (item.kind === 'bill' || item.kind === 'one_off') {
        unpaidPlannedExpensesThisMonthPaise += item.amount;
      } else if (item.kind === 'income_expected') {
        expectedIncomeThisMonthPaise += item.amount;
      } else if (item.kind === 'repayment_expected') {
        expectedRepaymentsThisMonthPaise += item.amount;
      }
    }
  }

  // Calculate safe to spend per day
  const { safeToSpendPerDayPaise, safeToSpendPerDayRupees } = calculateSafeToSpendPerDay({
    monthlyBudgetPaise,
    spentSoFarPaise,
    unpaidPlannedExpensesThisMonthPaise,
    daysLeftInMonth,
  });

  // Month-end projection
  // Variable spend = spend so far; daily average pace = spend so far / elapsed days
  const elapsed = Math.max(1, daysElapsedSoFar);
  const dailyVariableAvgPaise = Math.round(spentSoFarPaise / elapsed);
  const remainingDays = Math.max(0, daysLeftInMonth);

  const projectedVariablePaise = dailyVariableAvgPaise * remainingDays;
  const expectedMonthEndSpendPaise = spentSoFarPaise + unpaidPlannedExpensesThisMonthPaise + projectedVariablePaise;

  const lowProjectionPaise = Math.round(
    spentSoFarPaise + unpaidPlannedExpensesThisMonthPaise + (dailyVariableAvgPaise * 0.85 * remainingDays)
  );
  const highProjectionPaise = Math.round(
    spentSoFarPaise + unpaidPlannedExpensesThisMonthPaise + (dailyVariableAvgPaise * 1.15 * remainingDays)
  );

  // Leftover & Deficit calculations (if starting balance or monthly income is set)
  const hasFundsConfigured = (startingBalancePaise !== null && startingBalancePaise !== undefined) ||
    (monthlyIncomePaise !== null && monthlyIncomePaise !== undefined);

  let totalFundsAvailablePaise: number | null = null;
  let projectedLeftoverPaise: number | null = null;
  let isDeficit = false;

  if (hasFundsConfigured) {
    totalFundsAvailablePaise = (startingBalancePaise || 0) + (monthlyIncomePaise || 0);
    projectedLeftoverPaise = totalFundsAvailablePaise - expectedMonthEndSpendPaise;
    isDeficit = projectedLeftoverPaise < 0;
  }

  return {
    monthlyBudgetPaise,
    spentSoFarPaise,
    unpaidPlannedExpensesThisMonthPaise,
    expectedIncomeThisMonthPaise,
    expectedRepaymentsThisMonthPaise,
    daysLeftInMonth,
    daysElapsedSoFar,
    safeToSpendPerDayPaise,
    safeToSpendPerDayRupees,
    projectedMonthEndSpendPaise: expectedMonthEndSpendPaise,
    projectionRangePaise: {
      low: lowProjectionPaise,
      expected: expectedMonthEndSpendPaise,
      high: highProjectionPaise,
    },
    startingBalancePaise: startingBalancePaise ?? null,
    monthlyIncomePaise: monthlyIncomePaise ?? null,
    totalFundsAvailablePaise,
    projectedLeftoverPaise,
    isDeficit,
  };
}

/**
 * "Can I Afford This" simulation:
 * Calculates what safe to spend and projected month-end would become if candidate amount is added.
 * Saves nothing.
 */
export function calculateAffordability(
  currentForecast: MonthForecast,
  candidateAmountPaise: number
): AffordabilityResult {
  const newUnpaid = currentForecast.unpaidPlannedExpensesThisMonthPaise + candidateAmountPaise;

  const { safeToSpendPerDayPaise: newSafePaise } = calculateSafeToSpendPerDay({
    monthlyBudgetPaise: currentForecast.monthlyBudgetPaise,
    spentSoFarPaise: currentForecast.spentSoFarPaise,
    unpaidPlannedExpensesThisMonthPaise: newUnpaid,
    daysLeftInMonth: currentForecast.daysLeftInMonth,
  });

  const newProjectedMonthEnd = currentForecast.projectedMonthEndSpendPaise + candidateAmountPaise;

  let newProjectedLeftover: number | null = null;
  if (currentForecast.totalFundsAvailablePaise !== null) {
    newProjectedLeftover = currentForecast.totalFundsAvailablePaise - newProjectedMonthEnd;
  }

  const affordable = newSafePaise > 0 && (newProjectedLeftover === null || newProjectedLeftover >= 0);

  return {
    candidateAmountPaise,
    currentSafeToSpendPerDayPaise: currentForecast.safeToSpendPerDayPaise,
    newSafeToSpendPerDayPaise: newSafePaise,
    safeToSpendDiffPaise: newSafePaise - currentForecast.safeToSpendPerDayPaise,
    currentProjectedMonthEndPaise: currentForecast.projectedMonthEndSpendPaise,
    newProjectedMonthEndPaise: newProjectedMonthEnd,
    projectedLeftoverPaise: currentForecast.projectedLeftoverPaise,
    newProjectedLeftoverPaise: newProjectedLeftover,
    affordable,
  };
}

/**
 * For recurring estimate items: suggests the average of the last 3 actuals.
 */
export function suggestEstimateAmount(seriesId: string, pastItems: PlannedItem[]): number | null {
  const paidSeriesItems = pastItems
    .filter(item => (item.seriesId === seriesId || item.id === seriesId) && item.status === 'paid')
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, 3);

  if (paidSeriesItems.length === 0) {
    return null;
  }

  const sum = paidSeriesItems.reduce((acc, item) => acc + (item.actualAmount ?? item.amount), 0);
  return Math.round(sum / paidSeriesItems.length);
}
