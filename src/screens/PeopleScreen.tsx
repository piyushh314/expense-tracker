import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, CheckCircle2, Plus, ArrowUpRight, ArrowDownLeft, X, UserPlus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { formatINR, toPaise } from '../utils/money';
import { formatDate, today } from '../utils/date';
import { useToast } from '../contexts/ToastContext';
import { computePersonBalance, getPersonAvatarColor } from '../utils/peopleLedger';
import type { Person, LedgerEntry, Settlement } from '../types';

export default function PeopleScreen() {
  const { showToast } = useToast();
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');

  // Add ledger entry states
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDirection, setEntryDirection] = useState<'they_owe_me' | 'i_owe_them'>('they_owe_me');

  const persons = useLiveQuery(() => db.persons.toArray()) ?? [];
  const ledgerEntries = useLiveQuery(() => db.ledgerEntries.toArray()) ?? [];
  const settlements = useLiveQuery(() => db.settlements.toArray()) ?? [];

  // Group balances per person using pure accounting utility
  const balances = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePersonBalance>>();
    persons.forEach(p => {
      map.set(p.id, computePersonBalance(p.id, ledgerEntries, settlements));
    });
    return map;
  }, [persons, ledgerEntries, settlements]);

  // Overall totals
  const overallOwedToMe = useMemo(() => {
    let sum = 0;
    balances.forEach(b => {
      if (b.netPaise > 0) sum += b.netPaise;
    });
    return sum;
  }, [balances]);

  const overallIOwe = useMemo(() => {
    let sum = 0;
    balances.forEach(b => {
      if (b.netPaise < 0) sum += Math.abs(b.netPaise);
    });
    return sum;
  }, [balances]);

  const handleAddPerson = async () => {
    if (!newPersonName.trim()) return;
    const person: Person = {
      id: uuid(),
      name: newPersonName.trim(),
      label: 'Friend',
      color: getPersonAvatarColor(newPersonName.trim()),
      archived: false,
      createdAt: Date.now(),
    };
    await db.persons.add(person);
    setNewPersonName('');
    setShowAddPersonModal(false);
    showToast(`${person.name} added`);
  };

  const handleAddManualEntry = async () => {
    const paise = toPaise(parseFloat(entryAmount) || 0);
    if (paise <= 0 || !selectedPersonId) return;

    const entry: LedgerEntry = {
      id: uuid(),
      personId: selectedPersonId,
      direction: entryDirection,
      kind: 'loan',
      amount: paise,
      date: today(),
      note: 'Manual loan / owed entry',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.ledgerEntries.add(entry);
    setEntryAmount('');
    setShowAddEntryModal(false);
    showToast('Ledger entry added');
  };

  const handleSettleAll = async (personId: string) => {
    const b = balances.get(personId);
    if (!b || b.netPaise === 0) return;

    const settlement: Settlement = {
      id: uuid(),
      personId,
      direction: b.netPaise > 0 ? 'they_paid_me' : 'i_paid_them',
      amount: Math.abs(b.netPaise),
      date: today(),
      method: 'upi',
      note: 'Full settlement',
      createdAt: Date.now(),
    };
    await db.settlements.add(settlement);
    const person = persons.find(p => p.id === personId);
    showToast(`Settled with ${person?.name || 'person'}`);
  };

  return (
    <div className="pb-8 px-4 space-y-4">
      <div className="pt-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Split & Owed Money</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Track who owes whom with friends & roommates</p>
        </div>
        <button onClick={() => setShowAddPersonModal(true)}
          className="p-2.5 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-md">
          <UserPlus size={16} /> Add Friend
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-900">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <ArrowDownLeft size={16} />
            <span className="text-xs font-semibold">You are owed</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{formatINR(overallOwedToMe)}</p>
        </div>
        <div className="bg-rose-50 dark:bg-rose-950/30 rounded-2xl p-4 border border-rose-100 dark:border-rose-900">
          <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
            <ArrowUpRight size={16} />
            <span className="text-xs font-semibold">You owe</span>
          </div>
          <p className="text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1">{formatINR(overallIOwe)}</p>
        </div>
      </div>

      {/* Action to log quick split */}
      <div className="flex gap-2">
        <button onClick={() => setShowAddEntryModal(true)}
          className="flex-1 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 text-gray-700 dark:text-gray-300 hover:border-indigo-400 transition-colors">
          <Plus size={14} /> Log Owed Amount
        </button>
      </div>

      {/* People Ledger List */}
      <div>
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Friends Balance</h2>
        {persons.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <Users size={32} className="mx-auto text-gray-400 mb-2" />
            <p className="font-semibold text-sm">No people added yet</p>
            <p className="text-xs text-gray-500 mt-1 mb-4">Add your friends or roommates to track split expenses</p>
            <button onClick={() => setShowAddPersonModal(true)}
              className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-semibold">
              Add First Friend
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {persons.map(person => {
              const b = balances.get(person.id) || {
                netPaise: 0,
                displayDirection: 'settled',
                theyOweMePaise: 0,
                iOweThemPaise: 0,
                oldestUnsettledDays: null,
                oldestUnsettledDate: null,
                futurePendingPaise: 0,
              };
              const personEntries = ledgerEntries.filter(e => e.personId === person.id);

              return (
                <div key={person.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-gray-900 dark:text-white">{person.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {b.oldestUnsettledDays !== null ? `Oldest open: ${b.oldestUnsettledDays} days ago` : 'All settled ✨'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-base font-bold ${
                        b.netPaise > 0 ? 'text-emerald-500' : b.netPaise < 0 ? 'text-rose-500' : 'text-gray-400'
                      }`}>
                        {b.netPaise > 0 ? `+${formatINR(b.netPaise)}` : b.netPaise < 0 ? `-${formatINR(Math.abs(b.netPaise))}` : '₹0'}
                      </p>
                      <p className="text-[10px] text-gray-400 font-medium">
                        {b.netPaise > 0 ? 'owes you' : b.netPaise < 0 ? 'you owe' : 'settled'}
                      </p>
                    </div>
                  </div>

                  {/* Actions for this person */}
                  {b.netPaise !== 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                      <button onClick={() => handleSettleAll(person.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition-colors">
                        <CheckCircle2 size={14} /> Settle Up
                      </button>
                    </div>
                  )}

                  {/* Recent entries list */}
                  {personEntries.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {personEntries.slice(0, 3).map(entry => (
                        <div key={entry.id}
                          className="text-xs p-2 rounded-xl flex items-center justify-between bg-gray-100/70 dark:bg-gray-800">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {entry.direction === 'they_owe_me' ? 'Owed to you' : 'You owe'}
                            </span>
                            <span className="text-[10px] text-gray-400">({formatDate(entry.date)})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${entry.direction === 'they_owe_me' ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {formatINR(entry.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Person Modal */}
      <AnimatePresence>
        {showAddPersonModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setShowAddPersonModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold">Add Friend</h3>
                <button onClick={() => setShowAddPersonModal(false)}><X size={18} /></button>
              </div>
              <input type="text" value={newPersonName} onChange={e => setNewPersonName(e.target.value)}
                placeholder="Friend's Name (e.g. Rahul)" autoFocus
                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 mb-4" />
              <div className="flex gap-2">
                <button onClick={() => setShowAddPersonModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold">Cancel</button>
                <button onClick={handleAddPerson}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-xs font-semibold hover:bg-indigo-600">Add</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Manual Ledger Entry Modal */}
      <AnimatePresence>
        {showAddEntryModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setShowAddEntryModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">Log Owed Amount</h3>
                <button onClick={() => setShowAddEntryModal(false)}><X size={18} /></button>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Friend</label>
                <select value={selectedPersonId} onChange={e => setSelectedPersonId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm font-medium outline-none">
                  <option value="">Select a friend</option>
                  {persons.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Direction</label>
                <div className="flex gap-2">
                  <button onClick={() => setEntryDirection('they_owe_me')}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
                      entryDirection === 'they_owe_me' ? 'bg-emerald-500 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600'
                    }`}>
                    They owe me
                  </button>
                  <button onClick={() => setEntryDirection('i_owe_them')}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold ${
                      entryDirection === 'i_owe_them' ? 'bg-rose-500 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600'
                    }`}>
                    I owe them
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Amount (₹)</label>
                <input type="number" value={entryAmount} onChange={e => setEntryAmount(e.target.value)}
                  placeholder="350" autoFocus
                  className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowAddEntryModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold">Cancel</button>
                <button onClick={handleAddManualEntry} disabled={!selectedPersonId || !entryAmount}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-xs font-semibold hover:bg-indigo-600 disabled:opacity-40">Save</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
