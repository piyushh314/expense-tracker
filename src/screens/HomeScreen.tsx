import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, Wallet, ShieldCheck } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatINR } from '../utils/money';
import { getCurrentMonth, getDaysRemaining, formatMonthYear, today } from '../utils/date';
import { useSettings } from '../contexts/SettingsContext';
import DynamicIcon from '../components/ui/DynamicIcon';
import type { Transaction } from '../types';

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

  const recentTxns = useLiveQuery(
    () => db.transactions.orderBy('createdAt').reverse().limit(5).toArray()
  ) ?? [];

  const totalSpent = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalIncome = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const budgetAmount = settings.monthlyBudget || 0;
  const budgetPct = budgetAmount > 0 ? Math.round((totalSpent / budgetAmount) * 100) : 0;
  const safePerDay = budgetAmount > 0 && daysLeft > 0
    ? Math.max(0, Math.round((budgetAmount - totalSpent) / daysLeft))
    : 0;

  const topCategory = useMemo(() => {
    const totals = new Map<string, number>();
    monthTxns.filter(t => t.type === 'expense').forEach(t => {
      totals.set(t.categoryId, (totals.get(t.categoryId) || 0) + t.amount);
    });
    let maxId = '';
    let maxAmt = 0;
    totals.forEach((amt, id) => { if (amt > maxAmt) { maxAmt = amt; maxId = id; } });
    if (!maxId) return null;
    const cat = catMap.get(maxId);
    return cat ? { name: cat.name, amount: maxAmt, pct: totalSpent > 0 ? Math.round(maxAmt / totalSpent * 100) : 0, icon: cat.icon, color: cat.color } : null;
  }, [monthTxns, catMap, totalSpent]);

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
            {safePerDay > 0 && (
              <p className="mt-2 text-sm">
                <span className="opacity-80">Safe to spend: </span>
                <span className="font-bold">{formatINR(safePerDay)}/day</span>
                <span className="opacity-60 ml-1">({daysLeft} days left)</span>
              </p>
            )}
          </>
        )}

        {budgetAmount === 0 && (
          <button onClick={() => onNavigate('budgets')} className="mt-3 text-sm opacity-80 underline underline-offset-4">
            Set a monthly budget →
          </button>
        )}
      </motion.div>

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
                  </div>
                  <span className={`text-sm font-bold ${txn.type === 'income' ? 'text-green-500' : ''}`}>
                    {txn.type === 'income' ? '+' : '-'}{formatINR(txn.amount)}
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
    </div>
  );
}
