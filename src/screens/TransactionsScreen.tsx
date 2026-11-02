import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, SlidersHorizontal, X, Trash2, Copy, ArrowUpDown, AlertTriangle, Users } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatINR } from '../utils/money';
import { formatDate, getCurrentMonth, getPreviousMonth, getCurrentWeek } from '../utils/date';
import { usePaymentMethods, usePersons } from '../hooks/useDatabase';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';
import { getEffectiveExpensePaise } from '../utils/peopleLedger';
import { checkTransactionSettlements, deleteTransactionWithSplits } from '../utils/transactionLedger';
import DynamicIcon from '../components/ui/DynamicIcon';
import type { Transaction, TransactionType, Scope } from '../types';
import { v4 as uuid } from 'uuid';

interface TransactionsScreenProps {
  onEdit: (transaction: Transaction) => void;
}

type SortMode = 'newest' | 'oldest' | 'highest';
type QuickRange = 'all' | 'this-week' | 'this-month' | 'last-month' | 'custom';

export default function TransactionsScreen({ onEdit }: TransactionsScreenProps) {
  const { settings } = useSettings();
  const { showToast } = useToast();
  const allCategories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const paymentMethods = usePaymentMethods();
  const allPersons = usePersons();

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [quickRange, setQuickRange] = useState<QuickRange>('this-month');
  const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
  const [filterPaymentMethodIds, setFilterPaymentMethodIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');
  const [filterScope, setFilterScope] = useState<Scope | 'all'>('all');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [deleteWarningTxn, setDeleteWarningTxn] = useState<Transaction | null>(null);

  const catMap = useMemo(() => {
    const m = new Map<string, typeof allCategories[0]>();
    allCategories.forEach(c => m.set(c.id, c));
    return m;
  }, [allCategories]);

  const pmMap = useMemo(() => {
    const m = new Map<string, typeof paymentMethods[0]>();
    paymentMethods.forEach(p => m.set(p.id, p));
    return m;
  }, [paymentMethods]);

  const personMap = useMemo(() => {
    const m = new Map<string, typeof allPersons[0]>();
    allPersons.forEach(p => m.set(p.id, p));
    return m;
  }, [allPersons]);

  // Date range
  const dateRange = useMemo(() => {
    switch (quickRange) {
      case 'this-week': return getCurrentWeek(settings.firstDayOfWeek);
      case 'this-month': return getCurrentMonth(settings.monthStartDay);
      case 'last-month': return getPreviousMonth(settings.monthStartDay);
      default: return null;
    }
  }, [quickRange, settings.firstDayOfWeek, settings.monthStartDay]);

  const allTransactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray()) ?? [];

  const filtered = useMemo(() => {
    let results = [...allTransactions];

    if (dateRange) {
      results = results.filter(t => t.date >= dateRange.from && t.date <= dateRange.to);
    }
    if (filterCategoryIds.length > 0) {
      results = results.filter(t => filterCategoryIds.includes(t.categoryId));
    }
    if (filterPaymentMethodIds.length > 0) {
      results = results.filter(t => filterPaymentMethodIds.includes(t.paymentMethodId));
    }
    if (filterType !== 'all') {
      results = results.filter(t => t.type === filterType);
    }
    if (filterScope !== 'all') {
      results = results.filter(t => t.scope === filterScope);
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(t => {
        const cat = catMap.get(t.categoryId);
        return (
          t.note.toLowerCase().includes(q) ||
          t.tags.some(tag => tag.toLowerCase().includes(q)) ||
          cat?.name.toLowerCase().includes(q) ||
          String(t.amount / 100).includes(q)
        );
      });
    }

    // Sort
    switch (sortMode) {
      case 'newest': results.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt); break;
      case 'oldest': results.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt); break;
      case 'highest':
        results.sort((a, b) => {
          const valA = a.type === 'expense' ? getEffectiveExpensePaise(a) : a.amount;
          const valB = b.type === 'expense' ? getEffectiveExpensePaise(b) : b.amount;
          return valB - valA;
        });
        break;
    }

    return results;
  }, [allTransactions, dateRange, filterCategoryIds, filterPaymentMethodIds, filterType, filterScope, search, sortMode, catMap]);

  // Group by day
  const grouped = useMemo(() => {
    const groups: { date: string; transactions: Transaction[]; total: number }[] = [];
    let currentDate = '';
    let currentGroup: Transaction[] = [];
    let currentTotal = 0;

    filtered.forEach(t => {
      const effAmt = t.type === 'expense' ? getEffectiveExpensePaise(t) : -t.amount;
      if (t.date !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, transactions: currentGroup, total: currentTotal });
        }
        currentDate = t.date;
        currentGroup = [t];
        currentTotal = effAmt;
      } else {
        currentGroup.push(t);
        currentTotal += effAmt;
      }
    });
    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, transactions: currentGroup, total: currentTotal });
    }
    return groups;
  }, [filtered]);

  const executeDelete = async (txn: Transaction) => {
    const { undo, linkedCount } = await deleteTransactionWithSplits(txn);
    showToast(`Transaction deleted${linkedCount > 0 ? ' (and linked splits)' : ''}`, {
      onUndo: async () => {
        await undo();
      },
    });
  };

  const handleDelete = async (txn: Transaction) => {
    const { hasSettlements } = await checkTransactionSettlements(txn.id);
    if (hasSettlements) {
      setDeleteWarningTxn(txn);
      return;
    }
    await executeDelete(txn);
  };

  const handleDuplicate = async (txn: Transaction) => {
    const newTxn = { ...txn, id: uuid(), createdAt: Date.now(), updatedAt: Date.now() };
    await db.transactions.add(newTxn);
    showToast('Transaction duplicated', {
      onUndo: async () => { await db.transactions.delete(newTxn.id); },
    });
  };

  const clearFilters = () => {
    setFilterCategoryIds([]);
    setFilterPaymentMethodIds([]);
    setFilterType('all');
    setFilterScope('all');
    setSearch('');
    setQuickRange('this-month');
  };

  const activeFilterCount = [
    filterCategoryIds.length > 0,
    filterPaymentMethodIds.length > 0,
    filterType !== 'all',
    filterScope !== 'all',
  ].filter(Boolean).length;

  return (
    <div className="pb-4">
      {/* Search + Filter Bar */}
      <div className="sticky top-0 z-20 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm px-4 pt-4 pb-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search notes, categories, tags..."
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-900 rounded-xl text-sm outline-none border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2.5 rounded-xl border transition-all relative ${
              showFilters || activeFilterCount > 0
                ? 'bg-indigo-500 text-white border-indigo-500'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            <SlidersHorizontal size={18} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <div className="relative">
            <button onClick={() => setShowSortMenu(!showSortMenu)}
              className="px-3 py-2.5 rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 transition-all">
              <ArrowUpDown size={18} />
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-20 overflow-hidden min-w-[140px]">
                  {([['newest', 'Newest'], ['oldest', 'Oldest'], ['highest', 'Highest ₹']] as [SortMode, string][]).map(([mode, label]) => (
                    <button key={mode} onClick={() => { setSortMode(mode); setShowSortMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        sortMode === mode ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 font-semibold' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Quick date range chips */}
        <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
          {([['all', 'All Time'], ['this-week', 'This Week'], ['this-month', 'This Month'], ['last-month', 'Last Month']] as [QuickRange, string][]).map(([range, label]) => (
            <button key={range} onClick={() => setQuickRange(range)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                quickRange === range
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white dark:bg-gray-900 mx-4 rounded-xl border border-gray-200 dark:border-gray-800 mb-3">
            <div className="p-4 space-y-4">
              {/* Type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Type</label>
                <div className="flex gap-2">
                  {([['all', 'All'], ['expense', 'Expense'], ['income', 'Income']] as [TransactionType | 'all', string][]).map(([type, label]) => (
                    <button key={type} onClick={() => setFilterType(type)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        filterType === type ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Categories</label>
                <div className="flex flex-wrap gap-1.5">
                  {allCategories.filter(c => !c.archived).map(cat => (
                    <button key={cat.id} onClick={() => {
                      setFilterCategoryIds(prev => prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]);
                    }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                        filterCategoryIds.includes(cat.id)
                          ? 'bg-indigo-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}>
                      <DynamicIcon name={cat.icon} size={12} />
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scope */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Scope</label>
                <div className="flex gap-2">
                  {([['all', 'All'], ['personal', 'Personal'], ['business', 'Business']] as [Scope | 'all', string][]).map(([s, label]) => (
                    <button key={s} onClick={() => setFilterScope(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        filterScope === s ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={clearFilters} className="text-xs text-red-500 font-semibold">
                Clear all filters
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results count */}
      <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
        {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
        {filtered.length > 0 && ` · Total: ${formatINR(filtered.filter(t => t.type === 'expense').reduce((s, t) => s + getEffectiveExpensePaise(t), 0))} spent`}
      </div>

      {/* Transaction Groups */}
      {grouped.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="text-5xl mb-4">📝</div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No transactions yet</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tap the + button to add your first expense
          </p>
        </div>
      ) : (
        <div className="px-4 space-y-1">
          {grouped.map(group => (
            <div key={group.date}>
              {/* Day header */}
              <div className="flex items-center justify-between py-2 px-1">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {formatDate(group.date)}
                </span>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {formatINR(Math.abs(group.total))}
                </span>
              </div>

              {/* Transactions */}
              <div className="space-y-1.5">
                {group.transactions.map(txn => {
                  const cat = catMap.get(txn.categoryId);
                  const pm = pmMap.get(txn.paymentMethodId);
                  const payer = txn.paidBy && txn.paidBy !== 'me' ? personMap.get(txn.paidBy) : null;
                  const isSplit = txn.type === 'expense' && txn.splitMode && txn.splitMode !== 'none';
                  const effectivePaise = txn.type === 'expense' ? getEffectiveExpensePaise(txn) : txn.amount;

                  return (
                    <motion.div
                      key={txn.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white dark:bg-gray-900 rounded-2xl p-3.5 flex items-center gap-3 group cursor-pointer border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-all"
                      onClick={() => onEdit(txn)}
                    >
                      {/* Category icon */}
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: (cat?.color || '#94A3B8') + '15' }}>
                        <DynamicIcon name={cat?.icon || 'HelpCircle'} size={20} style={{ color: cat?.color || '#94A3B8' }} />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {cat?.name || 'Unknown'}
                          </span>
                          {pm && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium shrink-0">
                              {pm.name}
                            </span>
                          )}
                          {payer && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 font-semibold shrink-0">
                              Paid by {payer.name}
                            </span>
                          )}
                        </div>
                        {txn.note && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            {txn.note}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {isSplit && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 font-semibold flex items-center gap-1">
                              <Users size={10} />
                              {txn.mySharePaise !== undefined && txn.mySharePaise !== txn.amount
                                ? `Total ${formatINR(txn.amount)}`
                                : 'Split'}
                            </span>
                          )}
                          {txn.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-500 font-medium">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right shrink-0">
                        <span className={`text-sm font-bold ${
                          txn.type === 'income' ? 'text-green-500' : 'text-gray-900 dark:text-white'
                        }`}>
                          {txn.type === 'income' ? '+' : '-'}{formatINR(effectivePaise)}
                        </span>
                        {isSplit && effectivePaise !== txn.amount && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">
                            your share
                          </p>
                        )}
                      </div>

                      {/* Action buttons (desktop hover) */}
                      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                        <button onClick={e => { e.stopPropagation(); handleDuplicate(txn); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Duplicate">
                          <Copy size={14} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); handleDelete(txn); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Warning Modal for settled splits */}
      <AnimatePresence>
        {deleteWarningTxn && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setDeleteWarningTxn(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Delete Settled Split?
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                This transaction has split entries that have already been settled. Deleting it will delete the linked ledger entries and alter settlement records.
              </p>
              <div className="flex gap-2.5 mt-5">
                <button
                  type="button"
                  onClick={() => setDeleteWarningTxn(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const t = deleteWarningTxn;
                    setDeleteWarningTxn(null);
                    await executeDelete(t);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-md shadow-rose-500/30"
                >
                  Delete Anyway
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
