import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, Wallet, ShieldCheck, Users, X, AlertCircle } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatINR } from '../utils/money';
import { getCurrentMonth, getDaysRemaining, formatMonthYear, today } from '../utils/date';
import { getEffectiveExpensePaise, getPersonInitials } from '../utils/peopleLedger';
import { calculateMonthForecast } from '../utils/planForecast';
import { usePeopleLedgerSummary } from '../hooks/useDatabase';
import { useSettings } from '../contexts/SettingsContext';
import DynamicIcon from '../components/ui/DynamicIcon';
import SettleSheet from '../components/people/SettleSheet';
import ReminderSheet from '../components/people/ReminderSheet';
import type { Transaction, Person } from '../types';

interface HomeScreenProps {
  onNavigate: (screen: string) => void;
  onAddNew: () => void;
  onEditTransaction: (transaction: Transaction) => void;
}

export default function HomeScreen({ onNavigate, onAddNew, onEditTransaction }: HomeScreenProps) {
  const { settings } = useSettings();
  const range = getCurrentMonth(settings.monthStartDay);
  const daysLeft = getDaysRemaining(range);

  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray()) ?? [];
  const pmMap = useMemo(() => new Map(paymentMethods.map(p => [p.id, p])), [paymentMethods]);

  const monthTxns = useLiveQuery(
    () => db.transactions.where('date').between(range.from, range.to, true, true).toArray(),
    [range.from, range.to]
  ) ?? [];

  const plannedItems = useLiveQuery(() => db.plannedItems.toArray()) ?? [];

  const recentTxns = useLiveQuery(
    () => db.transactions.orderBy('createdAt').reverse().limit(5).toArray()
  ) ?? [];

  const totalSpent = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + getEffectiveExpensePaise(t), 0);
  const totalIncome = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const budgetAmount = settings.monthlyBudget || 0;
  const budgetPct = budgetAmount > 0 ? Math.round((totalSpent / budgetAmount) * 100) : 0;

  // New Forecast & Safe-to-Spend formula
  const forecast = useMemo(() => {
    const startD = new Date(range.from + 'T00:00:00');
    const todayD = new Date(today() + 'T00:00:00');
    const diffTime = todayD.getTime() - startD.getTime();
    const daysElapsed = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);

    return calculateMonthForecast({
      monthlyBudgetPaise: settings.monthlyBudget || 0,
      spentSoFarPaise: totalSpent,
      plannedItems,
      currentMonthRange: range,
      daysElapsedSoFar: daysElapsed,
      daysLeftInMonth: daysLeft,
      startingBalancePaise: settings.startingBalance,
      monthlyIncomePaise: settings.monthlyIncome,
    });
  }, [
    settings.monthlyBudget,
    settings.startingBalance,
    settings.monthlyIncome,
    totalSpent,
    plannedItems,
    range,
    daysLeft,
  ]);

  const safePerDay = forecast.safeToSpendPerDayPaise;

  const topCategory = useMemo(() => {
    const totals = new Map<string, number>();
    monthTxns.filter(t => t.type === 'expense').forEach(t => {
      totals.set(t.categoryId, (totals.get(t.categoryId) || 0) + getEffectiveExpensePaise(t));
    });
    let maxId = '';
    let maxAmt = 0;
    totals.forEach((amt, id) => { if (amt > maxAmt) { maxAmt = amt; maxId = id; } });
    if (!maxId) return null;
    const cat = catMap.get(maxId);
    return cat ? { name: cat.name, amount: maxAmt, pct: totalSpent > 0 ? Math.round(maxAmt / totalSpent * 100) : 0, icon: cat.icon, color: cat.color } : null;
  }, [monthTxns, catMap, totalSpent]);

  const peopleSummary = usePeopleLedgerSummary();
  const [dismissedReminderPersonId, setDismissedReminderPersonId] = useState<string | null>(null);
  const [settlePerson, setSettlePerson] = useState<Person | null>(null);
  const [reminderPerson, setReminderPerson] = useState<Person | null>(null);

  // Active top reminder: first unsettled person who isn't dismissed
  const activeReminder = useMemo(() => {
    return peopleSummary.unsettledPeople.find(u => {
      if (u.person.id === dismissedReminderPersonId) return false;
      if (u.netPaise < 0 && settings.remindersForDebtsIOwe === false) return false;
      return true;
    }) || null;
  }, [peopleSummary.unsettledPeople, dismissedReminderPersonId, settings.remindersForDebtsIOwe]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="pb-8 px-4 space-y-4">
      {/* Header */}
      <div className="pt-4">
        <h1 className="text-xl font-bold">{greeting} 👋</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{formatMonthYear(today())}</p>
      </div>

      {/* Top In-App Reminder Card (e.g. "Rohit owes you 340 for 12 days") */}
      {activeReminder && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 dark:from-amber-500/20 dark:via-orange-500/20 dark:to-amber-500/20 rounded-2xl border border-amber-200/80 dark:border-amber-800/80 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2.5">
            <div
              className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
              onClick={() => onNavigate('people')}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm"
                style={{ backgroundColor: activeReminder.person.color }}
              >
                {getPersonInitials(activeReminder.person.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-amber-950 dark:text-amber-100 truncate">
                  {activeReminder.netPaise > 0
                    ? `${activeReminder.person.name} owes you ${formatINR(activeReminder.netPaise)}`
                    : `You owe ${activeReminder.person.name} ${formatINR(Math.abs(activeReminder.netPaise))}`}
                </p>
                <p className="text-[11px] text-amber-700/90 dark:text-amber-300 font-medium mt-0.5">
                  {activeReminder.oldestUnsettledDays !== null
                    ? `for ${activeReminder.oldestUnsettledDays} days`
                    : 'Unsettled balance'}
                  {peopleSummary.unsettledPeople.length > 1 && (
                    <span className="opacity-75"> · +{peopleSummary.unsettledPeople.length - 1} more</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setReminderPerson(activeReminder.person)}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-gray-800 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/60 text-xs font-bold transition-all active:scale-95 shadow-sm"
              >
                Remind
              </button>
              <button
                onClick={() => setSettlePerson(activeReminder.person)}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition-all active:scale-95"
              >
                Settle
              </button>
              <button
                onClick={() => setDismissedReminderPersonId(activeReminder.person.id)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                title="Dismiss reminder"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Monthly Summary Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="gradient-primary rounded-3xl p-5 text-white shadow-xl shadow-indigo-500/20"
      >
        <p className="text-sm opacity-80 font-medium">Spent this month</p>
        <p className="text-3xl font-bold mt-1">{formatINR(totalSpent)}</p>

        {budgetAmount > 0 && (
          <>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="opacity-80">Budget: {formatINR(budgetAmount)}</span>
              <span className="font-bold">{budgetPct}%</span>
            </div>
            <div className="mt-2 h-2.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }} animate={{ width: `${Math.min(budgetPct, 100)}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className={`h-full rounded-full ${
                  budgetPct > 100 ? 'bg-red-400' : budgetPct > 70 ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
              />
            </div>
            <div className="mt-2 space-y-0.5">
              <p className="text-sm">
                <span className="opacity-80">Safe to spend: </span>
                <span className="font-bold">{formatINR(safePerDay)}/day</span>
                <span className="opacity-60 ml-1">({daysLeft} days left)</span>
              </p>
              {forecast.unpaidPlannedExpensesThisMonthPaise > 0 && (
                <p className="text-xs text-white/80">
                  Includes {formatINR(forecast.unpaidPlannedExpensesThisMonthPaise)} in upcoming bills
                </p>
              )}
              {forecast.expectedIncomeThisMonthPaise + forecast.expectedRepaymentsThisMonthPaise > 0 && (
                <p className="text-xs text-emerald-200">
                  If received: +{formatINR(forecast.expectedIncomeThisMonthPaise + forecast.expectedRepaymentsThisMonthPaise)}
                </p>
              )}
            </div>

            {/* Month-End Projection Range */}
            <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between text-xs">
              <span className="opacity-80">Month-end projection:</span>
              <span className="font-bold">
                {formatINR(forecast.projectionRangePaise.low)} – {formatINR(forecast.projectionRangePaise.high)}
              </span>
            </div>

            {/* Deficit / Leftover Warning */}
            {forecast.isDeficit && forecast.projectedLeftoverPaise !== null ? (
              <div className="mt-2.5 p-2 rounded-xl bg-red-500/30 border border-red-300/40 text-xs flex items-center gap-1.5 font-medium">
                <AlertCircle size={14} className="shrink-0 text-red-200" />
                <span>Projected deficit: ~{formatINR(Math.abs(forecast.projectedLeftoverPaise))} short this month</span>
              </div>
            ) : forecast.projectedLeftoverPaise !== null ? (
              <p className="text-xs text-white/80 mt-1">
                Projected leftover: <span className="font-bold">{formatINR(forecast.projectedLeftoverPaise)}</span>
              </p>
            ) : null}
          </>
        )}

        {budgetAmount === 0 && (
          <button onClick={() => onNavigate('plan')} className="mt-3 text-sm opacity-80 underline underline-offset-4">
            Set a monthly budget in Plan →
          </button>
        )}
      </motion.div>

      {/* People Summary Strip (shown if any balance != 0) */}
      {(peopleSummary.totalOwedToMe > 0 || peopleSummary.totalIOwe > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onNavigate('people')}
          className="bg-white dark:bg-gray-900 rounded-2xl p-3.5 border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between cursor-pointer hover:border-gray-200 dark:hover:border-gray-700 transition-all active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
              <Users size={18} />
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold flex-wrap">
              {peopleSummary.totalOwedToMe > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  You are owed <span className="font-bold">{formatINR(peopleSummary.totalOwedToMe)}</span>
                </span>
              )}
              {peopleSummary.totalOwedToMe > 0 && peopleSummary.totalIOwe > 0 && (
                <span className="text-gray-300 dark:text-gray-700">·</span>
              )}
              {peopleSummary.totalIOwe > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  You owe <span className="font-bold">{formatINR(peopleSummary.totalIOwe)}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-gray-400 dark:text-gray-500 shrink-0 ml-2">
            <span>People</span>
            <ArrowRight size={14} />
          </div>
        </motion.div>
      )}

      {/* Income vs Expenses (if income exists) */}
      {totalIncome > 0 && (
        <div className="flex gap-3">
          <div className="flex-1 bg-green-50 dark:bg-green-950/30 rounded-2xl p-4 border border-green-100 dark:border-green-900">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <TrendingUp size={16} />
              <span className="text-xs font-semibold">Income</span>
            </div>
            <p className="text-lg font-bold text-green-700 dark:text-green-300 mt-1">{formatINR(totalIncome)}</p>
          </div>
          <div className="flex-1 bg-orange-50 dark:bg-orange-950/30 rounded-2xl p-4 border border-orange-100 dark:border-orange-900">
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <Wallet size={16} />
              <span className="text-xs font-semibold">Savings</span>
            </div>
            <p className={`text-lg font-bold mt-1 ${totalIncome - totalSpent >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>
              {formatINR(totalIncome - totalSpent)}
            </p>
          </div>
        </div>
      )}

      {/* Quick Insight Card */}
      {topCategory && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-2xl p-4 border border-amber-100 dark:border-amber-900 flex items-center gap-3 cursor-pointer"
          onClick={() => onNavigate('insights')}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: topCategory.color + '20' }}>
            <DynamicIcon name={topCategory.icon} size={20} style={{ color: topCategory.color }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {topCategory.name} is {topCategory.pct}% of your spending
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatINR(topCategory.amount)} this month</p>
          </div>
          <ArrowRight size={16} className="text-gray-400" />
        </motion.div>
      )}

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold">Recent Transactions</h2>
          <button onClick={() => onNavigate('transactions')} className="text-xs text-indigo-500 font-semibold flex items-center gap-1">
            See all <ArrowRight size={12} />
          </button>
        </div>

        {recentTxns.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white dark:bg-gray-900 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-800"
          >
            <div className="text-4xl mb-3">💰</div>
            <h3 className="font-bold mb-1">Start tracking!</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Tap + to add your first expense
            </p>
            <button onClick={onAddNew}
              className="px-6 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 transition-colors">
              Add Expense
            </button>
          </motion.div>
        ) : (
          <div className="space-y-1.5">
            {recentTxns.map(txn => {
              const cat = catMap.get(txn.categoryId);
              const pm = pmMap.get(txn.paymentMethodId);
              return (
                <motion.div
                  key={txn.id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  className="bg-white dark:bg-gray-900 rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-all"
                  onClick={() => onEditTransaction(txn)}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: (cat?.color || '#94A3B8') + '15' }}>
                    <DynamicIcon name={cat?.icon || 'HelpCircle'} size={20} style={{ color: cat?.color || '#94A3B8' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">{cat?.name || 'Unknown'}</p>
                      {pm && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium shrink-0">
                          {pm.name}
                        </span>
                      )}
                    </div>
                    {txn.note && <p className="text-xs text-gray-500 truncate">{txn.note}</p>}
                    {txn.type === 'expense' && txn.splitMode && txn.splitMode !== 'none' && (
                      <span className="text-[10px] text-indigo-500 font-medium">
                        Split · Total {formatINR(txn.amount)}
                      </span>
                    )}
                  </div>
                  <span className={`text-sm font-bold ${txn.type === 'income' ? 'text-green-500' : ''}`}>
                    {txn.type === 'income' ? '+' : '-'}{formatINR(txn.type === 'expense' ? getEffectiveExpensePaise(txn) : txn.amount)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Privacy note */}
      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-600 px-2 pt-4">
        <ShieldCheck size={14} />
        <span>Your data stays on this device</span>
      </div>

      {/* Quick Settle Sheet from Reminder Card */}
      {settlePerson && (
        <SettleSheet
          isOpen={settlePerson !== null}
          onClose={() => setSettlePerson(null)}
          person={settlePerson}
          netPaise={peopleSummary.balances.get(settlePerson.id)?.netPaise ?? 0}
        />
      )}

      {/* Reminder & Calendar Sheet from Reminder Card */}
      {reminderPerson && (
        <ReminderSheet
          isOpen={reminderPerson !== null}
          onClose={() => setReminderPerson(null)}
          person={reminderPerson}
          netPaise={peopleSummary.balances.get(reminderPerson.id)?.netPaise ?? 0}
          onSettleRequested={() => {
            const p = reminderPerson;
            setReminderPerson(null);
            setSettlePerson(p);
          }}
        />
      )}
    </div>
  );
}
