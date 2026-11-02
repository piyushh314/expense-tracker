import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarClock,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Pencil,
  Trash2,
  Calendar,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatINR, toRupees, toPaise } from '../utils/money';
import {
  getCurrentMonth,
  getDaysRemaining,
  formatMonthYear,
  formatDateShort,
  today,
} from '../utils/date';
import {
  getItemDisplayStatus,
  calculateSafeToSpendPerDay,
  calculateMonthForecast,
  suggestEstimateAmount,
} from '../utils/planForecast';
import { getEffectiveExpensePaise } from '../utils/peopleLedger';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';
import { downloadPlanIcsFile } from '../utils/reminders';
import DynamicIcon from '../components/ui/DynamicIcon';
import AddEditPlannedItemModal from '../components/plan/AddEditPlannedItemModal';
import QuickAdd from '../components/QuickAdd';
import CanIAffordThis from '../components/plan/CanIAffordThis';
import type { PlannedItem, Budget } from '../types';

type PlanTab = 'timeline' | 'calendar' | 'budgets';

export default function PlanScreen() {
  const { settings, updateSettings } = useSettings();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<PlanTab>('timeline');

  // Modal states
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlannedItem | null>(null);
  const [quickAddPlannedItem, setQuickAddPlannedItem] = useState<PlannedItem | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [initialDueDateForAdd, setInitialDueDateForAdd] = useState<string | undefined>(undefined);

  // Calendar states
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(() => today());

  // Budget editing states
  const [showOverallEdit, setShowOverallEdit] = useState(false);
  const [overallInput, setOverallInput] = useState('');
  const [showCatBudgetEdit, setShowCatBudgetEdit] = useState<string | null>(null);
  const [catBudgetInput, setCatBudgetInput] = useState('');

  // Date ranges
  const range = getCurrentMonth(settings.monthStartDay);
  const period = range.from.slice(0, 7); // YYYY-MM
  const daysLeft = getDaysRemaining(range);
  const todayStr = today();

  // 7 days and 30 days boundaries
  const sevenDaysDate = useMemo(() => {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }, [todayStr]);

  const thirtyDaysDate = useMemo(() => {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  }, [todayStr]);

  // Live queries
  const allPlannedItems = useLiveQuery(() => db.plannedItems.orderBy('dueDate').toArray()) ?? [];
  const categories = useLiveQuery(() => db.categories.where('archived').equals(0).sortBy('order')) ?? [];
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const expenseCategories = useMemo(() => categories.filter(c => c.type === 'expense'), [categories]);

  const budgets = useLiveQuery(() => db.budgets.where('period').equals(period).toArray(), [period]) ?? [];
  const budgetMap = useMemo(() => new Map(budgets.map(b => [b.categoryId, b])), [budgets]);

  const monthTxns = useLiveQuery(
    () => db.transactions.where('date').between(range.from, range.to, true, true).toArray(),
    [range.from, range.to]
  ) ?? [];

  // Spending calculations
  const totalSpentPaise = monthTxns
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + getEffectiveExpensePaise(t), 0);

  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>();
    monthTxns
      .filter(t => t.type === 'expense')
      .forEach(t => m.set(t.categoryId, (m.get(t.categoryId) || 0) + getEffectiveExpensePaise(t)));
    return m;
  }, [monthTxns]);

  // Planned items grouping
  const upcomingItems = useMemo(
    () => allPlannedItems.filter(item => item.status === 'upcoming'),
    [allPlannedItems]
  );

  const historyItems = useMemo(
    () => allPlannedItems.filter(item => item.status === 'paid' || item.status === 'skipped'),
    [allPlannedItems]
  );

  // Group upcoming items by timeline buckets
  const timelineGroups = useMemo(() => {
    const overdue: PlannedItem[] = [];
    const thisWeek: PlannedItem[] = [];
    const laterThisMonth: PlannedItem[] = [];
    const nextMonthAndLater: PlannedItem[] = [];

    const monthEnd = range.to;

    upcomingItems.forEach(item => {
      if (item.dueDate < todayStr) {
        overdue.push(item);
      } else if (item.dueDate <= sevenDaysDate) {
        thisWeek.push(item);
      } else if (item.dueDate <= monthEnd) {
        laterThisMonth.push(item);
      } else {
        nextMonthAndLater.push(item);
      }
    });

    return { overdue, thisWeek, laterThisMonth, nextMonthAndLater };
  }, [upcomingItems, todayStr, sevenDaysDate, range.to]);

  // Summary Metrics
  const summary = useMemo(() => {
    const dueIn7DaysItems = upcomingItems.filter(
      i => i.dueDate >= todayStr && i.dueDate <= sevenDaysDate && (i.kind === 'bill' || i.kind === 'one_off')
    );
    const dueIn30DaysItems = upcomingItems.filter(
      i => i.dueDate >= todayStr && i.dueDate <= thirtyDaysDate && (i.kind === 'bill' || i.kind === 'one_off')
    );

    const dueInMonthUnpaidExpenses = upcomingItems.filter(
      i => (i.dueDate <= range.to || i.dueDate < range.from) && (i.kind === 'bill' || i.kind === 'one_off')
    );

    const totalDueIn7DaysPaise = dueIn7DaysItems.reduce((acc, i) => acc + i.amount, 0);
    const totalDueIn30DaysPaise = dueIn30DaysItems.reduce((acc, i) => acc + i.amount, 0);
    const totalDueInMonthPaise = dueInMonthUnpaidExpenses.reduce((acc, i) => acc + i.amount, 0);

    return {
      dueIn7DaysCount: dueIn7DaysItems.length,
      dueIn7DaysPaise: totalDueIn7DaysPaise,
      dueIn30DaysCount: dueIn30DaysItems.length,
      dueIn30DaysPaise: totalDueIn30DaysPaise,
      totalDueInMonthPaise,
    };
  }, [upcomingItems, todayStr, sevenDaysDate, thirtyDaysDate, range.to, range.from]);

  // Overall budget metrics
  const overallBudgetPaise = settings.monthlyBudget || 0;
  const overallPct = overallBudgetPaise > 0 ? Math.round((totalSpentPaise / overallBudgetPaise) * 100) : 0;
  const { safeToSpendPerDayPaise } = calculateSafeToSpendPerDay({
    monthlyBudgetPaise: overallBudgetPaise,
    spentSoFarPaise: totalSpentPaise,
    unpaidPlannedExpensesThisMonthPaise: summary.totalDueInMonthPaise,
    daysLeftInMonth: daysLeft,
  });

  const forecast = useMemo(() => {
    const startD = new Date(range.from + 'T00:00:00');
    const todayD = new Date(todayStr + 'T00:00:00');
    const diffTime = todayD.getTime() - startD.getTime();
    const daysElapsed = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);

    return calculateMonthForecast({
      monthlyBudgetPaise: overallBudgetPaise,
      spentSoFarPaise: totalSpentPaise,
      plannedItems: allPlannedItems,
      currentMonthRange: range,
      daysElapsedSoFar: daysElapsed,
      daysLeftInMonth: daysLeft,
      startingBalancePaise: settings.startingBalance,
      monthlyIncomePaise: settings.monthlyIncome,
    });
  }, [
    overallBudgetPaise,
    totalSpentPaise,
    allPlannedItems,
    range,
    todayStr,
    daysLeft,
    settings.startingBalance,
    settings.monthlyIncome,
  ]);

  // Map items by due date for calendar
  const itemsByDate = useMemo(() => {
    const map = new Map<string, PlannedItem[]>();
    allPlannedItems.forEach(item => {
      const list = map.get(item.dueDate) || [];
      list.push(item);
      map.set(item.dueDate, list);
    });
    return map;
  }, [allPlannedItems]);

  const selectedDayItems = useMemo(() => {
    return itemsByDate.get(selectedDate) || [];
  }, [itemsByDate, selectedDate]);

  const calendarData = useMemo(() => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDayOfWeekIndex = new Date(calendarYear, calendarMonth, 1).getDay(); // 0 is Sun
    const startOffset = (firstDayOfWeekIndex - settings.firstDayOfWeek + 7) % 7;
    const prevMonthDaysCount = new Date(calendarYear, calendarMonth, 0).getDate();

    // Weekday labels based on settings.firstDayOfWeek
    const baseWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdays = [
      ...baseWeekdays.slice(settings.firstDayOfWeek),
      ...baseWeekdays.slice(0, settings.firstDayOfWeek),
    ];

    // Leading padding days from previous month
    const paddingDays: { day: number; dateStr: string; isCurrentMonth: boolean }[] = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthDaysCount - i;
      const prevM = calendarMonth === 0 ? 12 : calendarMonth;
      const prevY = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
      paddingDays.push({
        day: d,
        dateStr: `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isCurrentMonth: false,
      });
    }

    // Days in current month
    const currentMonthDays: { day: number; dateStr: string; isCurrentMonth: boolean }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      currentMonthDays.push({
        day: d,
        dateStr: `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isCurrentMonth: true,
      });
    }

    // Trailing padding days to fill 7-column rows
    const totalCells = paddingDays.length + currentMonthDays.length;
    const trailingCount = (7 - (totalCells % 7)) % 7;
    const trailingDays: { day: number; dateStr: string; isCurrentMonth: boolean }[] = [];
    for (let d = 1; d <= trailingCount; d++) {
      const nextM = calendarMonth === 11 ? 1 : calendarMonth + 2;
      const nextY = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
      trailingDays.push({
        day: d,
        dateStr: `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isCurrentMonth: false,
      });
    }

    const allGridCells = [...paddingDays, ...currentMonthDays, ...trailingDays];

    // Month totals for currently viewed calendar month
    const monthKey = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}`;
    const viewedMonthItems = allPlannedItems.filter(i => i.dueDate.startsWith(monthKey) && i.status !== 'skipped');
    const plannedExpensesPaise = viewedMonthItems
      .filter(i => i.kind === 'bill' || i.kind === 'one_off')
      .reduce((s, i) => s + (i.status === 'paid' && i.actualAmount ? i.actualAmount : i.amount), 0);
    const expectedInflowsPaise = viewedMonthItems
      .filter(i => i.kind === 'income_expected' || i.kind === 'repayment_expected')
      .reduce((s, i) => s + (i.status === 'paid' && i.actualAmount ? i.actualAmount : i.amount), 0);
    const paidCount = viewedMonthItems.filter(i => i.status === 'paid').length;
    const upcomingCount = viewedMonthItems.filter(i => i.status === 'upcoming').length;

    return {
      weekdays,
      allGridCells,
      monthKey,
      plannedExpensesPaise,
      expectedInflowsPaise,
      paidCount,
      upcomingCount,
    };
  }, [calendarYear, calendarMonth, settings.firstDayOfWeek, allPlannedItems]);

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarYear(y => y - 1);
      setCalendarMonth(11);
    } else {
      setCalendarMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarYear(y => y + 1);
      setCalendarMonth(0);
    } else {
      setCalendarMonth(m => m + 1);
    }
  };

  const handleTodayJump = () => {
    const now = new Date();
    setCalendarYear(now.getFullYear());
    setCalendarMonth(now.getMonth());
    setSelectedDate(todayStr);
  };

  // Action handlers
  const handleMarkPaid = (item: PlannedItem) => {
    setQuickAddPlannedItem(item);
  };

  const handleSkip = async (item: PlannedItem) => {
    await db.plannedItems.update(item.id, {
      status: 'skipped',
      updatedAt: Date.now(),
    });
    showToast(`Skipped "${item.title}". It won't count in this month's forecast.`);
  };

  const handleUnskip = async (item: PlannedItem) => {
    await db.plannedItems.update(item.id, {
      status: 'upcoming',
      updatedAt: Date.now(),
    });
    showToast(`Restored "${item.title}" to upcoming plan.`);
  };

  const handleDelete = async (item: PlannedItem) => {
    await db.plannedItems.delete(item.id);
    showToast(`Deleted "${item.title}"`);
  };

  const handleSaveOverallBudget = () => {
    const amount = toPaise(parseFloat(overallInput) || 0);
    updateSettings({ monthlyBudget: amount > 0 ? amount : null });
    setShowOverallEdit(false);
    showToast(amount > 0 ? `Monthly budget set to ${formatINR(amount)}` : 'Monthly budget removed');
  };

  const handleSaveCatBudget = async (categoryId: string) => {
    const amount = toPaise(parseFloat(catBudgetInput) || 0);
    const existing = budgetMap.get(categoryId);

    if (amount > 0) {
      const budget: Budget = {
        id: existing?.id || uuid(),
        period,
        categoryId,
        amount,
      };
      await db.budgets.put(budget);
      showToast('Category budget saved');
    } else if (existing) {
      await db.budgets.delete(existing.id);
      showToast('Category budget removed');
    }
    setShowCatBudgetEdit(null);
  };

  const getBudgetColor = (pct: number) => {
    if (pct > 100) return { bg: 'bg-red-500', text: 'text-red-500', label: 'Over budget' };
    if (pct > 70) return { bg: 'bg-amber-500', text: 'text-amber-500', label: 'Watch out' };
    return { bg: 'bg-emerald-500', text: 'text-emerald-500', label: 'On track' };
  };

  // Render a planned item row
  const renderItemRow = (item: PlannedItem) => {
    const cat = catMap.get(item.categoryId);
    const displayStatus = getItemDisplayStatus(item, todayStr);
    const isIncome = item.kind === 'income_expected';
    const isRepayment = item.kind === 'repayment_expected';

    // Suggestion for recurring estimate
    const estimateSuggestion =
      item.amountType === 'estimate' && item.seriesId
        ? suggestEstimateAmount(item.seriesId, allPlannedItems)
        : null;

    return (
      <div
        key={item.id}
        className={`p-3.5 rounded-2xl bg-white dark:bg-gray-900 border transition-all ${
          displayStatus === 'overdue'
            ? 'border-red-200 dark:border-red-900/60 shadow-sm'
            : displayStatus === 'due_soon'
            ? 'border-amber-200 dark:border-amber-800/60 shadow-sm'
            : 'border-gray-100 dark:border-gray-800'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Category Icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: (cat?.color || '#6366F1') + '18' }}
          >
            <DynamicIcon
              name={cat?.icon || (isIncome ? 'Banknote' : isRepayment ? 'Users' : 'Zap')}
              size={18}
              style={{ color: cat?.color || '#6366F1' }}
            />
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">
                {item.title}
              </span>

              {/* Status Chips */}
              {displayStatus === 'overdue' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                  Overdue
                </span>
              )}
              {displayStatus === 'due_soon' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                  Due Soon
                </span>
              )}
              {item.repeat !== 'none' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 capitalize">
                  {item.repeat}
                </span>
              )}
              {item.amountType === 'estimate' && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500">
                  Est.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1 font-medium">
                <Calendar size={12} />
                {formatDateShort(item.dueDate)}
              </span>
              {cat && <span>• {cat.name}</span>}
              {item.note && <span className="truncate max-w-[140px]">• {item.note}</span>}
            </div>

            {estimateSuggestion !== null && estimateSuggestion !== item.amount && (
              <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1">
                <Sparkles size={11} />
                Suggested avg of last 3: {formatINR(estimateSuggestion)}
              </p>
            )}
          </div>

          {/* Amount & Actions */}
          <div className="text-right shrink-0">
            <p
              className={`text-sm font-bold ${
                isIncome || isRepayment ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              {isIncome || isRepayment ? '+' : ''}
              {formatINR(item.amount)}
            </p>

            <div className="flex items-center justify-end gap-1.5 mt-2">
              {item.status === 'upcoming' ? (
                <>
                  <button
                    onClick={() => handleMarkPaid(item)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-all active:scale-95"
                  >
                    <CheckCircle2 size={12} />
                    Paid
                  </button>
                  <button
                    onClick={() => handleSkip(item)}
                    title="Skip occurrence"
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <Clock size={13} />
                  </button>
                </>
              ) : item.status === 'skipped' ? (
                <button
                  onClick={() => handleUnskip(item)}
                  className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold text-xs flex items-center gap-1"
                >
                  <RotateCcw size={11} /> Restore
                </button>
              ) : (
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Paid
                </span>
              )}

              <button
                onClick={() => {
                  downloadPlanIcsFile(item);
                  showToast(`Downloaded calendar alert for ${item.title}`);
                }}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-indigo-500 transition-colors"
                title="Add to phone calendar (.ics)"
              >
                <Calendar size={13} />
              </button>

              <button
                onClick={() => {
                  setEditingItem(item);
                  setIsAddEditOpen(true);
                }}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-indigo-500 transition-colors"
                title="Edit item"
              >
                <Pencil size={13} />
              </button>

              <button
                onClick={() => handleDelete(item)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 transition-colors"
                title="Delete item"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-8 px-4 space-y-4">
      {/* Header */}
      <div className="pt-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CalendarClock size={22} className="text-indigo-500" />
            Plan & Forecast
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatMonthYear(todayStr)} · {daysLeft} days left
          </p>
        </div>

        <button
          onClick={() => {
            setEditingItem(null);
            setIsAddEditOpen(true);
          }}
          className="px-3.5 py-2 rounded-xl gradient-primary text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
        >
          <Plus size={15} /> Add to Plan
        </button>
      </div>

      {/* View Switcher: Upcoming Timeline vs Month Calendar vs Category Budgets */}
      <div className="bg-gray-200/70 dark:bg-gray-800/70 rounded-2xl p-1 flex">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'timeline'
              ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
          }`}
        >
          Timeline ({upcomingItems.length})
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'calendar'
              ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
          }`}
        >
          Calendar
        </button>
        <button
          onClick={() => setActiveTab('budgets')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'budgets'
              ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
          }`}
        >
          Category Budgets ({budgets.length})
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: UPCOMING & TIMELINE                                */}
      {/* ======================================================== */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Due in 7 Days
              </p>
              <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                {formatINR(summary.dueIn7DaysPaise)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {summary.dueIn7DaysCount} {summary.dueIn7DaysCount === 1 ? 'item' : 'items'}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Due in 30 Days
              </p>
              <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                {formatINR(summary.dueIn30DaysPaise)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {summary.dueIn30DaysCount} {summary.dueIn30DaysCount === 1 ? 'item' : 'items'}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 p-3 rounded-2xl border border-indigo-100 dark:border-indigo-950/60 shadow-sm">
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">
                This Month Unpaid
              </p>
              <p className="text-base font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                {formatINR(summary.totalDueInMonthPaise)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">Affects safe-spend</p>
            </div>
          </div>

          {/* "Can I Afford This" Simulation Widget */}
          <CanIAffordThis
            forecast={forecast}
            onAddToPlan={({ amountPaise, title, kind }) => {
              setEditingItem({
                id: '',
                title,
                amount: amountPaise,
                amountType: 'exact',
                dueDate: todayStr,
                categoryId: '',
                repeat: 'none',
                reminderDaysBefore: 3,
                note: '',
                status: 'upcoming',
                kind,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
              setIsAddEditOpen(true);
            }}
          />

          {/* Timeline Groups */}
          <div className="space-y-4">
            {/* 1. OVERDUE (if any) */}
            {timelineGroups.overdue.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
                  <AlertTriangle size={14} />
                  <span>Overdue ({timelineGroups.overdue.length})</span>
                </div>
                <div className="space-y-2">
                  {timelineGroups.overdue.map(renderItemRow)}
                </div>
              </div>
            )}

            {/* 2. THIS WEEK */}
            {timelineGroups.thisWeek.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                  <Clock size={14} />
                  <span>This Week ({timelineGroups.thisWeek.length})</span>
                </div>
                <div className="space-y-2">
                  {timelineGroups.thisWeek.map(renderItemRow)}
                </div>
              </div>
            )}

            {/* 3. LATER THIS MONTH */}
            {timelineGroups.laterThisMonth.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400">
                  <Calendar size={14} />
                  <span>Later This Month ({timelineGroups.laterThisMonth.length})</span>
                </div>
                <div className="space-y-2">
                  {timelineGroups.laterThisMonth.map(renderItemRow)}
                </div>
              </div>
            )}

            {/* 4. NEXT MONTH & BEYOND */}
            {timelineGroups.nextMonthAndLater.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
                  <Calendar size={14} />
                  <span>Next Month & Beyond ({timelineGroups.nextMonthAndLater.length})</span>
                </div>
                <div className="space-y-2">
                  {timelineGroups.nextMonthAndLater.map(renderItemRow)}
                </div>
              </div>
            )}

            {/* EMPTY STATE */}
            {upcomingItems.length === 0 && (
              <div className="p-8 rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500 mx-auto flex items-center justify-center">
                  <CalendarClock size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    No upcoming items planned
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                    Track recurring bills, monthly rent, expected salaries, or upcoming one-off expenses
                    to see accurate daily safe spending.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingItem(null);
                    setIsAddEditOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl gradient-primary text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-md shadow-indigo-500/20"
                >
                  <Plus size={14} /> Add First Planned Item
                </button>
              </div>
            )}

            {/* SETTLED / HISTORY TOGGLE */}
            {historyItems.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full py-2.5 px-4 rounded-xl bg-gray-100 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 text-xs font-bold flex items-center justify-between hover:bg-gray-200/60 transition-colors"
                >
                  <span>Settled & Skipped Items ({historyItems.length})</span>
                  {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showHistory && (
                  <div className="space-y-2 mt-2">
                    {historyItems.map(renderItemRow)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: MONTH CALENDAR VIEW                               */}
      {/* ======================================================== */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          {/* Calendar Card with Month Nav and Dots */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {formatMonthYear(`${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-01`)}
                </h2>
                <p className="text-[11px] text-gray-400">
                  {calendarData.upcomingCount} upcoming · {calendarData.paidCount} paid
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleTodayJump}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                  title="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                  title="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Weekday Column Headers */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarData.weekdays.map(d => (
                <div key={d} className="text-[11px] font-bold text-gray-400 uppercase py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarData.allGridCells.map(cell => {
                const isSelected = cell.dateStr === selectedDate;
                const isCellToday = cell.dateStr === todayStr;
                const dayItems = itemsByDate.get(cell.dateStr) || [];

                const hasOverdue = dayItems.some(i => getItemDisplayStatus(i, todayStr) === 'overdue');
                const hasDueSoonOrBill = dayItems.some(
                  i => (i.kind === 'bill' || i.kind === 'one_off') && i.status === 'upcoming'
                );
                const hasInflow = dayItems.some(
                  i => (i.kind === 'income_expected' || i.kind === 'repayment_expected') && i.status === 'upcoming'
                );
                const hasPaid = dayItems.some(i => i.status === 'paid');

                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(cell.dateStr)}
                    className={`min-h-[54px] p-1.5 rounded-2xl flex flex-col items-center justify-between transition-all relative ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-500/30'
                        : isCellToday
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-extrabold ring-1 ring-indigo-400/50'
                        : cell.isCurrentMonth
                        ? 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/60'
                        : 'text-gray-300 dark:text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xs">{cell.day}</span>

                    {/* Dots on due dates */}
                    <div className="flex items-center gap-1 mt-1 justify-center min-h-[6px]">
                      {hasOverdue && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-red-500'}`}
                          title="Overdue item"
                        />
                      )}
                      {hasDueSoonOrBill && !hasOverdue && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-200' : 'bg-amber-500'}`}
                          title="Upcoming bill/expense"
                        />
                      )}
                      {hasInflow && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-200' : 'bg-emerald-500'}`}
                          title="Expected income/repayment"
                        />
                      )}
                      {hasPaid && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-indigo-200' : 'bg-indigo-400'}`}
                          title="Paid item"
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-3 pt-2 text-[10px] text-gray-400 border-t border-gray-100 dark:border-gray-800 flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Overdue
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Bill / Due Soon
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Inflow (Income/Loan)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-400" /> Paid
              </span>
            </div>
          </div>

          {/* Month Overview for Viewed Month */}
          <div className="p-3.5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between text-xs">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Planned Expenses
              </p>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                {formatINR(calendarData.plannedExpensesPaise)}
              </p>
            </div>
            {calendarData.expectedInflowsPaise > 0 && (
              <div className="text-right">
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                  If Inflows Received
                </p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  +{formatINR(calendarData.expectedInflowsPaise)}
                </p>
              </div>
            )}
          </div>

          {/* Selected Date Schedule Header & List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 dark:text-gray-100">
                <Calendar size={14} className="text-indigo-500" />
                <span>
                  {formatDateShort(selectedDate)}
                  {selectedDate === todayStr ? ' (Today)' : ''}
                </span>
                <span className="text-gray-400 font-normal">
                  · {selectedDayItems.length} {selectedDayItems.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setInitialDueDateForAdd(selectedDate);
                  setIsAddEditOpen(true);
                }}
                className="text-xs text-indigo-500 hover:text-indigo-600 font-bold flex items-center gap-1"
              >
                <Plus size={13} /> Add for this day
              </button>
            </div>

            {selectedDayItems.length > 0 ? (
              <div className="space-y-2">
                {selectedDayItems.map(renderItemRow)}
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-center space-y-2">
                <p className="text-xs text-gray-400">No planned items due on this date</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setInitialDueDateForAdd(selectedDate);
                    setIsAddEditOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl gradient-primary text-white text-xs font-bold shadow-sm inline-flex items-center gap-1"
                >
                  <Plus size={13} /> Add Plan for {formatDateShort(selectedDate)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: CATEGORY BUDGETS (Unified with Plan Tab)         */}
      {/* ======================================================== */}
      {activeTab === 'budgets' && (
        <div className="space-y-4">
          {/* Overall Monthly Budget Card */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target size={18} className="text-indigo-500" />
                <h2 className="text-sm font-bold">Overall Monthly Budget</h2>
              </div>
              <button
                onClick={() => {
                  setOverallInput(overallBudgetPaise > 0 ? String(toRupees(overallBudgetPaise)) : '');
                  setShowOverallEdit(true);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-indigo-500 transition-colors"
              >
                <Pencil size={14} />
              </button>
            </div>

            {overallBudgetPaise > 0 ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-bold">{formatINR(totalSpentPaise)}</span>
                    <span className="text-xs text-gray-400 ml-1">of {formatINR(overallBudgetPaise)}</span>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      getBudgetColor(overallPct).bg
                    } text-white`}
                  >
                    {overallPct}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(overallPct, 100)}%` }}
                    transition={{ duration: 0.8 }}
                    className={`h-full rounded-full ${getBudgetColor(overallPct).bg}`}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                  <span>
                    {overallBudgetPaise > totalSpentPaise
                      ? `${formatINR(overallBudgetPaise - totalSpentPaise)} remaining`
                      : `Over by ${formatINR(totalSpentPaise - overallBudgetPaise)}`}
                  </span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    Safe: {formatINR(safeToSpendPerDayPaise)}/day
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-gray-400 mb-2">No overall budget set for this month</p>
                <button
                  onClick={() => setShowOverallEdit(true)}
                  className="px-3 py-1.5 rounded-xl gradient-primary text-white text-xs font-bold shadow-sm"
                >
                  Set Monthly Budget
                </button>
              </div>
            )}
          </div>

          {/* Category Budgets List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
              Category Budgets
            </h3>

            <div className="space-y-2">
              {expenseCategories.map(cat => {
                const budget = budgetMap.get(cat.id);
                const budgetPaise = budget?.amount || 0;
                const spentPaise = spentByCategory.get(cat.id) || 0;
                const pct = budgetPaise > 0 ? Math.round((spentPaise / budgetPaise) * 100) : 0;
                const color = getBudgetColor(pct);

                return (
                  <div
                    key={cat.id}
                    className="p-3.5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: cat.color + '18' }}
                        >
                          <DynamicIcon name={cat.icon} size={15} style={{ color: cat.color }} />
                        </div>
                        <div>
                          <p className="text-xs font-bold">{cat.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {formatINR(spentPaise)} spent
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {budgetPaise > 0 ? (
                          <div className="text-right">
                            <span className="text-xs font-bold">{formatINR(budgetPaise)}</span>
                            <span className={`block text-[10px] font-bold ${color.text}`}>
                              {pct}%
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setCatBudgetInput('');
                              setShowCatBudgetEdit(cat.id);
                            }}
                            className="text-xs text-indigo-500 font-bold hover:underline"
                          >
                            + Set Budget
                          </button>
                        )}

                        {budgetPaise > 0 && (
                          <button
                            onClick={() => {
                              setCatBudgetInput(String(toRupees(budgetPaise)));
                              setShowCatBudgetEdit(cat.id);
                            }}
                            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-indigo-500"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {budgetPaise > 0 && (
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mt-1.5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(pct, 100)}%` }}
                          transition={{ duration: 0.6 }}
                          className={`h-full rounded-full ${color.bg}`}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Edit Overall Budget Modal */}
      <AnimatePresence>
        {showOverallEdit && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
              onClick={() => setShowOverallEdit(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-2xl"
            >
              <h3 className="text-base font-bold mb-3">Set Monthly Budget</h3>
              <input
                type="number"
                placeholder="0"
                value={overallInput}
                onChange={e => setOverallInput(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-base font-bold outline-none focus:ring-2 focus:ring-indigo-500/30 mb-4"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowOverallEdit(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveOverallBudget}
                  className="flex-1 py-2.5 rounded-xl gradient-primary text-white text-xs font-bold"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Category Budget Modal */}
      <AnimatePresence>
        {showCatBudgetEdit && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
              onClick={() => setShowCatBudgetEdit(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-2xl"
            >
              <h3 className="text-base font-bold mb-1">
                {catMap.get(showCatBudgetEdit)?.name} Budget
              </h3>
              <p className="text-xs text-gray-400 mb-3">Set 0 to remove budget</p>
              <input
                type="number"
                placeholder="0"
                value={catBudgetInput}
                onChange={e => setCatBudgetInput(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-base font-bold outline-none focus:ring-2 focus:ring-indigo-500/30 mb-4"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCatBudgetEdit(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveCatBudget(showCatBudgetEdit)}
                  className="flex-1 py-2.5 rounded-xl gradient-primary text-white text-xs font-bold"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add / Edit Planned Item Modal */}
      <AddEditPlannedItemModal
        isOpen={isAddEditOpen}
        onClose={() => {
          setIsAddEditOpen(false);
          setEditingItem(null);
          setInitialDueDateForAdd(undefined);
        }}
        editItem={editingItem}
        initialDueDate={initialDueDateForAdd}
      />

      {/* Quick Add Prefilled to Mark as Paid */}
      <QuickAdd
        isOpen={!!quickAddPlannedItem}
        onClose={() => setQuickAddPlannedItem(null)}
        payPlannedItem={quickAddPlannedItem}
      />
    </div>
  );
}
