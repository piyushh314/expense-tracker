import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { formatINR, toPaise } from '../../utils/money';
import { calculateAffordability, type MonthForecast } from '../../utils/planForecast';
import type { PlannedItemKind } from '../../types';

interface CanIAffordThisProps {
  forecast: MonthForecast;
  onAddToPlan?: (params: { amountPaise: number; title: string; kind: PlannedItemKind }) => void;
  compact?: boolean;
}

export default function CanIAffordThis({
  forecast,
  onAddToPlan,
  compact = false,
}: CanIAffordThisProps) {
  const [amountStr, setAmountStr] = useState('');
  const [titleStr, setTitleStr] = useState('');
  const [isExpanded, setIsExpanded] = useState(!compact);

  const amountPaise = useMemo(() => {
    const val = parseFloat(amountStr);
    return !isNaN(val) && val > 0 ? toPaise(val) : 0;
  }, [amountStr]);

  const simulation = useMemo(() => {
    if (amountPaise <= 0) return null;
    return calculateAffordability(forecast, amountPaise);
  }, [forecast, amountPaise]);

  const handleAdd = () => {
    if (amountPaise <= 0) return;
    onAddToPlan?.({
      amountPaise,
      title: titleStr.trim() || 'Planned Purchase',
      kind: 'one_off',
    });
    // Reset simulation
    setAmountStr('');
    setTitleStr('');
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 md:p-5 border border-indigo-100 dark:border-indigo-950/60 shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => compact && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">
            <Sparkles size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              Can I Afford This?
            </h3>
            <p className="text-[11px] text-gray-400">
              Test how a purchase affects your daily safe-spend before buying
            </p>
          </div>
        </div>

        {compact && (
          <button
            type="button"
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 px-2 py-1"
          >
            {isExpanded ? 'Hide' : 'Check'}
          </button>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="pt-3.5 space-y-3 overflow-hidden"
          >
            {/* Input Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">
                  ₹
                </span>
                <input
                  type="number"
                  step="any"
                  value={amountStr}
                  onChange={e => setAmountStr(e.target.value)}
                  placeholder="Amount (e.g. 5000)"
                  className="w-full pl-7 pr-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm font-bold outline-none border border-gray-200 dark:border-gray-700 focus:border-indigo-500"
                />
              </div>

              <input
                type="text"
                value={titleStr}
                onChange={e => setTitleStr(e.target.value)}
                placeholder="What is this for? (optional)"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl text-xs font-medium outline-none border border-gray-200 dark:border-gray-700 focus:border-indigo-500"
              />
            </div>

            {/* Simulation Results */}
            {simulation && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3.5 rounded-2xl border text-xs space-y-2.5 ${
                  simulation.affordable
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold">
                    {simulation.affordable ? (
                      <>
                        <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-800 dark:text-emerald-300">
                          Affordable within monthly plan
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
                        <span className="text-amber-800 dark:text-amber-300">
                          Exceeds current safe limits
                        </span>
                      </>
                    )}
                  </div>

                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/80 dark:bg-gray-800 text-gray-600 dark:text-gray-300 shadow-xs">
                    Simulated
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] text-gray-500 block">New Safe-to-Spend</span>
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                      {formatINR(simulation.newSafeToSpendPerDayPaise)}/day
                    </span>
                    <span className="text-[10px] text-red-500 ml-1">
                      ({formatINR(Math.abs(simulation.safeToSpendDiffPaise))}/day drop)
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-gray-500 block">New Month-End Spend</span>
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                      {formatINR(simulation.newProjectedMonthEndPaise)}
                    </span>
                  </div>
                </div>

                {simulation.newProjectedLeftoverPaise !== null && (
                  <div className="text-[11px] text-gray-600 dark:text-gray-300 pt-1 border-t border-black/5 dark:border-white/5">
                    {simulation.newProjectedLeftoverPaise >= 0 ? (
                      <span>
                        Projected leftover balance: <strong>{formatINR(simulation.newProjectedLeftoverPaise)}</strong>
                      </span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400 font-semibold">
                        ⚠️ Will cause a projected deficit of {formatINR(Math.abs(simulation.newProjectedLeftoverPaise))}
                      </span>
                    )}
                  </div>
                )}

                {/* Add to Plan Button (Saves nothing until tapped) */}
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={handleAdd}
                    className="px-3.5 py-1.5 rounded-xl gradient-primary text-white font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 transition-all"
                  >
                    <Plus size={13} /> Add to plan
                  </button>
                </div>
              </motion.div>
            )}

            {!simulation && (
              <p className="text-[11px] text-gray-400 italic">
                Nothing is saved until you tap "Add to plan".
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
