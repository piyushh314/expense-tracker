import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, ArrowUpRight, ArrowDownLeft, FileText, Clock } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { db } from '../../db';
import { toPaise, formatINR, evaluateMathExpression } from '../../utils/money';
import { today } from '../../utils/date';
import { useToast } from '../../contexts/ToastContext';
import { getPersonInitials } from '../../utils/peopleLedger';
import type { Person, LedgerEntry, LedgerDirection } from '../../types';

interface LendBorrowSheetProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedPersonId?: string;
  people: Person[];
  editEntry?: LedgerEntry | null;
  onSaved?: () => void;
}

export default function LendBorrowSheet({
  isOpen,
  onClose,
  preselectedPersonId,
  people,
  editEntry,
  onSaved,
}: LendBorrowSheetProps) {
  const { showToast } = useToast();

  const [selectedPersonId, setSelectedPersonId] = useState(
    preselectedPersonId || editEntry?.personId || people[0]?.id || ''
  );
  const [direction, setDirection] = useState<LedgerDirection>(
    editEntry?.direction || 'they_owe_me'
  );
  const [amountStr, setAmountStr] = useState(
    editEntry ? String(editEntry.amount / 100) : ''
  );
  const [date, setDate] = useState(editEntry?.date || today());
  const [dueDate, setDueDate] = useState(editEntry?.dueDate || '');
  const [note, setNote] = useState(editEntry?.note || '');
  const [showDueDatePicker, setShowDueDatePicker] = useState(Boolean(editEntry?.dueDate));

  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (editEntry) {
        setSelectedPersonId(editEntry.personId);
        setDirection(editEntry.direction);
        setAmountStr(String(editEntry.amount / 100));
        setDate(editEntry.date);
        setDueDate(editEntry.dueDate || '');
        setNote(editEntry.note || '');
        setShowDueDatePicker(Boolean(editEntry.dueDate));
      } else {
        setSelectedPersonId(preselectedPersonId || people[0]?.id || '');
        setDirection('they_owe_me');
        setAmountStr('');
        setDate(today());
        setDueDate('');
        setNote('');
        setShowDueDatePicker(false);
      }
      setTimeout(() => amountRef.current?.focus(), 250);
    }
  }, [isOpen, editEntry, preselectedPersonId, people]);

  const evalResult = useMemo(() => {
    if (!amountStr) return null;
    if (/^[\d.]+$/.test(amountStr.trim())) return null;
    return evaluateMathExpression(amountStr);
  }, [amountStr]);

  const effectiveAmount = evalResult ?? (parseFloat(amountStr) || 0);

  const selectedPerson = useMemo(
    () => people.find(p => p.id === selectedPersonId),
    [people, selectedPersonId]
  );

  const handleSave = async () => {
    if (effectiveAmount <= 0 || !selectedPersonId) return;

    const paise = toPaise(effectiveAmount);

    const entry: LedgerEntry = {
      id: editEntry?.id || uuid(),
      personId: selectedPersonId,
      direction,
      kind: editEntry?.kind || 'loan',
      amount: paise,
      date,
      dueDate: showDueDatePicker && dueDate ? dueDate : undefined,
      note: note.trim() || (direction === 'they_owe_me' ? 'Lent money' : 'Borrowed money'),
      transactionId: editEntry?.transactionId,
      splitGroupId: editEntry?.splitGroupId,
      createdAt: editEntry?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    if (editEntry) {
      await db.ledgerEntries.put(entry);
      showToast('Entry updated');
    } else {
      await db.ledgerEntries.add(entry);
      const personName = selectedPerson?.nickname || selectedPerson?.name || 'Person';
      const label =
        direction === 'they_owe_me'
          ? `Lent ${formatINR(paise)} to ${personName}`
          : `Borrowed ${formatINR(paise)} from ${personName}`;

      showToast(label, {
        onUndo: async () => {
          await db.ledgerEntries.delete(entry.id);
        },
      });
    }

    onSaved?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:w-full md:rounded-3xl"
          >
            <div className="bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 border border-gray-100 dark:border-gray-800">
              <div className="flex justify-center -mt-2 pb-2 md:hidden">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {editEntry ? 'Edit Entry' : 'Lend / Borrow'}
                  </h3>
                  <p className="text-xs text-gray-400 font-medium">
                    Pure money tracking · Stays out of your expense totals
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Direction Selector */}
              <div className="pt-4 pb-2">
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
                  <button
                    type="button"
                    onClick={() => setDirection('they_owe_me')}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      direction === 'they_owe_me'
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    <ArrowDownLeft size={16} /> I Gave / Lent (They owe me)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('i_owe_them')}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      direction === 'i_owe_them'
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    <ArrowUpRight size={16} /> I Got / Borrowed (I owe them)
                  </button>
                </div>
              </div>

              {/* Person selector chips */}
              <div className="py-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                  Person
                </label>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {people
                    .filter(p => !p.archived || p.id === selectedPersonId)
                    .map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPersonId(p.id)}
                        className={`px-3.5 py-2 rounded-2xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all ${
                          selectedPersonId === p.id
                            ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20 scale-105'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ backgroundColor: p.color }}
                        >
                          {getPersonInitials(p.name)}
                        </span>
                        {p.nickname || p.name}
                      </button>
                    ))}
                </div>
              </div>

              {/* Amount input */}
              <div className="py-4 text-center">
                <div className="inline-flex items-center justify-center">
                  <span className="text-3xl font-bold text-gray-400 dark:text-gray-500 mr-1">₹</span>
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
                </div>
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

              {/* Date & Optional Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                    Date
                  </label>
                  <div className="relative">
                    <Calendar size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-2xl text-xs font-medium outline-none text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                      Due Date
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowDueDatePicker(!showDueDatePicker)}
                      className="text-[11px] text-indigo-500 font-semibold"
                    >
                      {showDueDatePicker ? 'Remove' : '+ Add due date'}
                    </button>
                  </div>
                  {showDueDatePicker ? (
                    <div className="relative">
                      <Clock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="date"
                        value={dueDate}
                        min={date}
                        onChange={e => setDueDate(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-2xl text-xs font-medium outline-none text-gray-900 dark:text-white"
                      />
                    </div>
                  ) : (
                    <div className="py-2.5 px-3 text-xs text-gray-400 dark:text-gray-500 italic">
                      No deadline set
                    </div>
                  )}
                </div>
              </div>

              {/* Note */}
              <div className="py-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Note <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <FileText size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="e.g. Cash for concert ticket"
                    maxLength={200}
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-2xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/30 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={effectiveAmount <= 0 || !selectedPersonId}
                  className={`w-full py-4 rounded-2xl font-bold text-sm shadow-xl transition-all active:scale-[0.98] ${
                    effectiveAmount > 0 && selectedPersonId
                      ? direction === 'they_owe_me'
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30'
                        : 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/30'
                      : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {editEntry ? 'Update Entry' : direction === 'they_owe_me' ? 'Log Money Lent' : 'Log Money Borrowed'}{' '}
                  {effectiveAmount > 0 ? `· ${formatINR(toPaise(effectiveAmount))}` : ''}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
