import { describe, it, expect } from 'vitest';
import {
  clampDateToMonthEnd,
  calculateNextOccurrenceDate,
  generateOccurrences,
  getItemDisplayStatus,
  calculateSafeToSpendPerDay,
  calculateMonthForecast,
  calculateAffordability,
  suggestEstimateAmount,
} from '../planForecast';
import { generateInsightCards, calculatePlanVsActualBreakdown } from '../insights';
import type { PlannedItem, Category, Transaction } from '../../types';

describe('Plan Forecast & Recurring Calculation Utilities', () => {
  describe('Acceptance Tests from Specification', () => {
    it('Acceptance Test 1: Budget 13,000, spent 6,204, 28 days left -> safe to spend is 242.71/day. Add electricity 1,800 due on 20th -> safe to spend becomes 178.43/day', () => {
      // Step A: Baseline
      const baseline = calculateSafeToSpendPerDay({
        monthlyBudgetPaise: 13000 * 100, // 13,000 in paise
        spentSoFarPaise: 6204 * 100, // 6,204 in paise
        unpaidPlannedExpensesThisMonthPaise: 0,
        daysLeftInMonth: 28,
      });

      expect(baseline.safeToSpendPerDayRupees).toBe(242.71);

      // Step B: Add electricity 1,800 (180,000 paise)
      const withElectricity = calculateSafeToSpendPerDay({
        monthlyBudgetPaise: 13000 * 100,
        spentSoFarPaise: 6204 * 100,
        unpaidPlannedExpensesThisMonthPaise: 1800 * 100,
        daysLeftInMonth: 28,
      });

      expect(withElectricity.safeToSpendPerDayRupees).toBe(178.43);
    });

    it('Acceptance Test 2: Mark it paid with actual 2,100 -> spent becomes 8,304, planned item removed from forecast, safe to spend becomes 167.71/day (same day count)', () => {
      // When marked paid with 2,100:
      // Spent becomes 6,204 + 2,100 = 8,304
      // The planned item is now paid, so unpaid planned expenses = 0
      const paidForecast = calculateSafeToSpendPerDay({
        monthlyBudgetPaise: 13000 * 100,
        spentSoFarPaise: 8304 * 100,
        unpaidPlannedExpensesThisMonthPaise: 0,
        daysLeftInMonth: 28,
      });

      expect(paidForecast.safeToSpendPerDayRupees).toBe(167.71);
    });

    it('Acceptance Test 3: Add expected repayment of 340 from Rohit -> safe-to-spend does not change', () => {
      const forecastWithoutRepayment = calculateMonthForecast({
        monthlyBudgetPaise: 13000 * 100,
        spentSoFarPaise: 8304 * 100,
        plannedItems: [],
        currentMonthRange: { from: '2026-03-01', to: '2026-03-31' },
        daysElapsedSoFar: 3,
        daysLeftInMonth: 28,
      });

      const repaymentItem: PlannedItem = {
        id: 'plan-repayment-1',
        title: 'Repayment from Rohit',
        amount: 340 * 100,
        amountType: 'exact',
        dueDate: '2026-03-15',
        categoryId: 'cat-repayment',
        repeat: 'none',
        reminderDaysBefore: 3,
        note: 'Milk and chai share',
        status: 'upcoming',
        kind: 'repayment_expected',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const forecastWithRepayment = calculateMonthForecast({
        monthlyBudgetPaise: 13000 * 100,
        spentSoFarPaise: 8304 * 100,
        plannedItems: [repaymentItem],
        currentMonthRange: { from: '2026-03-01', to: '2026-03-31' },
        daysElapsedSoFar: 3,
        daysLeftInMonth: 28,
      });

      // Safe to spend per day MUST NOT change
      expect(forecastWithRepayment.safeToSpendPerDayRupees).toBe(forecastWithoutRepayment.safeToSpendPerDayRupees);
      expect(forecastWithRepayment.safeToSpendPerDayRupees).toBe(167.71);
      // Expected repayment is shown as a separate line
      expect(forecastWithRepayment.expectedRepaymentsThisMonthPaise).toBe(340 * 100);
    });

    it("Acceptance Test 4: Monthly Netflix: after marking paid, next month's item exists exactly once", () => {
      const netflixBase: PlannedItem = {
        id: 'plan-netflix-mar',
        seriesId: 'series-netflix',
        title: 'Netflix Subscription',
        amount: 649 * 100,
        amountType: 'exact',
        dueDate: '2026-03-15',
        categoryId: 'cat-sub',
        repeat: 'monthly',
        reminderDaysBefore: 3,
        note: '4K plan',
        status: 'upcoming',
        kind: 'bill',
        createdAt: 1000,
        updatedAt: 1000,
      };

      // 1. Mark March occurrence paid
      const netflixPaid: PlannedItem = {
        ...netflixBase,
        status: 'paid',
        actualAmount: 649 * 100,
        linkedTransactionId: 'txn-netflix-1',
      };

      // 2. Generate future occurrences up to 2026-05-01
      const existingDates = new Set<string>(['2026-03-15']);
      const occurrences = generateOccurrences(netflixPaid, '2026-05-01', existingDates);

      // April occurrence must exist
      expect(occurrences.length).toBe(1);
      expect(occurrences[0].dueDate).toBe('2026-04-15');
      expect(occurrences[0].status).toBe('upcoming');
      expect(occurrences[0].seriesId).toBe('series-netflix');

      // Calling generateOccurrences again with existingDates does NOT duplicate
      const secondCall = generateOccurrences(netflixPaid, '2026-05-01', existingDates);
      expect(secondCall.length).toBe(0);
    });

    it('Acceptance Test 5: "Can I afford this" with 5,000 saves nothing and simulates impact', () => {
      const currentForecast = calculateMonthForecast({
        monthlyBudgetPaise: 13000 * 100,
        spentSoFarPaise: 6204 * 100,
        plannedItems: [
          {
            id: 'plan-elec',
            title: 'Electricity',
            amount: 1800 * 100,
            amountType: 'estimate',
            dueDate: '2026-03-20',
            categoryId: 'cat-bills',
            repeat: 'none',
            reminderDaysBefore: 3,
            note: '',
            status: 'upcoming',
            kind: 'bill',
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
        currentMonthRange: { from: '2026-03-01', to: '2026-03-31' },
        daysElapsedSoFar: 3,
        daysLeftInMonth: 28,
        monthlyIncomePaise: 25000 * 100,
      });

      // Current safe to spend was 178.43
      expect(currentForecast.safeToSpendPerDayRupees).toBe(178.43);

      // Candidate purchase: 5,000 (500,000 paise)
      const affordability = calculateAffordability(currentForecast, 5000 * 100);

      // Remaining budget before: 13,000 - 6,204 - 1,800 = 4,996
      // If 5,000 added: 4,996 - 5,000 = -4 (less than 0) -> safe to spend becomes 0
      expect(affordability.newSafeToSpendPerDayPaise).toBe(0);
      expect(affordability.affordable).toBe(false);
      // Original forecast was untouched
      expect(currentForecast.spentSoFarPaise).toBe(6204 * 100);
      expect(currentForecast.unpaidPlannedExpensesThisMonthPaise).toBe(1800 * 100);
    });

    it('Acceptance Test 6: Item on the 31st in a 30-day month lands on the 30th (and Feb 28)', () => {
      // 31st of March -> next month is April (30 days) -> must land on April 30th
      const nextDateApril = calculateNextOccurrenceDate('2026-03-31', 'monthly');
      expect(nextDateApril).toBe('2026-04-30');

      // 31st of January -> next month is February 2026 (non-leap year, 28 days) -> must land on Feb 28th
      const nextDateFeb = calculateNextOccurrenceDate('2026-01-31', 'monthly');
      expect(nextDateFeb).toBe('2026-02-28');

      // Custom day 31 in April clamps to 30
      expect(clampDateToMonthEnd(2026, 4, 31)).toBe('2026-04-30');
      // Custom day 31 in February 2024 (leap year) clamps to 29
      expect(clampDateToMonthEnd(2024, 2, 31)).toBe('2024-02-29');
    });
  });

  describe('Item Display Statuses & Reminder Window', () => {
    it('determines status correctly: paid, skipped, overdue, due_soon, upcoming', () => {
      const today = '2026-03-15';

      // Paid
      expect(getItemDisplayStatus({ status: 'paid', dueDate: '2026-03-10', reminderDaysBefore: 3 }, today)).toBe('paid');
      // Skipped
      expect(getItemDisplayStatus({ status: 'skipped', dueDate: '2026-03-10', reminderDaysBefore: 3 }, today)).toBe('skipped');
      // Overdue (due before today and unpaid)
      expect(getItemDisplayStatus({ status: 'upcoming', dueDate: '2026-03-14', reminderDaysBefore: 3 }, today)).toBe('overdue');
      // Due today (within reminder window)
      expect(getItemDisplayStatus({ status: 'upcoming', dueDate: '2026-03-15', reminderDaysBefore: 3 }, today)).toBe('due_soon');
      // Due in 2 days (within 3 days reminder window)
      expect(getItemDisplayStatus({ status: 'upcoming', dueDate: '2026-03-17', reminderDaysBefore: 3 }, today)).toBe('due_soon');
      // Due in 5 days (beyond 3 days reminder window)
      expect(getItemDisplayStatus({ status: 'upcoming', dueDate: '2026-03-20', reminderDaysBefore: 3 }, today)).toBe('upcoming');
    });
  });

  describe('Recurring Estimate Suggestion', () => {
    it('suggests average of last 3 actuals for estimate items', () => {
      const pastItems: PlannedItem[] = [
        {
          id: 'p1',
          seriesId: 'series-elec',
          title: 'Electricity',
          amount: 180000,
          actualAmount: 190000, // ₹1,900
          amountType: 'estimate',
          dueDate: '2026-02-20',
          categoryId: 'cat-bills',
          repeat: 'monthly',
          reminderDaysBefore: 3,
          note: '',
          status: 'paid',
          kind: 'bill',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'p2',
          seriesId: 'series-elec',
          title: 'Electricity',
          amount: 180000,
          actualAmount: 210000, // ₹2,100
          amountType: 'estimate',
          dueDate: '2026-01-20',
          categoryId: 'cat-bills',
          repeat: 'monthly',
          reminderDaysBefore: 3,
          note: '',
          status: 'paid',
          kind: 'bill',
          createdAt: 2,
          updatedAt: 2,
        },
        {
          id: 'p3',
          seriesId: 'series-elec',
          title: 'Electricity',
          amount: 180000,
          actualAmount: 200000, // ₹2,000
          amountType: 'estimate',
          dueDate: '2025-12-20',
          categoryId: 'cat-bills',
          repeat: 'monthly',
          reminderDaysBefore: 3,
          note: '',
          status: 'paid',
          kind: 'bill',
          createdAt: 3,
          updatedAt: 3,
        },
        {
          id: 'p4',
          seriesId: 'series-elec',
          title: 'Electricity',
          amount: 180000,
          amountType: 'estimate',
          actualAmount: 150000, // older, should be excluded from top 3
          dueDate: '2025-11-20',
          categoryId: 'cat-bills',
          repeat: 'monthly',
          reminderDaysBefore: 3,
          note: '',
          status: 'paid',
          kind: 'bill',
          createdAt: 4,
          updatedAt: 4,
        },
      ];

      // Average of 190000 + 210000 + 200000 = 600000 / 3 = 200000 (₹2,000)
      const suggestion = suggestEstimateAmount('series-elec', pastItems);
      expect(suggestion).toBe(200000);
    });
  });

  describe('Starting Balance, Monthly Income and Projection Range', () => {
    it('computes month-end projection range and detects deficit when funds are exceeded', () => {
      const forecast = calculateMonthForecast({
        monthlyBudgetPaise: 20000 * 100,
        spentSoFarPaise: 10000 * 100,
        plannedItems: [
          {
            id: 'p-rent',
            title: 'Rent',
            amount: 8000 * 100,
            amountType: 'exact',
            dueDate: '2026-03-25',
            categoryId: 'cat-rent',
            repeat: 'monthly',
            reminderDaysBefore: 3,
            note: '',
            status: 'upcoming',
            kind: 'bill',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        currentMonthRange: { from: '2026-03-01', to: '2026-03-31' },
        daysElapsedSoFar: 10,
        daysLeftInMonth: 21,
        startingBalancePaise: 5000 * 100,
        monthlyIncomePaise: 25000 * 100, // Total funds = 30,000
      });

      // Daily variable spend pace: 10,000 / 10 days = 1,000/day
      // Variable spend for next 21 days = 21,000
      // Expected month-end spend = 10,000 (spent) + 8,000 (planned unpaid) + 21,000 (variable) = 39,000
      expect(forecast.projectedMonthEndSpendPaise).toBe(39000 * 100);
      expect(forecast.projectionRangePaise.low).toBeLessThan(forecast.projectedMonthEndSpendPaise);
      expect(forecast.projectionRangePaise.high).toBeGreaterThan(forecast.projectedMonthEndSpendPaise);

      // Total available: 5,000 + 25,000 = 30,000
      // Leftover = 30,000 - 39,000 = -9,000 -> Deficit!
      expect(forecast.projectedLeftoverPaise).toBe(-9000 * 100);
      expect(forecast.isDeficit).toBe(true);
    });
  });

  describe('Step 5 Plan Insights Tests', () => {
    const mockCategories: Category[] = [
      { id: 'cat-food', name: 'Food', icon: 'UtensilsCrossed', color: '#F97316', order: 1, archived: false, type: 'expense' },
      { id: 'cat-bills', name: 'Bills', icon: 'Zap', color: '#6366F1', order: 2, archived: false, type: 'expense' },
    ];

    it('generates Plan vs Actual insight: "You planned 4,000 for food and spent 4,700."', () => {
      const plannedFood: PlannedItem = {
        id: 'plan-food',
        title: 'Monthly Groceries & Food',
        amount: 4000 * 100,
        amountType: 'exact',
        dueDate: '2026-03-10',
        categoryId: 'cat-food',
        repeat: 'monthly',
        reminderDaysBefore: 3,
        note: '',
        status: 'upcoming',
        kind: 'bill',
        createdAt: 1,
        updatedAt: 1,
      };

      const txns: Transaction[] = [
        {
          id: 't1',
          type: 'expense',
          amount: 4700 * 100,
          totalPaise: 4700 * 100,
          mySharePaise: 4700 * 100,
          categoryId: 'cat-food',
          paymentMethodId: 'pm-1',
          date: '2026-03-05',
          note: 'Swiggy and supermarket',
          tags: [],
          scope: 'personal',
          createdAt: 1,
          updatedAt: 1,
        },
      ];

      const range = { from: '2026-03-01', to: '2026-03-31' };
      const breakdown = calculatePlanVsActualBreakdown([plannedFood], [], txns, mockCategories, range);

      expect(breakdown.length).toBe(1);
      expect(breakdown[0].categoryName).toBe('Food');
      expect(breakdown[0].plannedPaise).toBe(4000 * 100);
      expect(breakdown[0].spentPaise).toBe(4700 * 100);
      expect(breakdown[0].variancePaise).toBe(700 * 100);

      const cards = generateInsightCards(
        {
          totalSpent: 4700 * 100,
          totalIncome: 0,
          transactionCount: 1,
          averagePerDay: 4700 * 100,
          biggestExpense: txns[0],
          topCategory: { categoryId: 'cat-food', amount: 4700 * 100, percentage: 100 },
          byCategory: [{ categoryId: 'cat-food', amount: 4700 * 100, percentage: 100 }],
          byPaymentMethod: [],
          byWeekday: [],
          dailySpend: [],
        },
        mockCategories,
        range,
        txns,
        undefined,
        [plannedFood],
        []
      );

      const planCard = cards.find(c => c.type === 'plan-vs-actual');
      expect(planCard).toBeDefined();
      expect(planCard?.message).toContain('You planned ₹4,000 for food and spent ₹4,700.');
    });

    it('generates Estimate Variance insight: "Electricity was 17% above your estimate."', () => {
      // Planned: 1,800, Paid: 2,100 -> diff = +300 -> 300 / 1800 = 16.666% -> 17%
      const paidElectricity: PlannedItem = {
        id: 'plan-elec',
        title: 'Electricity',
        amount: 1800 * 100,
        actualAmount: 2100 * 100,
        amountType: 'estimate',
        dueDate: '2026-03-20',
        categoryId: 'cat-bills',
        repeat: 'monthly',
        reminderDaysBefore: 3,
        note: '',
        status: 'paid',
        kind: 'bill',
        createdAt: 1,
        updatedAt: 1,
      };

      const range = { from: '2026-03-01', to: '2026-03-31' };
      const cards = generateInsightCards(
        {
          totalSpent: 2100 * 100,
          totalIncome: 0,
          transactionCount: 1,
          averagePerDay: 2100 * 100,
          biggestExpense: null,
          topCategory: null,
          byCategory: [],
          byPaymentMethod: [],
          byWeekday: [],
          dailySpend: [],
        },
        mockCategories,
        range,
        [],
        undefined,
        [paidElectricity],
        []
      );

      const estimateCard = cards.find(c => c.type === 'estimate-variance');
      expect(estimateCard).toBeDefined();
      expect(estimateCard?.message).toBe('Electricity was 17% above your estimate.');
    });

    it('generates Upcoming Bills insight: "Upcoming bills in the next 30 days: ₹5,200."', () => {
      const nextWeekD = new Date();
      nextWeekD.setDate(nextWeekD.getDate() + 7);
      const nextWeekStr = nextWeekD.toISOString().split('T')[0];

      const upcomingBills: PlannedItem[] = [
        {
          id: 'b1',
          title: 'Rent',
          amount: 4000 * 100,
          amountType: 'exact',
          dueDate: nextWeekStr,
          categoryId: 'cat-bills',
          repeat: 'monthly',
          reminderDaysBefore: 3,
          note: '',
          status: 'upcoming',
          kind: 'bill',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'b2',
          title: 'Internet',
          amount: 1200 * 100,
          amountType: 'exact',
          dueDate: nextWeekStr,
          categoryId: 'cat-bills',
          repeat: 'monthly',
          reminderDaysBefore: 3,
          note: '',
          status: 'upcoming',
          kind: 'bill',
          createdAt: 1,
          updatedAt: 1,
        },
      ];

      const range = { from: '2026-03-01', to: '2026-03-31' };
      const cards = generateInsightCards(
        {
          totalSpent: 0,
          totalIncome: 0,
          transactionCount: 0,
          averagePerDay: 0,
          biggestExpense: null,
          topCategory: null,
          byCategory: [],
          byPaymentMethod: [],
          byWeekday: [],
          dailySpend: [],
        },
        mockCategories,
        range,
        [],
        undefined,
        upcomingBills,
        []
      );

      const billsCard = cards.find(c => c.type === 'upcoming-bills');
      expect(billsCard).toBeDefined();
      expect(billsCard?.message).toBe('Upcoming bills in the next 30 days: ₹5,200.');
    });
  });
});
