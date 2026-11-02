import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Play, Maximize2, Minimize2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatINR } from '../utils/money';
import { getCurrentMonth, getPreviousMonth, getCurrentWeek, getCurrentYear, formatMonthYear, formatDateShort, today } from '../utils/date';
import { calculateMetrics, generateInsightCards } from '../utils/insights';
import { getEffectiveExpensePaise } from '../utils/peopleLedger';
import { useSettings } from '../contexts/SettingsContext';
import DynamicIcon from '../components/ui/DynamicIcon';
import type { DateRange } from '../utils/date';

type PeriodChoice = 'week' | 'month' | 'last-month' | 'year';

export default function PresentScreen() {
  const { settings } = useSettings();
  const [periodChoice, setPeriodChoice] = useState<PeriodChoice | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [planText, setPlanText] = useState("What's your plan for next month?\n\n• \n• \n• ");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const range: DateRange | null = useMemo(() => {
    if (!periodChoice) return null;
    switch (periodChoice) {
      case 'week': return getCurrentWeek(settings.firstDayOfWeek);
      case 'month': return getCurrentMonth(settings.monthStartDay);
      case 'last-month': return getPreviousMonth(settings.monthStartDay);
      case 'year': return getCurrentYear();
    }
  }, [periodChoice, settings]);

  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const paymentMethods = useLiveQuery(() => db.paymentMethods.toArray()) ?? [];
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const pmMap = useMemo(() => new Map(paymentMethods.map(p => [p.id, p])), [paymentMethods]);

  const transactions = useLiveQuery(
    async () => {
      if (!range) return [];
      return db.transactions.where('date').between(range.from, range.to, true, true).toArray();
    },
    [range?.from, range?.to]
  ) ?? [];

  const prevRange = useMemo(() => periodChoice === 'month' ? getPreviousMonth(settings.monthStartDay) : null, [periodChoice, settings]);
  const prevTransactions = useLiveQuery(
    async () => {
      if (!prevRange) return [];
      return db.transactions.where('date').between(prevRange.from, prevRange.to, true, true).toArray();
    },
    [prevRange?.from, prevRange?.to]
  ) ?? [];

  const metrics = useMemo(
    () => range ? calculateMetrics(transactions, range, prevTransactions.length > 0 ? prevTransactions : undefined) : null,
    [transactions, range, prevTransactions]
  );

  const insightCards = useMemo(
    () => metrics && range ? generateInsightCards(metrics, categories, range, transactions) : [],
    [metrics, categories, range, transactions]
  );

  const topExpenses = useMemo(
    () => transactions.filter(t => t.type === 'expense').sort((a, b) => getEffectiveExpensePaise(b) - getEffectiveExpensePaise(a)).slice(0, 5),
    [transactions]
  );

  const totalSlides = 8;

  // Keyboard navigation
  useEffect(() => {
    if (!periodChoice) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setCurrentSlide(s => Math.min(s + 1, totalSlides - 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setCurrentSlide(s => Math.max(s - 1, 0)); }
      if (e.key === 'Escape') { setPeriodChoice(null); setCurrentSlide(0); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [periodChoice]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  const periodLabel = periodChoice === 'week' ? 'This Week' : periodChoice === 'month' ? formatMonthYear(today()) : periodChoice === 'last-month' ? 'Last Month' : 'This Year';

  // Period selector
  if (!periodChoice) {
    return (
      <div className="pb-8 px-4">
        <div className="pt-4 mb-6">
          <h1 className="text-xl font-bold">Present</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Auto-generate a slide deck from your spending</p>
        </div>
        <div className="space-y-3">
          {([['week', 'This Week', '📅'], ['month', 'This Month', '📊'], ['last-month', 'Last Month', '📈'], ['year', 'This Year', '🗓️']] as [PeriodChoice, string, string][]).map(([p, label, emoji]) => (
            <button key={p} onClick={() => { setPeriodChoice(p); setCurrentSlide(0); }}
              className="w-full bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all text-left flex items-center gap-4 group">
              <span className="text-3xl">{emoji}</span>
              <div className="flex-1">
                <p className="font-bold">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">Generate presentation</p>
              </div>
              <Play size={20} className="text-gray-300 group-hover:text-indigo-500 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics || !range) return null;

  const slideVariants = {
    enter: { opacity: 0, x: 100 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -100 },
  };

  const categoryChartData = metrics.byCategory.slice(0, 6).map(c => ({
    name: catMap.get(c.categoryId)?.name || '?',
    amount: c.amount / 100,
    pct: c.percentage,
    fill: catMap.get(c.categoryId)?.color || '#94A3B8',
  }));

  const dailyChartData = metrics.dailySpend.map(d => ({ date: formatDateShort(d.date), amount: d.amount / 100 }));
  const weekdayChartData = metrics.byWeekday.map(d => ({ day: d.dayName, amount: d.amount / 100 }));

  const slides = [
    // 0: Title
    <div key="title" className="present-slide gradient-dark text-white">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-lg">
        <p className="text-sm uppercase tracking-[0.3em] opacity-60 mb-6">Spending Report</p>
        <h1 className="text-4xl md:text-6xl font-bold mb-4">{periodLabel}</h1>
        <div className="text-5xl md:text-7xl font-bold mt-8 mb-6">{formatINR(metrics.totalSpent)}</div>
        <div className="flex items-center justify-center gap-8 text-sm opacity-70 mt-8">
          <div><span className="block text-2xl font-bold opacity-100">{metrics.transactionCount}</span>transactions</div>
          <div className="w-px h-10 bg-white/20" />
          <div><span className="block text-2xl font-bold opacity-100">{formatINR(metrics.averagePerDay)}</span>per day</div>
        </div>
        {metrics.comparison && (
          <p className={`mt-6 text-sm ${metrics.comparison.direction === 'up' ? 'text-red-300' : 'text-green-300'}`}>
            {metrics.comparison.direction === 'up' ? '↑' : '↓'} {metrics.comparison.changePercentage}% vs last period
          </p>
        )}
      </motion.div>
    </div>,

    // 1: Category Breakdown
    <div key="breakdown" className="present-slide bg-gray-950 text-white">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">Where the Money Went</h2>
        <div className="space-y-4">
          {categoryChartData.map(item => (
            <div key={item.name} className="flex items-center gap-4">
              <span className="text-sm w-28 md:w-36 text-right truncate opacity-70">{item.name}</span>
              <div className="flex-1 h-8 bg-white/10 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${item.pct}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full rounded-full flex items-center justify-end pr-3"
                  style={{ backgroundColor: item.fill }}>
                  {item.pct > 10 && <span className="text-xs font-bold">{item.pct}%</span>}
                </motion.div>
              </div>
              <span className="text-sm font-bold w-24 md:w-28">{formatINR(item.amount * 100)}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>,

    // 2: Trend
    <div key="trend" className="present-slide bg-gray-950 text-white">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">Spending Trend</h2>
        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyChartData}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} interval={Math.max(0, Math.floor(dailyChartData.length / 7) - 1)} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}`} width={50} />
              <Bar dataKey="amount" fill="#818CF8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>,

    // 3: Top 5 Expenses
    <div key="top5" className="present-slide bg-gray-950 text-white">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">Top 5 Expenses</h2>
        <div className="space-y-4">
          {topExpenses.map((txn, i) => {
            const cat = catMap.get(txn.categoryId);
            return (
              <motion.div key={txn.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-4 bg-white/5 rounded-2xl p-4">
                <span className="text-2xl font-bold opacity-30 w-8">#{i + 1}</span>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: (cat?.color || '#94A3B8') + '30' }}>
                  <DynamicIcon name={cat?.icon || 'HelpCircle'} size={20} style={{ color: cat?.color || '#94A3B8' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{cat?.name || 'Unknown'}</p>
                  {txn.note && <p className="text-sm opacity-60 truncate">{txn.note}</p>}
                </div>
                <span className="text-lg font-bold">{formatINR(getEffectiveExpensePaise(txn))}</span>
              </motion.div>
            );
          })}
          {topExpenses.length === 0 && <p className="text-center opacity-50">No expenses in this period</p>}
        </div>
      </motion.div>
    </div>,

    // 4: Patterns
    <div key="patterns" className="present-slide bg-gray-950 text-white">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">Spending Patterns</h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-sm font-semibold opacity-60 mb-4 text-center">By Day of Week</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayChartData}>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}`} width={45} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {weekdayChartData.map((_, i) => <Cell key={i} fill={i === 0 || i === 6 ? '#F97316' : '#818CF8'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold opacity-60 mb-4 text-center">By Payment Method</h3>
            <div className="space-y-3">
              {metrics.byPaymentMethod.slice(0, 5).map(p => (
                <div key={p.paymentMethodId} className="flex items-center gap-3">
                  <span className="text-sm flex-1 opacity-70">{pmMap.get(p.paymentMethodId)?.name || '?'}</span>
                  <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${p.percentage}%` }} />
                  </div>
                  <span className="text-sm font-bold w-12 text-right">{p.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>,

    // 5: Budget Performance
    <div key="budget" className="present-slide bg-gray-950 text-white">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-10">Budget Performance</h2>
        {settings.monthlyBudget ? (
          <>
            <div className="mb-8">
              <div className="text-5xl font-bold mb-2">{formatINR(metrics.totalSpent)}</div>
              <div className="text-sm opacity-60">of {formatINR(settings.monthlyBudget)} budget</div>
            </div>
            <div className="h-4 bg-white/10 rounded-full overflow-hidden max-w-md mx-auto mb-4">
              <motion.div initial={{ width: 0 }}
                animate={{ width: `${Math.min(Math.round(metrics.totalSpent / settings.monthlyBudget * 100), 100)}%` }}
                transition={{ duration: 1 }}
                className={`h-full rounded-full ${
                  metrics.totalSpent > settings.monthlyBudget ? 'bg-red-500' :
                  metrics.totalSpent > settings.monthlyBudget * 0.7 ? 'bg-amber-500' : 'bg-emerald-500'
                }`} />
            </div>
            <p className="text-lg">
              {metrics.totalSpent > settings.monthlyBudget
                ? `Over budget by ${formatINR(metrics.totalSpent - settings.monthlyBudget)}`
                : `${formatINR(settings.monthlyBudget - metrics.totalSpent)} remaining`}
            </p>
          </>
        ) : (
          <p className="text-lg opacity-50">No budget was set for this period</p>
        )}
      </motion.div>
    </div>,

    // 6: Key Takeaways
    <div key="takeaways" className="present-slide bg-gray-950 text-white">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">Key Takeaways</h2>
        <div className="space-y-4">
          {insightCards.slice(0, 5).map((card, i) => (
            <motion.div key={card.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15 }}
              className="flex items-start gap-4 bg-white/5 rounded-2xl p-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <DynamicIcon name={card.icon || 'Lightbulb'} size={16} className="text-indigo-400" />
              </div>
              <p className="text-sm leading-relaxed">{card.message}</p>
            </motion.div>
          ))}
          {insightCards.length === 0 && (
            <p className="text-center opacity-50">Not enough data to generate insights yet</p>
          )}
        </div>
      </motion.div>
    </div>,

    // 7: Plan
    <div key="plan" className="present-slide gradient-dark text-white">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-8">Next Period Plan</h2>
        <textarea
          value={planText} onChange={e => setPlanText(e.target.value)}
          className="w-full h-48 bg-white/10 rounded-2xl p-5 text-white placeholder-white/30 text-sm outline-none resize-none focus:ring-2 focus:ring-white/20"
          placeholder="Write your goals here..."
        />
        <p className="text-xs opacity-40 mt-4">This is for you — plan your spending for the next period</p>
      </motion.div>
    </div>,
  ];

  return (
    <div className="fixed inset-0 z-40 bg-gray-950">
      {/* Controls */}
      <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between">
        <button onClick={() => { setPeriodChoice(null); setCurrentSlide(0); document.exitFullscreen?.().catch(() => {}); }}
          className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
          <X size={20} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-white/60 text-sm">{currentSlide + 1} / {totalSlides}</span>
          <button onClick={toggleFullscreen}
            className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Slide content */}
      <AnimatePresence mode="wait">
        <motion.div key={currentSlide} variants={slideVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.3 }} className="h-full">
          {slides[currentSlide]}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4 z-50">
        <button onClick={() => setCurrentSlide(s => Math.max(s - 1, 0))}
          disabled={currentSlide === 0}
          className="p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-30">
          <ChevronLeft size={20} />
        </button>

        {/* Progress dots */}
        <div className="flex gap-1.5">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button key={i} onClick={() => setCurrentSlide(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentSlide ? 'w-6 bg-white' : 'w-1.5 bg-white/30'
              }`} />
          ))}
        </div>

        <button onClick={() => setCurrentSlide(s => Math.min(s + 1, totalSlides - 1))}
          disabled={currentSlide === totalSlides - 1}
          className="p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-30">
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}

