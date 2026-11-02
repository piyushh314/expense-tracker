import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { db } from '../../db';
import { toPaise, toRupees, formatINR, evaluateMathExpression } from '../../utils/money';
import { today } from '../../utils/date';
import { useToast } from '../../contexts/ToastContext';
import { getPersonInitials } from '../../utils/peopleLedger';
import type { Person, Settlement, SettlementMethod, SettlementDirection } from '../../types';

interface SettleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  person: Person | null;
  netPaise: number; // positive = they owe me, negative = I owe them
  onSettled?: () => void;
}

const METHODS: { id: SettlementMethod; label: string }[] = [
  { id: 'upi', label: 'UPI' },
  { id: 'cash', label: 'Cash' },
  { id: 'other', label: 'Other / Bank' },
];

export default function SettleSheet({
  isOpen,
  onClose,
  person,
  netPaise,
  onSettled,
}: SettleSheetProps) {
  const { showToast } = useToast();

  const isTheyOweMe = netPaise > 0;
  const initialAbsPaise = Math.abs(netPaise);

  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<SettlementMethod>('upi');
  const [note, setNote] = useState('');
  const [confirmedOverpayment, setConfirmedOverpayment] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && person) {
      setAmountStr(String(toRupees(initialAbsPaise)));
      setDate(today());
      setMethod('upi');
      setNote('');
      setConfirmedOverpayment(false);
      setTimeout(() => amountRef.current?.focus(), 250);
    }
  }, [isOpen, person, initialAbsPaise]);

  const evalResult = useMemo(() => {
    if (!amountStr) return null;
    if (/^[\d.]+$/.test(amountStr.trim())) return null;
    return evaluateMathExpression(amountStr);
  }, [amountStr]);

  const enteredRupees = evalResult ?? (parseFloat(amountStr) || 0);
  const enteredPaise = toPaise(enteredRupees);

  // Overpayment check
  const isOverpayment = enteredPaise > initialAbsPaise && initialAbsPaise > 0;
  const overpaymentDifference = enteredPaise - initialAbsPaise;

  const handleSettle = async () => {
    if (!person || enteredPaise <= 0) return;

    if (isOverpayment && !confirmedOverpayment) {
      setConfirmedOverpayment(true);
      return;
    }

    const direction: SettlementDirection = isTheyOweMe ? 'they_paid_me' : 'i_paid_them';

    const settlement: Settlement = {
      id: uuid(),
      personId: person.id,
      direction,
      amount: enteredPaise,
      date,
      method,
      note: note.trim() || `Settled ${formatINR(enteredPaise)} via ${method.toUpperCase()}`,
      createdAt: Date.now(),
    };

    await db.settlements.add(settlement);

    const displayName = person.nickname || person.name;
    const msg =
      direction === 'they_paid_me'
        ? `Received ${formatINR(enteredPaise)} from ${displayName}`
        : `Paid ${formatINR(enteredPaise)} to ${displayName}`;

    showToast(msg, {
      onUndo: async () => {
        await db.settlements.delete(settlement.id);
      },
    });

    onSettled?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && person && (
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
            className="fixed bottom-0 left-0 right-0 z-50 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md md:w-full md:rounded-3xl"
          >
            <div className="bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 border border-gray-100 dark:border-gray-800">
              <div className="flex justify-center -mt-2 pb-2 md:hidden">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-white text-sm"
                    style={{ backgroundColor: person.color }}
                  >
                    {getPersonInitials(person.name)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">
                      Settle Up with {person.nickname || person.name}
                    </h3>
                    <p className="text-xs text-gray-500 font-medium">
                      Current: {isTheyOweMe ? 'They owe you' : 'You owe'} {formatINR(initialAbsPaise)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Amount */}
              <div className="py-6 text-center">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Settlement Amount
                </p>
                <div className="inline-flex items-center justify-center">
                  <span className="text-3xl font-bold text-gray-400 dark:text-gray-500 mr-1">₹</span>
                  <input
                    ref={amountRef}
                    type="text"
                    inputMode="decimal"
                    value={amountStr}
                    onChange={e => {
                      setAmountStr(e.target.value);
                      setConfirmedOverpayment(false);
                    }}
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
                {enteredPaise < initialAbsPaise && enteredPaise > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1.5">
                    Partial settlement: {formatINR(initialAbsPaise - enteredPaise)} will remain open.
                  </p>
                )}
              </div>

              {/* Overpayment Warning banner */}
              {isOverpayment && (
                <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs">
                  <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <p className="font-bold">
                        This is {formatINR(overpaymentDifference)} more than owed!
                      </p>
                      <p className="mt-0.5 opacity-90">
                        The balance will flip: {isTheyOweMe ? 'You will now owe them' : 'They will now owe you'}{' '}
                        <strong>{formatINR(overpaymentDifference)}</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Method */}
              <div className="pb-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                  Settled Via
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                        method === m.id
                          ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div className="pb-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Settlement Date
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

              {/* Note */}
              <div className="pb-4">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Note <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <FileText size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="e.g. Paid back via GPay"
                    maxLength={200}
                    className="w-full pl-9 pr-3 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-2xl text-xs font-medium outline-none text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Confirm / Save Button */}
              <div>
                <button
                  type="button"
                  onClick={handleSettle}
                  disabled={enteredPaise <= 0}
                  className="w-full py-4 rounded-2xl font-bold text-sm bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white shadow-xl shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <CheckCircle2 size={18} />
                  {isOverpayment && !confirmedOverpayment
                    ? `Confirm Overpayment (${formatINR(enteredPaise)})`
                    : `Mark Settled · ${formatINR(enteredPaise)}`}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

