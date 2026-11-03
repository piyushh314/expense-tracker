import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Calendar,
  Repeat,
  Bell,
  Trash2,
  FileText,
  CreditCard,
  Tag,
  Users,
} from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { db } from '../../db';
import { toPaise, toRupees } from '../../utils/money';
import { today } from '../../utils/date';
import { generateOccurrences } from '../../utils/planForecast';
import { useCategories, usePaymentMethods, usePersons } from '../../hooks/useDatabase';
import { useToast } from '../../contexts/ToastContext';
import DynamicIcon from '../ui/DynamicIcon';
import type {
  PlannedItem,
  PlannedItemKind,
  PlannedAmountType,
  PlannedRepeat,
} from '../../types';

interface AddEditPlannedItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  editItem?: PlannedItem | null;
  initialKind?: PlannedItemKind;
  initialDueDate?: string;
  onSaved?: (item: PlannedItem) => void;
}

export default function AddEditPlannedItemModal({
  isOpen,
  onClose,
  editItem,
  initialKind = 'bill',
  initialDueDate,
  onSaved,
}: AddEditPlannedItemModalProps) {
  const { showToast } = useToast();
  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');
  const paymentMethods = usePaymentMethods();
  const persons = usePersons();

  const [kind, setKind] = useState<PlannedItemKind>(initialKind);
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [amountType, setAmountType] = useState<PlannedAmountType>('exact');
  const [dueDate, setDueDate] = useState(today());
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [repeat, setRepeat] = useState<PlannedRepeat>('none');
  const [customDayOfMonth, setCustomDayOfMonth] = useState<number>(1);
  const [reminderDaysBefore, setReminderDaysBefore] = useState<number>(3);
  const [note, setNote] = useState('');
  const [linkedPersonId, setLinkedPersonId] = useState('');
  const [editScope, setEditScope] = useState<'single' | 'series'>('single');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [amountError, setAmountError] = useState(false);

  const activeCategories = kind === 'income_expected' ? incomeCategories : expenseCategories;
  const isActualEdit = Boolean(editItem && editItem.id);

  useEffect(() => {
    if (isOpen) {
      if (editItem && editItem.id) {
        // Editing existing planned item
        setKind(editItem.kind);
        setTitle(editItem.title);
        setAmountStr(String(toRupees(editItem.amount)));
        setAmountType(editItem.amountType);
        setDueDate(editItem.dueDate);
        setCategoryId(editItem.categoryId);
        setPaymentMethodId(editItem.paymentMethodId || '');
        setRepeat(editItem.repeat);
        setCustomDayOfMonth(editItem.customDayOfMonth || 1);
        setReminderDaysBefore(editItem.reminderDaysBefore ?? 3);
        setNote(editItem.note || '');
        setEditScope('single');
      } else {
        // Creating new planned item (possibly prefilled from CanIAffordThis or Calendar)
        setKind(editItem?.kind || initialKind);
        setTitle(editItem?.title || '');
        setAmountStr(editItem?.amount ? String(toRupees(editItem.amount)) : '');
        setAmountType(editItem?.amountType || 'exact');
        setDueDate(editItem?.dueDate || initialDueDate || today());
        setCategoryId(editItem?.categoryId || activeCategories[0]?.id || '');
        setPaymentMethodId(editItem?.paymentMethodId || '');
        setRepeat(editItem?.repeat || (initialKind === 'bill' ? 'monthly' : 'none'));
        setCustomDayOfMonth(
          editItem?.customDayOfMonth ||
          parseInt((editItem?.dueDate || initialDueDate || today()).split('-')[2], 10) || 1
        );
        setReminderDaysBefore(editItem?.reminderDaysBefore ?? 3);
        setNote(editItem?.note || '');
        setLinkedPersonId('');
        setEditScope('single');
      }
      setAmountError(false);
      setDeleteConfirmOpen(false);
    }
  }, [isOpen, editItem, initialKind, initialDueDate]);

  useEffect(() => {
    if (!categoryId && activeCategories.length > 0) {
      setCategoryId(activeCategories[0].id);
    }
  }, [activeCategories, categoryId]);

  const handleSelectPersonForRepayment = (personId: string) => {
    setLinkedPersonId(personId);
    const person = persons.find(p => p.id === personId);
    if (person && !title) {
      setTitle(`Repayment from ${person.name}`);
    }
  };

  const handleSave = async () => {
    const amountVal = parseFloat(amountStr) || 0;
    if (amountVal <= 0) {
      setAmountError(true);
      showToast('Please enter an amount greater than 0');
      return;
    }

    const effectiveCategoryId =
      categoryId || (activeCategories.length > 0 ? activeCategories[0].id : '');

    const selectedCategory = activeCategories.find(c => c.id === effectiveCategoryId);
    const effectiveTitle =
      title.trim() ||
      selectedCategory?.name ||
      (kind === 'income_expected'
        ? 'Expected Income'
        : kind === 'repayment_expected'
        ? 'Expected Repayment'
        : 'Planned Expense');

    const amountPaise = toPaise(amountVal);
    const seriesId = isActualEdit && editItem ? (editItem.seriesId || editItem.id) : uuid();

    if (isActualEdit && editItem) {
      if (editScope === 'series' && editItem.seriesId) {
        // Update all future occurrences in series
        await db.plannedItems
          .where('seriesId')
          .equals(editItem.seriesId)
          .and(p => p.dueDate >= editItem.dueDate && p.status === 'upcoming')
          .modify({
            title: effectiveTitle,
            amount: amountPaise,
            amountType,
            categoryId: effectiveCategoryId,
            paymentMethodId: paymentMethodId || undefined,
            repeat,
            customDayOfMonth: repeat === 'custom_day' ? customDayOfMonth : undefined,
            reminderDaysBefore,
            note: note.trim(),
            updatedAt: Date.now(),
          });
        showToast('Updated this and future occurrences');
      } else {
        // Update only this occurrence
        await db.plannedItems.update(editItem.id, {
          kind,
          title: effectiveTitle,
          amount: amountPaise,
          amountType,
          dueDate,
          categoryId: effectiveCategoryId,
          paymentMethodId: paymentMethodId || undefined,
          repeat,
          customDayOfMonth: repeat === 'custom_day' ? customDayOfMonth : undefined,
          reminderDaysBefore,
          note: note.trim(),
          updatedAt: Date.now(),
        });
        showToast('Planned item updated');
      }
      onSaved?.({
        ...editItem,
        kind,
        title: effectiveTitle,
        amount: amountPaise,
        amountType,
        dueDate,
        categoryId: effectiveCategoryId,
        paymentMethodId: paymentMethodId || undefined,
        repeat,
        customDayOfMonth: repeat === 'custom_day' ? customDayOfMonth : undefined,
        reminderDaysBefore,
        note: note.trim(),
        updatedAt: Date.now(),
      });
    } else {
      // Create new planned item
      const newItem: PlannedItem = {
        id: uuid(),
        kind,
        title: effectiveTitle,
        amount: amountPaise,
        amountType,
        dueDate,
        categoryId: effectiveCategoryId,
        paymentMethodId: paymentMethodId || undefined,
        repeat,
        customDayOfMonth: repeat === 'custom_day' ? customDayOfMonth : undefined,
        reminderDaysBefore,
        note: note.trim(),
        status: 'upcoming',
        seriesId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.plannedItems.add(newItem);

      // If repeating, generate ~3 months ahead of occurrences safely
      if (repeat !== 'none') {
        const threeMonthsDate = new Date(dueDate + 'T00:00:00');
        threeMonthsDate.setMonth(threeMonthsDate.getMonth() + 3);
        const untilDate = threeMonthsDate.toISOString().split('T')[0];
        const existingOccurrences = await db.plannedItems.where('seriesId').equals(seriesId).toArray();
        const existingDates = new Set(existingOccurrences.map(o => o.dueDate));
        existingDates.add(dueDate);

        const futureItems = generateOccurrences(newItem, untilDate, existingDates, () => uuid());
        if (futureItems.length > 0) {
          await db.plannedItems.bulkAdd(futureItems);
        }
      }

      showToast(`Added "${effectiveTitle}" to plan`);
      onSaved?.(newItem);
    }

    onClose();
  };

  const handleDelete = async (deleteEntireSeries: boolean) => {
    if (!editItem) return;

    if (deleteEntireSeries && editItem.seriesId) {
      const items = await db.plannedItems.where('seriesId').equals(editItem.seriesId).toArray();
      await db.plannedItems.bulkDelete(items.map(i => i.id));
      showToast('Deleted recurring series');
    } else {
      await db.plannedItems.delete(editItem.id);
      showToast('Deleted item');
    }

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
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-base font-bold">
                  {isActualEdit ? 'Edit Planned Item' : 'Add Planned Item'}
                </h2>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Kind Selector */}
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                    Item Kind
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'bill', label: 'Bill / Recurring' },
                      { id: 'one_off', label: 'One-off Expense' },
                      { id: 'income_expected', label: 'Expected Income' },
                      { id: 'repayment_expected', label: 'Loan Repayment' },
                    ].map(k => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => {
                          setKind(k.id as PlannedItemKind);
                          if (k.id === 'bill') setRepeat('monthly');
                          else if (k.id === 'one_off') setRepeat('none');
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border text-left ${
                          kind === k.id
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-sm'
                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Repayment Person Selector */}
                {kind === 'repayment_expected' && (
                  <div className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/20">
                    <label className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                      <Users size={12} /> Expected from Person
                    </label>
                    <select
                      value={linkedPersonId}
                      onChange={e => handleSelectPersonForRepayment(e.target.value)}
                      className="w-full py-2 px-3 bg-white dark:bg-gray-800 rounded-lg text-xs font-semibold outline-none border border-amber-200 dark:border-amber-800"
                    >
                      <option value="">Select person (optional)</option>
                      {persons.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Title */}
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Electricity, Netflix, Flat Rent, Salary"
                    className="w-full px-3.5 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>

                {/* Amount & Amount Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Amount (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={amountStr}
                      onChange={e => {
                        setAmountStr(e.target.value);
                        if (amountError) setAmountError(false);
                      }}
                      placeholder="0.00"
                      className={`w-full px-3.5 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-base font-bold outline-none focus:ring-2 focus:ring-indigo-500/30 ${
                        amountError ? 'ring-2 ring-red-500 border border-red-500' : ''
                      }`}
                    />
                    {amountError && (
                      <p className="text-[10px] text-red-500 font-bold mt-1">Please enter an amount</p>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                      Amount Type
                    </label>
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 h-[42px] items-center">
                      {(['exact', 'estimate'] as PlannedAmountType[]).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAmountType(t)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                            amountType === t
                              ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                              : 'text-gray-500'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Due Date & Reminder Days */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                      <Calendar size={12} /> Due Date
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-semibold outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                      <Bell size={12} /> Remind Before
                    </label>
                    <select
                      value={reminderDaysBefore}
                      onChange={e => setReminderDaysBefore(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-semibold outline-none"
                    >
                      <option value={1}>1 day before</option>
                      <option value={2}>2 days before</option>
                      <option value={3}>3 days before (default)</option>
                      <option value={5}>5 days before</option>
                      <option value={7}>7 days before</option>
                    </select>
                  </div>
                </div>

                {/* Category Picker */}
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                    <Tag size={12} /> Category
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {activeCategories.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryId(cat.id)}
                        className={`flex items-center gap-1.5 p-2 rounded-xl text-xs font-medium text-left truncate transition-all ${
                          categoryId === cat.id
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/40'
                            : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100'
                        }`}
                      >
                        <DynamicIcon name={cat.icon} size={14} style={{ color: cat.color }} />
                        <span className="truncate">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Repeat Frequency */}
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                    <Repeat size={12} /> Repeat Schedule
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'none', label: 'None' },
                      { id: 'weekly', label: 'Weekly' },
                      { id: 'monthly', label: 'Monthly' },
                      { id: 'yearly', label: 'Yearly' },
                      { id: 'custom_day', label: 'Custom Day' },
                    ].map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRepeat(r.id as PlannedRepeat)}
                        className={`py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all border ${
                          repeat === r.id
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-600 dark:text-indigo-400 shadow-sm'
                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>

                  {repeat === 'custom_day' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Day of month:</span>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={customDayOfMonth}
                        onChange={e => setCustomDayOfMonth(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                        className="w-16 px-2 py-1 text-center bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-bold outline-none"
                      />
                      <span className="text-[11px] text-gray-400">(Short months clamp to last day)</span>
                    </div>
                  )}
                </div>

                {/* Payment Method (Optional) */}
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <CreditCard size={12} /> Expected Payment Method (Optional)
                  </label>
                  <select
                    value={paymentMethodId}
                    onChange={e => setPaymentMethodId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-semibold outline-none"
                  >
                    <option value="">No specific method</option>
                    {paymentMethods.map(pm => (
                      <option key={pm.id} value={pm.id}>
                        {pm.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Note */}
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <FileText size={12} /> Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="e.g. Account number, consumer ID, or reminder details"
                    className="w-full px-3.5 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>

                {/* Edit Series Scope (if editing recurring item) */}
                {isActualEdit && editItem?.seriesId && (
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300 mb-1.5">
                      Recurring Item Changes
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditScope('single')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          editScope === 'single'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        Only this occurrence
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditScope('series')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          editScope === 'series'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        All future occurrences
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  {isActualEdit && (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmOpen(true)}
                      className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex-1 py-3 rounded-xl gradient-primary text-white font-bold text-sm shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
                  >
                    {isActualEdit ? 'Save Changes' : 'Add to Plan'}
                  </button>
                </div>

                {/* Delete Confirmation Modal / Banner */}
                {deleteConfirmOpen && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800 space-y-2 mt-2">
                    <p className="text-xs font-bold text-red-700 dark:text-red-300">
                      Delete this planned item?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(false)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white"
                      >
                        Delete this occurrence
                      </button>
                      {editItem?.seriesId && (
                        <button
                          type="button"
                          onClick={() => handleDelete(true)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-red-800 text-white"
                        >
                          Delete entire series
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmOpen(false)}
                        className="py-1.5 px-3 rounded-lg text-xs font-bold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
