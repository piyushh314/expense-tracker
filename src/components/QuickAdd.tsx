import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronUp, Calendar, Hash, Sparkles, Users, UserPlus, AlertTriangle } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { toPaise, formatINR, evaluateMathExpression } from '../utils/money';
import { today } from '../utils/date';
import { parseSmartText } from '../utils/smartParser';
import {
  useCategories,
  usePaymentMethods,
  useNoteSuggestions,
  useCategoryUsageCount,
  useFrequentPeople,
  usePersons,
} from '../hooks/useDatabase';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';
import DynamicIcon from './ui/DynamicIcon';
import AddPersonModal from './people/AddPersonModal';
import {
  computeTransactionSplits,
  getPersonInitials,
} from '../utils/peopleLedger';
import {
  saveTransactionWithSplits,
  checkTransactionSettlements,
} from '../utils/transactionLedger';
import type { Transaction, TransactionType, Scope, SplitMode, Person } from '../types';

interface QuickAddProps {
  isOpen: boolean;
  onClose: () => void;
  editTransaction?: Transaction | null;
}

export default function QuickAdd({ isOpen, onClose, editTransaction }: QuickAddProps) {
  const { settings, updateSettings } = useSettings();
  const { showToast } = useToast();
  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');
  const paymentMethods = usePaymentMethods();
  const usageCounts = useCategoryUsageCount();
  const frequentPeople = useFrequentPeople();
  const allPersons = usePersons();

  const [txnType, setTxnType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [scope, setScope] = useState<Scope>('personal');
  const [showMore, setShowMore] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [addAnother, setAddAnother] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const [smartText, setSmartText] = useState('');

  // Who paid and who shares state
  const [paidBy, setPaidBy] = useState<'me' | string>('me');
  const [splitMode, setSplitMode] = useState<SplitMode>('none');
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [customShares, setCustomShares] = useState<Record<string, number>>({});
  const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);
  const [settledWarningOpen, setSettledWarningOpen] = useState(false);
  const [pendingSaveTxn, setPendingSaveTxn] = useState<Transaction | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const noteSuggestions = useNoteSuggestions(noteFocused ? note : '');

  const categories = txnType === 'income' ? incomeCategories : expenseCategories;

  const sortedCategories = useMemo(() => {
    const sorted = [...categories].sort((a, b) => {
      const countA = usageCounts.get(a.id) || 0;
      const countB = usageCounts.get(b.id) || 0;
      return countB - countA;
    });
    return sorted;
  }, [categories, usageCounts]);

  const displayedCategories = showAllCategories ? sortedCategories : sortedCategories.slice(0, 6);

  const evalResult = useMemo(() => {
    if (!amountStr) return null;
    if (/^[\d.]+$/.test(amountStr.trim())) return null;
    return evaluateMathExpression(amountStr);
  }, [amountStr]);

  const effectiveAmount = evalResult ?? (parseFloat(amountStr) || 0);
  const totalPaise = toPaise(effectiveAmount);

  // Map personId to name for clean summary line
  const personNamesById = useMemo(() => {
    const map = new Map<string, string>();
    allPersons.forEach(p => map.set(p.id, p.name));
    return map;
  }, [allPersons]);

  // Derived split calculation & live summary line
  const splitComputation = useMemo(() => {
    if (txnType !== 'expense' || totalPaise <= 0) {
      return {
        mySharePaise: totalPaise,
        participantEntries: [],
        summaryText: totalPaise > 0 ? `You spend ${formatINR(totalPaise)}` : '',
        isValid: true,
      };
    }

    return computeTransactionSplits({
      totalPaise,
      paidBy,
      splitMode,
      participantPersonIds: selectedPersonIds,
      personNamesById,
      customShares,
    });
  }, [txnType, totalPaise, paidBy, splitMode, selectedPersonIds, personNamesById, customShares]);

  const resetForm = () => {
    setAmountStr('');
    setCategoryId(settings.lastUsedCategoryId || (categories[0]?.id ?? ''));
    setPaymentMethodId(settings.lastUsedPaymentMethodId || (paymentMethods[0]?.id ?? ''));
    setDate(today());
    setNote('');
    setTagsStr('');
    setScope('personal');
    setSmartText('');
    setShowMore(false);
    setShowAllCategories(false);
    setPaidBy('me');
    setSplitMode('none');
    setSelectedPersonIds([]);
    setCustomShares({});
    setPendingSaveTxn(null);
    setSettledWarningOpen(false);
  };

  useEffect(() => {
    if (isOpen) {
      if (editTransaction) {
        setTxnType(editTransaction.type);
        setAmountStr(String(editTransaction.amount / 100));
        setCategoryId(editTransaction.categoryId);
        setPaymentMethodId(editTransaction.paymentMethodId);
        setDate(editTransaction.date);
        setNote(editTransaction.note);
        setTagsStr(editTransaction.tags.join(', '));
        setScope(editTransaction.scope);
        setPaidBy(editTransaction.paidBy || 'me');
        setSplitMode(editTransaction.splitMode || 'none');

        // Load linked ledger entries if editing
        (async () => {
          const linked = await db.ledgerEntries.where('transactionId').equals(editTransaction.id).toArray();
          if (linked.length > 0) {
            setSelectedPersonIds(linked.map(e => e.personId));
            const shares: Record<string, number> = {
              me: editTransaction.mySharePaise ?? editTransaction.amount,
            };
            linked.forEach(e => {
              shares[e.personId] = e.amount;
            });
            setCustomShares(shares);
          }
        })();
      } else {
        resetForm();
      }
      setTimeout(() => amountRef.current?.focus(), 300);
    }
  }, [isOpen, editTransaction]);

  useEffect(() => {
    if (!categoryId && categories.length > 0) {
      setCategoryId(settings.lastUsedCategoryId || categories[0].id);
    }
  }, [categories]);

  useEffect(() => {
    if (!paymentMethodId && paymentMethods.length > 0) {
      setPaymentMethodId(settings.lastUsedPaymentMethodId || paymentMethods[0].id);
    }
  }, [paymentMethods]);

  const handleSmartInput = (input: string) => {
    setSmartText(input);
    const parsed = parseSmartText(input, [...expenseCategories, ...incomeCategories]);
    if (parsed) {
      if (parsed.amount !== null) {
        setAmountStr(String(parsed.amount));
      }
      if (parsed.note) {
        setNote(parsed.note);
      }
      if (parsed.suggestedCategoryId) {
        setCategoryId(parsed.suggestedCategoryId);
      }
      if (parsed.suggestedType) {
        setTxnType(parsed.suggestedType);
      }
      if (parsed.tags.length > 0) {
        setTagsStr(parsed.tags.join(', '));
      }
    }
  };

  const handleTogglePerson = (personId: string) => {
    if (paidBy === 'me') {
      if (selectedPersonIds.includes(personId)) {
        const next = selectedPersonIds.filter(id => id !== personId);
        setSelectedPersonIds(next);
        if (next.length === 0 && splitMode === 'equally') {
          setSplitMode('none');
        }
      } else {
        const next = [...selectedPersonIds, personId];
        setSelectedPersonIds(next);
        if (splitMode === 'none') {
          setSplitMode('equally');
        }
      }
    } else {
      // If someone else paid, selecting a person sets them as payer
      setPaidBy(personId);
    }
  };

  const executeSave = async (txn: Transaction) => {
    await saveTransactionWithSplits({
      transaction: txn,
      splitMode,
      participantEntries: splitComputation.participantEntries,
      isEdit: !!editTransaction,
    });

    if (editTransaction) {
      showToast('Transaction updated');
    } else {
      const savedTxn = { ...txn };
      showToast(
        `${txnType === 'income' ? 'Income' : 'Expense'} added — ${formatINR(
          splitComputation.mySharePaise
        )}${splitMode !== 'none' ? ' (your share)' : ''}`,
        {
          onUndo: async () => {
            await db.transactions.delete(savedTxn.id);
            const linked = await db.ledgerEntries.where('transactionId').equals(savedTxn.id).toArray();
            if (linked.length > 0) {
              await db.ledgerEntries.bulkDelete(linked.map(l => l.id));
            }
          },
        }
      );
    }

    updateSettings({ lastUsedCategoryId: categoryId, lastUsedPaymentMethodId: paymentMethodId });

    if (addAnother && !editTransaction) {
      resetForm();
      setTimeout(() => amountRef.current?.focus(), 100);
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    if (effectiveAmount <= 0 || !categoryId || !splitComputation.isValid) return;

    const tags = tagsStr.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);

    const txn: Transaction = {
      id: editTransaction?.id || uuid(),
      type: txnType,
      amount: totalPaise,
      totalPaise,
      mySharePaise: splitComputation.mySharePaise,
      paidBy: txnType === 'expense' ? paidBy : 'me',
      splitMode: txnType === 'expense' ? splitMode : 'none',
      categoryId,
      paymentMethodId: paidBy === 'me' ? paymentMethodId : '',
      date,
      note: note.trim(),
      tags,
      scope,
      createdAt: editTransaction?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // If editing, check whether linked split entries already have settlements
    if (editTransaction) {
      const { hasSettlements } = await checkTransactionSettlements(editTransaction.id);
      if (hasSettlements) {
        setPendingSaveTxn(txn);
        setSettledWarningOpen(true);
        return;
      }
    }

    await executeSave(txn);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
              onClick={onClose}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:w-full md:rounded-2xl"
            >
              <div className="bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
                <div className="flex justify-center pt-3 pb-1 md:hidden">
                  <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
                </div>

                <div className="flex items-center justify-between px-5 py-3">
                  <h2 className="text-lg font-bold">{editTransaction ? 'Edit' : 'Add'} Transaction</h2>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Type Switcher */}
                <div className="px-5 pb-3">
                  <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                    {(['expense', 'income'] as TransactionType[]).map(t => (
                      <button
                        key={t}
                        onClick={() => {
                          setTxnType(t);
                          setCategoryId('');
                          if (t === 'income') {
                            setPaidBy('me');
                            setSplitMode('none');
                            setSelectedPersonIds([]);
                          }
                        }}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                          txnType === t
                            ? t === 'expense'
                              ? 'bg-red-500 text-white shadow-md'
                              : 'bg-green-500 text-white shadow-md'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {t === 'expense' ? 'Expense' : 'Income'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Magic Smart Text Quick Entry */}
                {!editTransaction && (
                  <div className="px-5 pb-1">
                    <div className="relative">
                      <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500" />
                      <input
                        type="text"
                        value={smartText}
                        onChange={e => handleSmartInput(e.target.value)}
                        placeholder="Smart entry: e.g. 'chai 20', 'auto 80 #college'"
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 placeholder-indigo-400/80 rounded-xl outline-none border border-indigo-200/60 dark:border-indigo-800/60 focus:ring-2 focus:ring-indigo-500/30 transition-all font-medium"
                      />
                    </div>
                  </div>
                )}

                {/* Amount Input */}
                <div className="px-5 py-4">
                  <div className="text-center">
                    <span className="text-2xl font-bold text-gray-400 dark:text-gray-500">₹</span>
                    <input
                      ref={amountRef}
                      type="text"
                      inputMode="decimal"
                      value={amountStr}
                      onChange={e => setAmountStr(e.target.value)}
                      placeholder="0"
                      className="amount-input text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-700"
                      autoFocus
                    />
                    {evalResult !== null && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-indigo-500 font-medium mt-1"
                      >
                        = ₹{evalResult.toLocaleString('en-IN')}
                      </motion.p>
                    )}
                  </div>
                </div>

                {/* Category Chips */}
                <div className="px-5 pb-3">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                    Category
                  </label>
                  <div className={`flex flex-wrap gap-2 ${!showAllCategories ? 'max-h-[88px] overflow-hidden' : ''}`}>
                    {displayedCategories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setCategoryId(cat.id)}
                        className={`category-chip ${categoryId === cat.id ? 'selected' : 'bg-gray-100 dark:bg-gray-800'}`}
                      >
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: cat.color + '20' }}
                        >
                          <DynamicIcon name={cat.icon} size={14} style={{ color: cat.color }} />
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                  {sortedCategories.length > 6 && (
                    <button
                      onClick={() => setShowAllCategories(!showAllCategories)}
                      className="text-xs text-indigo-500 font-semibold mt-2 flex items-center gap-1"
                    >
                      {showAllCategories ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {showAllCategories ? 'Show less' : `+${sortedCategories.length - 6} more`}
                    </button>
                  )}
                </div>

                {/* Date */}
                <div className="px-5 pb-3 flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                      Date
                    </label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/30"
                      />
                    </div>
                  </div>
                </div>

                {/* WHO PAID AND WHO SHARES (Expense only) */}
                {txnType === 'expense' && (
                  <div className="px-5 pb-3">
                    <div className="p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 uppercase tracking-wider">
                          <Users size={14} className="text-indigo-500" /> Who paid & who shares
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsAddPersonOpen(true)}
                          className="text-[11px] font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
                        >
                          <UserPlus size={12} /> + New Person
                        </button>
                      </div>

                      {/* Paid By Toggle */}
                      <div>
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                          Paid by
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPaidBy('me');
                              if (splitMode === 'fully_mine') setSplitMode('none');
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                              paidBy === 'me'
                                ? 'bg-indigo-500 text-white shadow-sm'
                                : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                            }`}
                          >
                            I paid (Me)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (frequentPeople.length > 0) {
                                const target = frequentPeople[0].id;
                                setPaidBy(target);
                                setSplitMode('fully_mine');
                              } else {
                                setIsAddPersonOpen(true);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                              paidBy !== 'me'
                                ? 'bg-indigo-500 text-white shadow-sm'
                                : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                            }`}
                          >
                            Someone else paid
                          </button>
                        </div>
                      </div>

                      {/* If Someone else paid, pick which person paid */}
                      {paidBy !== 'me' && (
                        <div>
                          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                            Who paid?
                          </label>
                          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            {frequentPeople.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setPaidBy(p.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                                  paidBy === p.id
                                    ? 'bg-indigo-500 text-white shadow-sm'
                                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                                }`}
                              >
                                <span
                                  className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                                  style={{ backgroundColor: p.color }}
                                >
                                  {getPersonInitials(p.name)}
                                </span>
                                <span>{p.name}</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setIsAddPersonOpen(true)}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-indigo-500 border border-dashed border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 whitespace-nowrap"
                            >
                              + New
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Split Mode Options */}
                      <div>
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                          Split mode
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                          {paidBy === 'me' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setSplitMode('none');
                                  setSelectedPersonIds([]);
                                }}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                  splitMode === 'none'
                                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                                }`}
                              >
                                No split
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSplitMode('equally');
                                  if (selectedPersonIds.length === 0 && frequentPeople.length > 0) {
                                    setSelectedPersonIds([frequentPeople[0].id]);
                                  }
                                }}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                  splitMode === 'equally'
                                    ? 'bg-indigo-500 text-white shadow-sm'
                                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                                }`}
                              >
                                Equally
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSplitMode('fully_theirs');
                                  if (selectedPersonIds.length === 0 && frequentPeople.length > 0) {
                                    setSelectedPersonIds([frequentPeople[0].id]);
                                  }
                                }}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                  splitMode === 'fully_theirs'
                                    ? 'bg-indigo-500 text-white shadow-sm'
                                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                                }`}
                              >
                                Fully theirs (₹0 my spend)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSplitMode('custom');
                                  if (selectedPersonIds.length === 0 && frequentPeople.length > 0) {
                                    setSelectedPersonIds([frequentPeople[0].id]);
                                  }
                                }}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                  splitMode === 'custom'
                                    ? 'bg-indigo-500 text-white shadow-sm'
                                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                                }`}
                              >
                                Custom amounts
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setSplitMode('fully_mine')}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                  splitMode === 'fully_mine'
                                    ? 'bg-indigo-500 text-white shadow-sm'
                                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                                }`}
                              >
                                Fully mine (They bought for me)
                              </button>
                              <button
                                type="button"
                                onClick={() => setSplitMode('equally')}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                  splitMode === 'equally'
                                    ? 'bg-indigo-500 text-white shadow-sm'
                                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                                }`}
                              >
                                Split equally
                              </button>
                              <button
                                type="button"
                                onClick={() => setSplitMode('custom')}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                  splitMode === 'custom'
                                    ? 'bg-indigo-500 text-white shadow-sm'
                                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                                }`}
                              >
                                Custom my share
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Person Chips (When paid by Me and split is enabled) */}
                      {paidBy === 'me' && splitMode !== 'none' && (
                        <div>
                          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                            Share with (tap to select):
                          </label>
                          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            {frequentPeople.map(p => {
                              const isSelected = selectedPersonIds.includes(p.id);
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => handleTogglePerson(p.id)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                                    isSelected
                                      ? 'bg-indigo-500 text-white shadow-sm ring-2 ring-indigo-400/40'
                                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                                  }`}
                                >
                                  <span
                                    className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                                    style={{ backgroundColor: p.color }}
                                  >
                                    {getPersonInitials(p.name)}
                                  </span>
                                  <span>{p.name}</span>
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => setIsAddPersonOpen(true)}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-indigo-500 border border-dashed border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 whitespace-nowrap"
                            >
                              + New
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Custom Amounts Editor */}
                      {splitMode === 'custom' && (
                        <div className="p-3 bg-white dark:bg-gray-700/60 rounded-xl space-y-2 border border-gray-200 dark:border-gray-600">
                          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Assign amounts (Total: {formatINR(totalPaise)})
                          </p>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <span className="font-semibold text-gray-700 dark:text-gray-200">Your Share:</span>
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400 font-bold">₹</span>
                                <input
                                  type="number"
                                  step="any"
                                  value={
                                    customShares['me'] !== undefined ? customShares['me'] / 100 : ''
                                  }
                                  onChange={e => {
                                    const val = toPaise(parseFloat(e.target.value) || 0);
                                    setCustomShares(prev => ({ ...prev, me: val }));
                                  }}
                                  placeholder="0"
                                  className="w-24 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-right font-bold text-sm outline-none"
                                />
                              </div>
                            </div>

                            {paidBy === 'me' &&
                              selectedPersonIds.map(pid => {
                                const p = allPersons.find(item => item.id === pid);
                                return (
                                  <div key={pid} className="flex items-center justify-between gap-3 text-xs">
                                    <span className="font-semibold text-gray-700 dark:text-gray-200 truncate">
                                      {p?.name || 'Friend'}:
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-gray-400 font-bold">₹</span>
                                      <input
                                        type="number"
                                        step="any"
                                        value={
                                          customShares[pid] !== undefined ? customShares[pid] / 100 : ''
                                        }
                                        onChange={e => {
                                          const val = toPaise(parseFloat(e.target.value) || 0);
                                          setCustomShares(prev => ({ ...prev, [pid]: val }));
                                        }}
                                        placeholder="0"
                                        className="w-24 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-right font-bold text-sm outline-none"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Live Summary Line */}
                      {splitComputation.summaryText && (
                        <div className="p-2.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center gap-2">
                          <Users size={14} className="text-indigo-500 shrink-0" />
                          <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 leading-tight">
                            {splitComputation.summaryText}
                          </span>
                        </div>
                      )}

                      {!splitComputation.isValid && splitComputation.validationError && (
                        <p className="text-xs text-rose-500 font-medium">
                          {splitComputation.validationError}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment Method (Hidden if someone else paid) */}
                {paidBy === 'me' && (
                  <div className="px-5 pb-3">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                      Payment
                    </label>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                      {paymentMethods.map(pm => (
                        <button
                          key={pm.id}
                          onClick={() => setPaymentMethodId(pm.id)}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                            paymentMethodId === pm.id
                              ? 'bg-indigo-500 text-white shadow-md'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {pm.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Note */}
                <div className="px-5 pb-3 relative">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Note
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={e => setNote(e.target.value.slice(0, 500))}
                    onFocus={() => setNoteFocused(true)}
                    onBlur={() => setTimeout(() => setNoteFocused(false), 200)}
                    placeholder="What was this for?"
                    maxLength={500}
                    className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                  />
                  {noteSuggestions.length > 0 && noteFocused && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute left-5 right-5 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-10 overflow-hidden"
                    >
                      {noteSuggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setNote(s);
                            setNoteFocused(false);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0"
                        >
                          {s}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>

                {/* More Options Toggle */}
                <div className="px-5 pb-2">
                  <button
                    onClick={() => setShowMore(!showMore)}
                    className="text-xs text-indigo-500 font-semibold flex items-center gap-1"
                  >
                    {showMore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showMore ? 'Less options' : 'More options'}
                  </button>
                </div>

                <AnimatePresence>
                  {showMore && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-3">
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                          Tags
                        </label>
                        <div className="relative">
                          <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={tagsStr}
                            onChange={e => setTagsStr(e.target.value)}
                            placeholder="goa-trip, friends"
                            className="w-full pl-9 pr-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/30"
                          />
                        </div>
                      </div>
                      <div className="px-5 pb-3">
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                          Scope
                        </label>
                        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 max-w-xs">
                          {(['personal', 'business'] as Scope[]).map(s => (
                            <button
                              key={s}
                              onClick={() => setScope(s)}
                              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                                scope === s
                                  ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                                  : 'text-gray-500'
                              }`}
                            >
                              {s === 'personal' ? 'Personal' : 'Business'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!editTransaction && (
                  <div className="px-5 pb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addAnother}
                        onChange={e => setAddAnother(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-500 focus:ring-indigo-500 w-4 h-4"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Add another</span>
                    </label>
                  </div>
                )}

                {/* Save Button */}
                <div className="px-5 pb-6 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={
                      effectiveAmount <= 0 ||
                      !categoryId ||
                      !splitComputation.isValid ||
                      (txnType === 'expense' && paidBy !== 'me' && !paidBy)
                    }
                    className={`w-full py-4 rounded-2xl font-bold text-base transition-all duration-200 shadow-lg active:scale-[0.98] ${
                      effectiveAmount > 0 &&
                      categoryId &&
                      splitComputation.isValid &&
                      (txnType !== 'expense' || paidBy === 'me' || paidBy)
                        ? txnType === 'expense'
                          ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
                          : 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/30'
                        : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {editTransaction ? 'Update' : 'Save'}{' '}
                    {effectiveAmount > 0 ? (
                      splitMode !== 'none' && txnType === 'expense' ? (
                        <>
                          {formatINR(totalPaise)}{' '}
                          <span className="opacity-90 font-medium text-xs">
                            (Your spend: {formatINR(splitComputation.mySharePaise)})
                          </span>
                        </>
                      ) : (
                        formatINR(totalPaise)
                      )
                    ) : (
                      ''
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Inline Add Person Modal */}
      <AddPersonModal
        isOpen={isAddPersonOpen}
        onClose={() => setIsAddPersonOpen(false)}
        onPersonSaved={(newPerson: Person) => {
          if (paidBy === 'me') {
            setSelectedPersonIds(prev => [...prev, newPerson.id]);
            if (splitMode === 'none') setSplitMode('equally');
          } else {
            setPaidBy(newPerson.id);
          }
        }}
      />

      {/* Warning Modal when editing an entry with existing settlements */}
      <AnimatePresence>
        {settledWarningOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => setSettledWarningOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1, y: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Partly or Fully Settled Split
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                This transaction has linked split entries that have already been settled or partly settled.
                Updating it will modify the balances and ledger history.
              </p>
              <div className="flex gap-2.5 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setSettledWarningOpen(false);
                    setPendingSaveTxn(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (pendingSaveTxn) {
                      setSettledWarningOpen(false);
                      await executeSave(pendingSaveTxn);
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/30"
                >
                  Proceed Anyway
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
