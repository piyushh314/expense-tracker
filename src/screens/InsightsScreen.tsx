import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, BarChart3, PieChart as PieChartIcon, Calendar, Lightbulb, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatINR } from '../utils/money';
import { getCurrentMonth, getPreviousMonth, getCurrentWeek, getCurrentYear, formatDateShort } from '../utils/date';
import { calculateMetrics, generateInsightCards } from '../utils/insights';
import { useSettings } from '../contexts/SettingsContext';
import DynamicIcon from '../components/ui/DynamicIcon';
import type { DateRange } from '../utils/date';

type Period = 'week' | 'month' | 'last-month' | 'year';

export default function InsightsScreen() {
  const { settings } = useSettings();
  const [period, setPeriod] = useState<Period>('month');
  const [dismissedCards, setDismissedCards] = useState<Set<string>>(new Set());

  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray()) ?? [];

  const range: DateRange = useMemo(() => {
    switch (period) {
      case 'week': return getCurrentWeek(settings.firstDayOfWeek);
      case 'month': return getCurrentMonth(settings.monthStartDay);
      case 'last-month': return getPreviousMonth(settings.monthStartDay);
      case 'year': return getCurrentYear();
    }
  }, [period, settings]);

  const prevRange = useMemo(() => {
    if (period === 'month') return getPreviousMonth(settings.monthStartDay);
    return null;
  }, [period, settings]);

  const transactions = useLiveQuery(
    () => db.transactions.where('date').between(range.from, range.to, true, true).toArray(),
    [range.from, range.to]
  ) ?? [];

  const prevTransactions = useLiveQuery(
    async () => {
      if (!prevRange) return [];
      return db.transactions.where('date').between(prevRange.from, prevRange.to, true, true).toArray();
    },
    [prevRange?.from, prevRange?.to]
  ) ?? [];

  const metrics = useMemo(
    () => calculateMetrics(transactions, range, prevTransactions.length > 0 ? prevTransactions : undefined),
    [transactions, range, prevTransactions]
  );

  const prevMetrics = useMemo(
    () => prevRange ? calculateMetrics(prevTransactions, prevRange) : undefined,
    [prevTransactions, prevRange]
  );

  const insightCards = useMemo(
    () => generateInsightCards(metrics, categories, range, transactions, prevMetrics).filter(c => !dismissedCards.has(c.id)),
    [metrics, categories, range, transactions, prevMetrics, dismissedCards]
  );

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const pmMap = useMemo(() => new Map(paymentMethods.map(p => [p.id, p])), [paymentMethods]);

  if (transactions.length === 0) {
    return (
      <div className="text-center py-20 px-4">
        <div className="text-5xl mb-4">📊</div>
        <h3 className="text-lg font-bold mb-2">No data yet</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Start logging expenses to see insights here</p>
      </div>
    );
  }

  const chartColors = ['#6366F1', '#F97316', '#22C55E', '#EC4899', '#3B82F6', '#EAB308', '#8B5CF6', '#EF4444', '#14B8A6', '#F43F5E'];

  // Prepare chart data
  const categoryChartData = metrics.byCategory.slice(0, 8).map(c => {
    const cat = catMap.get(c.categoryId);
    return { name: cat?.name || '?', amount: c.amount / 100, paise: c.amount, pct: c.percentage, fill: cat?.color || '#94A3B8' };
  });

  const dailyChartData = metrics.dailySpend.map(d => ({
    date: formatDateShort(d.date),
    amount: d.amount / 100,
  }));

  const weekdayChartData = metrics.byWeekday.map(d => ({
    day: d.dayName,
    amount: d.amount / 100,
  }));

  const pmChartData = metrics.byPaymentMethod.map((p, i) => ({
    name: pmMap.get(p.paymentMethodId)?.name || '?',
    value: p.amount / 100,
    pct: p.percentage,
    fill: chartColors[i % chartColors.length],
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 px-3 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 text-xs">
          <p className="font-semibold">{label}</p>
          <p className="text-indigo-500">₹{payload[0].value.toLocaleString('en-IN')}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="pb-8 px-4 space-y-4">
      {/* Period picker */}
      <div className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm py-4 -mx-4 px-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {([['week', 'This Week'], ['month', 'This Month'], ['last-month', 'Last Month'], ['year', 'This Year']] as [Period, string][]).map(([p, label]) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                period === p ? 'bg-indigo-500 text-white shadow-md' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Spent</p>
          <p className="text-xl font-bold mt-1">{formatINR(metrics.totalSpent)}</p>
          {metrics.comparison && (
            <div className={`flex items-center gap-1 mt-1 text-xs font-semibold ${
              metrics.comparison.direction === 'up' ? 'text-red-500' : metrics.comparison.direction === 'down' ? 'text-green-500' : 'text-gray-400'
            }`}>
              {metrics.comparison.direction === 'up' ? <TrendingUp size={12} /> : metrics.comparison.direction === 'down' ? <TrendingDown size={12} /> : <Minus size={12} />}
              {metrics.comparison.changePercentage}% vs last
            </div>
          )}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Avg / Day</p>
          <p className="text-xl font-bold mt-1">{formatINR(metrics.averagePerDay)}</p>
          <p className="text-xs text-gray-400 mt-1">{metrics.transactionCount} transactions</p>
        </div>
        {metrics.biggestExpense && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Biggest Expense</p>
            <p className="text-xl font-bold mt-1">{formatINR(metrics.biggestExpense.amount)}</p>
            <p className="text-xs text-gray-400 mt-1 truncate">{catMap.get(metrics.biggestExpense.categoryId)?.name}</p>
          </div>
        )}
        {metrics.topCategory && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Top Category</p>
            <p className="text-lg font-bold mt-1">{catMap.get(metrics.topCategory.categoryId)?.name}</p>
            <p className="text-xs text-gray-400 mt-1">{metrics.topCategory.percentage}% of spending</p>
          </div>
        )}
      </div>

      {/* Category breakdown */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-indigo-500" /> Where the Money Went
        </h3>
        <div className="space-y-3">
          {categoryChartData.map(item => {
            const cat = categories.find(c => c.name === item.name);
            return (
              <div key={item.name} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: item.fill + '15' }}>
                  <DynamicIcon name={cat?.icon || 'HelpCircle'} size={16} style={{ color: item.fill }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold truncate">{item.name}</span>
                    <span className="text-xs font-bold text-gray-500">{item.pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${item.pct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full" style={{ backgroundColor: item.fill }}
                    />
                  </div>
                </div>
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 shrink-0 w-20 text-right">
                  {formatINR(item.paise)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Spend over time */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-indigo-500" /> Spend Over Time
        </h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200, #E5E7EB)" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(dailyChartData.length / 7) - 1)} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}`} width={45} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" fill="#6366F1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekday pattern */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-indigo-500" /> Weekday Pattern
        </h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayChartData}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}`} width={45} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {weekdayChartData.map((_, i) => (
                  <Cell key={i} fill={i === 0 || i === 6 ? '#F97316' : '#6366F1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Payment method split */}
      {pmChartData.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <PieChartIcon size={16} className="text-indigo-500" /> Payment Methods
          </h3>
          <div className="flex items-center gap-4">
            <div className="w-32 h-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pmChartData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" stroke="none">
                    {pmChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {pmChartData.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="font-semibold">{item.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Smart insight cards */}
      {insightCards.length > 0 && (
        <div>
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Lightbulb size={16} className="text-amber-500" /> Insights
          </h3>
          <div className="space-y-2">
            {insightCards.map(card => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/50 dark:to-purple-950/50 rounded-2xl p-4 border border-indigo-100 dark:border-indigo-900 flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center shrink-0 mt-0.5">
                  <DynamicIcon name={card.icon || 'Lightbulb'} size={16} className="text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-0.5">{card.title}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{card.message}</p>
                </div>
                <button onClick={() => setDismissedCards(prev => new Set(prev).add(card.id))}
                  className="text-gray-400 hover:text-gray-600 shrink-0 p-1">
                  <X size={14} />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

