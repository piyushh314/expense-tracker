import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Pencil } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatINR, toPaise, toRupees } from '../utils/money';
import { getCurrentMonth, getDaysRemaining, formatMonthYear, today } from '../utils/date';
import { getEffectiveExpensePaise } from '../utils/peopleLedger';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';
import DynamicIcon from '../components/ui/DynamicIcon';
import type { Budget } from '../types';

export default function BudgetsScreen() {
  const { settings, updateSettings } = useSettings();
  const { showToast } = useToast();
  const range = getCurrentMonth(settings.monthStartDay);
  const period = range.from.slice(0, 7); // YYYY-MM
  const daysLeft = getDaysRemaining(range);

  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').and(c => !c.archived).sortBy('order')) ?? [];
  const budgets = useLiveQuery(() => db.budgets.where('period').equals(period).toArray(), [period]) ?? [];
  const monthTxns = useLiveQuery(
    () => db.transactions.where('date').between(range.from, range.to, true, true).toArray(),
    [range.from, range.to]
  ) ?? [];

  const totalSpent = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + getEffectiveExpensePaise(t), 0);
  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>();
    monthTxns.filter(t => t.type === 'expense').forEach(t => m.set(t.categoryId, (m.get(t.categoryId) || 0) + getEffectiveExpensePaise(t)));
    return m;
  }, [monthTxns]);

  const overallBudget = settings.monthlyBudget || 0;
  const overallPct = overallBudget > 0 ? Math.round((totalSpent / overallBudget) * 100) : 0;
  const safePerDay = overallBudget > 0 && daysLeft > 0 ? Math.max(0, Math.round((overallBudget - totalSpent) / daysLeft)) : 0;

  const [showOverallEdit, setShowOverallEdit] = useState(false);
  const [overallInput, setOverallInput] = useState('');
  const [showCatBudgetEdit, setShowCatBudgetEdit] = useState<string | null>(null);
  const [catBudgetInput, setCatBudgetInput] = useState('');

  const budgetMap = useMemo(() => new Map(budgets.map(b => [b.categoryId, b])), [budgets]);

  const getBudgetColor = (pct: number) => {
    if (pct > 100) return { bg: 'bg-red-500', text: 'text-red-500', label: 'Over budget' };
    if (pct > 70) return { bg: 'bg-amber-500', text: 'text-amber-500', label: 'Watch out' };
    return { bg: 'bg-emerald-500', text: 'text-emerald-500', label: 'On track' };
  };

  const handleSaveOverall = () => {
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

  const overallColor = getBudgetColor(overallPct);

  return (
    <div className="pb-8 px-4 space-y-4">
      <div className="pt-4">
        <h1 className="text-xl font-bold">Budgets</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{formatMonthYear(today())} · {daysLeft} days left</p>
      </div>

      {/* Overall Budget Card */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-indigo-500" />
            <h2 className="text-sm font-bold">Monthly Budget</h2>
          </div>
          <button onClick={() => { setOverallInput(overallBudget > 0 ? String(toRupees(overallBudget)) : ''); setShowOverallEdit(true); }}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <Pencil size={14} className="text-gray-400" />
          </button>
        </div>

        {overallBudget > 0 ? (
          <>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold">{formatINR(totalSpent)}</span>
              <span className="text-sm text-gray-500 mb-0.5">/ {formatINR(overallBudget)}</span>
            </div>

            <div className="mt-3 h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }} animate={{ width: `${Math.min(overallPct, 100)}%` }}
                transition={{ duration: 0.8 }}
                className={`h-full rounded-full ${overallColor.bg}`}
              />
            </div>

            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs font-semibold ${overallColor.text}`}>{overallColor.label} · {overallPct}%</span>
              {safePerDay > 0 && (
                <span className="text-xs text-gray-500">Safe: {formatINR(safePerDay)}/day</span>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No budget set yet</p>
            <button onClick={() => { setOverallInput(''); setShowOverallEdit(true); }}
              className="px-5 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 transition-colors">
              Set Budget
            </button>
          </div>
        )}
      </div>

      {/* Category Budgets */}
      <div>
        <h2 className="text-sm font-bold mb-3">Category Budgets</h2>
        <div className="space-y-2">
          {categories.map(cat => {
            const budget = budgetMap.get(cat.id);
            const spent = spentByCategory.get(cat.id) || 0;
            const budgetAmt = budget?.amount || 0;
            const pct = budgetAmt > 0 ? Math.round((spent / budgetAmt) * 100) : 0;
            const color = getBudgetColor(pct);

            return (
              <div key={cat.id}
                className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 cursor-pointer hover:border-gray-200 dark:hover:border-gray-700 transition-all"
                onClick={() => {
                  setCatBudgetInput(budgetAmt > 0 ? String(toRupees(budgetAmt)) : '');
                  setShowCatBudgetEdit(cat.id);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: cat.color + '15' }}>
                    <DynamicIcon name={cat.icon} size={16} style={{ color: cat.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold truncate">{cat.name}</span>
                      <span className="text-sm font-bold shrink-0">{formatINR(spent)}</span>
                    </div>
                    {budgetAmt > 0 ? (
                      <>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-xs text-gray-400">of {formatINR(budgetAmt)}</span>
                          <span className={`text-xs font-semibold ${color.text}`}>{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${color.bg} transition-all duration-500`}
                            style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5">No budget set</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall Budget Edit Modal */}
      <AnimatePresence>
        {showOverallEdit && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setShowOverallEdit(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-2xl">
              <h3 className="text-lg font-bold mb-4">Set Monthly Budget</h3>
              <div className="relative mb-4">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                <input type="number" value={overallInput} onChange={e => setOverallInput(e.target.value)}
                  placeholder="15000" autoFocus
                  className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-lg font-bold outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowOverallEdit(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold">Cancel</button>
                <button onClick={handleSaveOverall}
                  className="flex-1 py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600">Save</button>
              </div>
              {overallBudget > 0 && (
                <button onClick={() => { updateSettings({ monthlyBudget: null }); setShowOverallEdit(false); showToast('Budget removed'); }}
                  className="w-full mt-2 py-2 text-xs text-red-500 font-semibold">Remove Budget</button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Category Budget Edit Modal */}
      <AnimatePresence>
        {showCatBudgetEdit && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setShowCatBudgetEdit(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-2xl">
              <h3 className="text-lg font-bold mb-1">Category Budget</h3>
              <p className="text-sm text-gray-500 mb-4">{categories.find(c => c.id === showCatBudgetEdit)?.name}</p>
              <div className="relative mb-4">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                <input type="number" value={catBudgetInput} onChange={e => setCatBudgetInput(e.target.value)}
                  placeholder="5000" autoFocus
                  className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-lg font-bold outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCatBudgetEdit(null)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold">Cancel</button>
                <button onClick={() => handleSaveCatBudget(showCatBudgetEdit)}
                  className="flex-1 py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600">Save</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

