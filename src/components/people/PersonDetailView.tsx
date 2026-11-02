import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Archive,
  Trash2,
  Phone,
  AtSign,
  Calendar,
  Clock,
  Copy,
  AlertCircle,
} from 'lucide-react';
import { db } from '../../db';
import { formatINR, toRupees } from '../../utils/money';
import { formatDate } from '../../utils/date';
import { useToast } from '../../contexts/ToastContext';
import {
  computePersonBalance,
  calculateFifoEntryStatuses,
  getPersonInitials,
} from '../../utils/peopleLedger';
import type { Person, LedgerEntry, Settlement } from '../../types';
import LendBorrowSheet from './LendBorrowSheet';
import SettleSheet from './SettleSheet';
import AddPersonModal from './AddPersonModal';

interface PersonDetailViewProps {
  person: Person;
  entries: LedgerEntry[];
  settlements: Settlement[];
  onBack: () => void;
  onPersonUpdated: () => void;
}

export default function PersonDetailView({
  person,
  entries,
  settlements,
  onBack,
  onPersonUpdated,
}: PersonDetailViewProps) {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLendBorrowSheet, setShowLendBorrowSheet] = useState(false);
  const [showSettleSheet, setShowSettleSheet] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<LedgerEntry | null>(null);
  const [showDeletePersonBlocked, setShowDeletePersonBlocked] = useState(false);
  const [showDeletePersonConfirm, setShowDeletePersonConfirm] = useState(false);

  // Derived balance & FIFO statuses
  const balanceSummary = useMemo(
    () => computePersonBalance(person.id, entries, settlements),
    [person.id, entries, settlements]
  );

  const fifo = useMemo(
    () => calculateFifoEntryStatuses(entries, settlements),
    [entries, settlements]
  );

  // Unified chronological timeline (entries + settlements combined, newest first)
  const timelineItems = useMemo(() => {
    type TimelineItem =
      | { type: 'entry'; data: typeof fifo.entries[0]; timestamp: number }
      | { type: 'settlement'; data: Settlement; timestamp: number };

    const list: TimelineItem[] = [];

    fifo.entries.forEach(item => {
      list.push({
        type: 'entry',
        data: item,
        timestamp: item.entry.createdAt || new Date(item.entry.date).getTime(),
      });
    });

    settlements
      .filter(s => s.personId === person.id)
      .forEach(s => {
        list.push({
          type: 'settlement',
          data: s,
          timestamp: s.createdAt || new Date(s.date).getTime(),
        });
      });

    // Sort newest first
    list.sort((a, b) => {
      const dateA = a.type === 'entry' ? a.data.entry.date : a.data.date;
      const dateB = b.type === 'entry' ? b.data.entry.date : b.data.date;
      return dateB.localeCompare(dateA) || b.timestamp - a.timestamp;
    });

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return list.filter(item => {
        if (item.type === 'entry') {
          return (
            item.data.entry.note.toLowerCase().includes(q) ||
            String(toRupees(item.data.entry.amount)).includes(q)
          );
        } else {
          return (
            item.data.note.toLowerCase().includes(q) ||
            String(toRupees(item.data.amount)).includes(q) ||
            item.data.method.toLowerCase().includes(q)
          );
        }
      });
    }

    return list;
  }, [fifo, settlements, person.id, search]);

  const handleDeletePerson = async () => {
    if (balanceSummary.netPaise !== 0) {
      setShowDeletePersonBlocked(true);
      return;
    }
    // Delete person & unlinked ledger items
    await db.persons.delete(person.id);
    showToast(`Deleted ${person.name}`);
    onBack();
  };

  const handleArchivePerson = async () => {
    await db.persons.update(person.id, { archived: !person.archived });
    showToast(person.archived ? `Restored ${person.name}` : `Archived ${person.name}`);
    onPersonUpdated();
  };

  const handleDeleteEntry = async (entry: LedgerEntry) => {
    await db.ledgerEntries.delete(entry.id);
    showToast('Entry deleted', {
      onUndo: async () => {
        await db.ledgerEntries.add(entry);
      },
    });
    setEntryToDelete(null);
  };

  const handleCopyUpi = () => {
    if (person.upiId) {
      navigator.clipboard?.writeText(person.upiId);
      showToast(`Copied UPI: ${person.upiId}`);
    }
  };

  return (
    <div className="pb-12">
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-20 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-md px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors flex items-center gap-1 text-sm font-semibold"
        >
          <ArrowLeft size={18} /> People
        </button>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          >
            <MoreVertical size={18} />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 z-30 py-1.5 overflow-hidden">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowEditModal(true);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-semibold flex items-center gap-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Edit2 size={15} /> Edit Details
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    handleArchivePerson();
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-semibold flex items-center gap-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Archive size={15} /> {person.archived ? 'Restore' : 'Archive Person'}
                </button>
                <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />
                <button
                  onClick={() => {
                    setShowMenu(false);
                    if (balanceSummary.netPaise !== 0) {
                      setShowDeletePersonBlocked(true);
                    } else {
                      setShowDeletePersonConfirm(true);
                    }
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-semibold flex items-center gap-2.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 size={15} /> Delete Person
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Person Header Card */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm text-center">
          <div
            className="w-16 h-16 rounded-3xl flex items-center justify-center font-bold text-white text-xl mx-auto shadow-md"
            style={{ backgroundColor: person.color }}
          >
            {getPersonInitials(person.name)}
          </div>

          <h2 className="text-xl font-bold mt-3 text-gray-900 dark:text-white">
            {person.name}
          </h2>
          {person.nickname && (
            <p className="text-xs text-gray-400 font-medium">"{person.nickname}"</p>
          )}

          {/* Label chip & contact badges */}
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              {person.label}
            </span>
            {person.phone && (
              <a
                href={`tel:${person.phone}`}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Phone size={11} /> {person.phone}
              </a>
            )}
            {person.upiId && (
              <button
                onClick={handleCopyUpi}
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 hover:opacity-80"
                title="Tap to copy UPI"
              >
                <AtSign size={11} /> {person.upiId} <Copy size={10} />
              </button>
            )}
          </div>

          {/* Big Net Balance Display */}
          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Net Balance
            </p>
            <div className="mt-1">
              <span
                className={`text-3xl sm:text-4xl font-extrabold ${
                  balanceSummary.netPaise > 0
                    ? 'text-emerald-500'
                    : balanceSummary.netPaise < 0
                    ? 'text-rose-500'
                    : 'text-gray-400'
                }`}
              >
                {formatINR(Math.abs(balanceSummary.netPaise))}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mt-1">
              {balanceSummary.displayDirection === 'owes_me'
                ? `${person.nickname || person.name} owes you`
                : balanceSummary.displayDirection === 'i_owe'
                ? `You owe ${person.nickname || person.name}`
                : 'All settled up ✨'}
            </p>

            {balanceSummary.oldestUnsettledDays !== null && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">
                Oldest open entry: {balanceSummary.oldestUnsettledDays} days ago
              </p>
            )}

            {balanceSummary.futurePendingPaise !== 0 && (
              <p className="text-xs text-indigo-500 font-medium mt-1">
                {formatINR(Math.abs(balanceSummary.futurePendingPaise))} scheduled for future dates
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <button
              onClick={() => setShowSettleSheet(true)}
              disabled={balanceSummary.netPaise === 0}
              className="py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 transition-all active:scale-95"
            >
              <CheckCircle2 size={16} /> Settle Up
            </button>

            <button
              onClick={() => setShowLendBorrowSheet(true)}
              className="py-3 px-4 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-500/25 transition-all active:scale-95"
            >
              <Plus size={16} /> Lend / Borrow
            </button>
          </div>
        </div>

        {/* Timeline & History Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              History & Timeline
            </h3>
            <span className="text-xs text-gray-400 font-medium">
              {timelineItems.length} item{timelineItems.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Search Bar */}
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes or amount..."
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          {timelineItems.length === 0 ? (
            <div className="text-center py-10 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6">
              <Calendar size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-xs font-semibold text-gray-500">No transactions recorded</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Use "Lend / Borrow" or split an expense in Quick Add
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {timelineItems.map(item => {
                if (item.type === 'entry') {
                  const { entry, status, remainingPaise } = item.data;
                  const isTheyOwe = entry.direction === 'they_owe_me';

                  return (
                    <motion.div
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 hover:border-gray-200 transition-all cursor-pointer"
                      onClick={() => setEditingEntry(entry)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                              isTheyOwe
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-500'
                                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-500'
                            }`}
                          >
                            {isTheyOwe ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-gray-900 dark:text-white">
                                {isTheyOwe ? 'You Lent / Paid' : 'They Lent / Paid'}
                              </span>
                              {/* Status Chip */}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  status === 'settled'
                                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                                    : status === 'partly_settled'
                                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                                }`}
                              >
                                {status === 'settled'
                                  ? 'Settled'
                                  : status === 'partly_settled'
                                  ? `Partly Settled (${formatINR(remainingPaise)} left)`
                                  : 'Open'}
                              </span>
                            </div>

                            <p className="text-xs text-gray-600 dark:text-gray-300 font-medium mt-0.5">
                              {entry.note}
                            </p>

                            <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-1">
                              <span>{formatDate(entry.date)}</span>
                              {entry.dueDate && (
                                <span className="flex items-center gap-1 text-amber-500">
                                  <Clock size={11} /> Due: {formatDate(entry.dueDate)}
                                </span>
                              )}
                              {entry.kind === 'shared_purchase' && (
                                <span className="text-indigo-400 font-semibold">Shared spend</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span
                              className={`text-sm font-bold ${
                                isTheyOwe ? 'text-emerald-500' : 'text-rose-500'
                              }`}
                            >
                              {isTheyOwe ? '+' : '-'}{formatINR(entry.amount)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setEntryToDelete(entry);
                            }}
                            className="p-1 rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete entry"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                } else {
                  // Settlement Item
                  const s = item.data;
                  const isTheyPaid = s.direction === 'they_paid_me';

                  return (
                    <motion.div
                      key={s.id}
                      layout
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl p-3.5 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                          <CheckCircle2 size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                              {isTheyPaid ? 'Payment Received' : 'Payment Sent'}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-emerald-600 px-1.5 py-0.2 bg-emerald-100/60 dark:bg-emerald-900/60 rounded">
                              {s.method}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {s.note} · {formatDate(s.date)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                          {formatINR(s.amount)}
                        </span>
                      </div>
                    </motion.div>
                  );
                }
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit Entry Modal / Delete confirm */}
      {editingEntry && (
        <LendBorrowSheet
          isOpen={Boolean(editingEntry)}
          onClose={() => setEditingEntry(null)}
          people={[person]}
          preselectedPersonId={person.id}
          editEntry={editingEntry}
          onSaved={() => onPersonUpdated()}
        />
      )}

      {/* Lend / Borrow Sheet */}
      <LendBorrowSheet
        isOpen={showLendBorrowSheet}
        onClose={() => setShowLendBorrowSheet(false)}
        people={[person]}
        preselectedPersonId={person.id}
        onSaved={() => onPersonUpdated()}
      />

      {/* Settle Sheet */}
      <SettleSheet
        isOpen={showSettleSheet}
        onClose={() => setShowSettleSheet(false)}
        person={person}
        netPaise={balanceSummary.netPaise}
        onSettled={() => onPersonUpdated()}
      />

      {/* Edit Person Modal */}
      <AddPersonModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        personToEdit={person}
        onPersonSaved={() => onPersonUpdated()}
      />

      {/* Block Delete Modal (when balance is not zero) */}
      <AnimatePresence>
        {showDeletePersonBlocked && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setShowDeletePersonBlocked(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center mx-auto mb-3">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-base font-bold text-center text-gray-900 dark:text-white mb-2">
                Cannot Delete with Open Balance
              </h3>
              <p className="text-xs text-gray-500 text-center leading-relaxed mb-5">
                {person.name} has an open balance of{' '}
                <strong>{formatINR(Math.abs(balanceSummary.netPaise))}</strong>.
                Please settle the balance or archive the person instead to preserve accounting history.
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowDeletePersonBlocked(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowDeletePersonBlocked(false);
                    handleArchivePerson();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-xs font-semibold hover:bg-indigo-600"
                >
                  Archive Instead
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Entry Confirm */}
      <AnimatePresence>
        {entryToDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setEntryToDelete(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <h3 className="text-base font-bold text-center text-gray-900 dark:text-white mb-2">
                Delete entry?
              </h3>
              <p className="text-xs text-gray-500 text-center leading-relaxed mb-5">
                "{entryToDelete.note}" · {formatINR(entryToDelete.amount)}. This will recalculate the balance.
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setEntryToDelete(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteEntry(entryToDelete)}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Person Confirm (when balance is 0) */}
      <AnimatePresence>
        {showDeletePersonConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setShowDeletePersonConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <h3 className="text-base font-bold text-center text-gray-900 dark:text-white mb-2">
                Delete {person.name}?
              </h3>
              <p className="text-xs text-gray-500 text-center leading-relaxed mb-5">
                All balance with {person.name} is settled. This will remove this person from your list.
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowDeletePersonConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeletePerson}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
