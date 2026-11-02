import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  UserPlus,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatINR } from '../utils/money';
import { computePersonBalance, getPersonInitials } from '../utils/peopleLedger';
import type { Person } from '../types';
import PersonDetailView from '../components/people/PersonDetailView';
import AddPersonModal from '../components/people/AddPersonModal';
import LendBorrowSheet from '../components/people/LendBorrowSheet';

type FilterType = 'all' | 'owes_me' | 'i_owe' | 'settled';
type SortType = 'biggest' | 'oldest' | 'name';

export default function PeopleScreen() {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [showLendBorrowSheet, setShowLendBorrowSheet] = useState(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('biggest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showSettledAccordion, setShowSettledAccordion] = useState(false);

  // Live queries from Dexie
  const people: Person[] = useLiveQuery(() => db.persons.toArray()) ?? [];
  const entries = useLiveQuery(() => db.ledgerEntries.toArray()) ?? [];
  const settlements = useLiveQuery(() => db.settlements.toArray()) ?? [];

  // Compute derived balances for all people
  const balancesMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePersonBalance>>();
    people.forEach(p => {
      map.set(p.id, computePersonBalance(p.id, entries, settlements));
    });
    return map;
  }, [people, entries, settlements]);

  // Overall totals across all people
  const { totalOwedToMe, totalIOwe, netTotal } = useMemo(() => {
    let owedToMe = 0;
    let iOwe = 0;
    balancesMap.forEach(b => {
      if (b.netPaise > 0) owedToMe += b.netPaise;
      else if (b.netPaise < 0) iOwe += Math.abs(b.netPaise);
    });
    return {
      totalOwedToMe: owedToMe,
      totalIOwe: iOwe,
      netTotal: owedToMe - iOwe,
    };
  }, [balancesMap]);

  // Active people (unsettled or recently active) vs fully settled
  const { activePeople, settledPeople } = useMemo(() => {
    let list = people.filter(p => !p.archived);

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.nickname?.toLowerCase().includes(q) ||
          p.label.toLowerCase().includes(q)
      );
    }

    // Filter
    if (filter === 'owes_me') {
      list = list.filter(p => (balancesMap.get(p.id)?.netPaise ?? 0) > 0);
    } else if (filter === 'i_owe') {
      list = list.filter(p => (balancesMap.get(p.id)?.netPaise ?? 0) < 0);
    } else if (filter === 'settled') {
      list = list.filter(p => (balancesMap.get(p.id)?.netPaise ?? 0) === 0);
    }

    // Sort function
    list.sort((a, b) => {
      const balA = balancesMap.get(a.id);
      const balB = balancesMap.get(b.id);
      if (sort === 'biggest') {
        const absA = Math.abs(balA?.netPaise ?? 0);
        const absB = Math.abs(balB?.netPaise ?? 0);
        return absB - absA;
      }
      if (sort === 'oldest') {
        const daysA = balA?.oldestUnsettledDays ?? -1;
        const daysB = balB?.oldestUnsettledDays ?? -1;
        return daysB - daysA;
      }
      return a.name.localeCompare(b.name);
    });

    if (filter === 'all') {
      const active = list.filter(p => (balancesMap.get(p.id)?.netPaise ?? 0) !== 0);
      const settled = list.filter(p => (balancesMap.get(p.id)?.netPaise ?? 0) === 0);
      return { activePeople: active, settledPeople: settled };
    }

    return { activePeople: list, settledPeople: [] };
  }, [people, balancesMap, search, filter, sort]);

  // Selected person for detail view
  const activePerson = useMemo(
    () => people.find(p => p.id === selectedPersonId) || null,
    [people, selectedPersonId]
  );

  // If a person is currently selected, render Person Detail View
  if (activePerson) {
    return (
      <PersonDetailView
        person={activePerson}
        entries={entries}
        settlements={settlements}
        onBack={() => setSelectedPersonId(null)}
        onPersonUpdated={() => {}}
      />
    );
  }

  return (
    <div className="pb-12 space-y-4">
      {/* Top Header */}
      <div className="pt-4 px-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">People Ledger</h1>
          <p className="text-xs text-gray-500 font-medium">Track money lent & owed with friends</p>
        </div>

        <button
          onClick={() => setShowAddPersonModal(true)}
          className="py-2.5 px-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all active:scale-95"
        >
          <UserPlus size={16} /> Add Person
        </button>
      </div>

      {/* Top Owed / I Owe Cards */}
      <div className="px-4">
        <div className="grid grid-cols-2 gap-3">
          {/* You are owed card */}
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-3xl p-4 border border-emerald-100 dark:border-emerald-900/60 shadow-sm">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <ArrowDownLeft size={16} />
              <span className="text-xs font-bold tracking-wide uppercase">You are owed</span>
            </div>
            <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1.5">
              {formatINR(totalOwedToMe)}
            </p>
          </div>

          {/* You owe card */}
          <div className="bg-rose-50 dark:bg-rose-950/30 rounded-3xl p-4 border border-rose-100 dark:border-rose-900/60 shadow-sm">
            <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
              <ArrowUpRight size={16} />
              <span className="text-xs font-bold tracking-wide uppercase">You owe</span>
            </div>
            <p className="text-2xl font-extrabold text-rose-700 dark:text-rose-300 mt-1.5">
              {formatINR(totalIOwe)}
            </p>
          </div>
        </div>

        {/* Net banner below */}
        {(totalOwedToMe > 0 || totalIOwe > 0) && (
          <div className="mt-2.5 px-4 py-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
            <span className="text-gray-500 font-medium">Net balance across all people:</span>
            <span
              className={`font-bold ${
                netTotal > 0
                  ? 'text-emerald-500'
                  : netTotal < 0
                  ? 'text-rose-500'
                  : 'text-gray-400'
              }`}
            >
              {netTotal > 0
                ? `+${formatINR(netTotal)} (in your favor)`
                : netTotal < 0
                ? `-${formatINR(Math.abs(netTotal))} (you owe net)`
                : 'Balanced ₹0'}
            </span>
          </div>
        )}
      </div>

      {/* Quick Action: Lend / Borrow standalone button */}
      <div className="px-4">
        <button
          onClick={() => setShowLendBorrowSheet(true)}
          disabled={people.length === 0}
          className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.99]"
        >
          <Plus size={16} /> Quick Lend or Borrow Money
        </button>
      </div>

      {/* Search, Filter & Sort Bar */}
      <div className="px-4 space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, label..."
              className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500/30 text-gray-900 dark:text-white"
            />
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="p-2.5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-colors flex items-center gap-1 text-xs font-semibold"
            >
              <ArrowUpDown size={15} />
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 z-30 py-1.5 overflow-hidden">
                  {(
                    [
                      ['biggest', 'Biggest Amount'],
                      ['oldest', 'Oldest Open'],
                      ['name', 'Alphabetical'],
                    ] as [SortType, string][]
                  ).map(([s, label]) => (
                    <button
                      key={s}
                      onClick={() => {
                        setSort(s);
                        setShowSortMenu(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-xs transition-colors ${
                        sort === s
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 font-bold'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pt-1">
          {(
            [
              ['all', 'All Active'],
              ['owes_me', 'Owes Me'],
              ['i_owe', 'I Owe'],
              ['settled', 'Settled'],
            ] as [FilterType, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                filter === f
                  ? 'bg-indigo-500 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* People List */}
      <div className="px-4 space-y-2">
        {people.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
            <div className="w-14 h-14 rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center mx-auto mb-3 shadow-md shadow-indigo-500/10">
              <Users size={28} />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              No people added yet
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto leading-relaxed mb-5">
              Track money lent to or borrowed from roommates, friends, and family without cluttering your spending totals.
            </p>
            <button
              onClick={() => setShowAddPersonModal(true)}
              className="py-3 px-5 rounded-2xl bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 hover:bg-indigo-600 transition-all active:scale-95"
            >
              Add First Person
            </button>
          </div>
        ) : activePeople.length === 0 && (filter !== 'all' || settledPeople.length === 0) ? (
          <div className="text-center py-10 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6">
            <p className="text-xs font-semibold text-gray-500">No people match this filter</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activePeople.map(person => {
              const b = balancesMap.get(person.id);
              const netPaise = b?.netPaise ?? 0;
              const isTheyOwe = netPaise > 0;
              const isIOwe = netPaise < 0;

              return (
                <motion.div
                  key={person.id}
                  layout
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelectedPersonId(person.id)}
                  className="bg-white dark:bg-gray-900 rounded-3xl p-4 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-all cursor-pointer shadow-sm group"
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Avatar + Name + Label */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white text-sm shrink-0 shadow-sm"
                        style={{ backgroundColor: person.color }}
                      >
                        {getPersonInitials(person.name)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                            {person.name}
                          </h3>
                          {person.nickname && (
                            <span className="text-xs text-gray-400 font-medium">
                              ({person.nickname})
                            </span>
                          )}
                          <span className="px-2 py-0.2 rounded-md text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500">
                            {person.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                          {b && b.oldestUnsettledDays !== null ? (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                              <Clock size={11} />
                              Oldest: {b.oldestUnsettledDays}d ago
                            </span>
                          ) : (
                            <span>All caught up</span>
                          )}
                          {b?.futurePendingPaise !== 0 && (
                            <span className="text-indigo-400">· Future scheduled</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Balance + Direction */}
                    <div className="text-right shrink-0">
                      <p
                        className={`text-base font-extrabold ${
                          isTheyOwe
                            ? 'text-emerald-500'
                            : isIOwe
                            ? 'text-rose-500'
                            : 'text-gray-400'
                        }`}
                      >
                        {isTheyOwe ? '+' : isIOwe ? '-' : ''}
                        {formatINR(Math.abs(netPaise))}
                      </p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                        {isTheyOwe ? 'owes you' : isIOwe ? 'you owe' : 'settled'}
                      </p>
                    </div>

                    <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Collapsible Settled People Section */}
        {filter === 'all' && settledPeople.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setShowSettledAccordion(!showSettledAccordion)}
              className="w-full py-2.5 px-4 rounded-2xl bg-gray-100/70 dark:bg-gray-800/60 hover:bg-gray-200/70 text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-500" />
                All Settled ({settledPeople.length})
              </span>
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 ${
                  showSettledAccordion ? 'rotate-180' : ''
                }`}
              />
            </button>

            <AnimatePresence>
              {showSettledAccordion && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-1.5 pt-2 overflow-hidden"
                >
                  {settledPeople.map(person => (
                    <div
                      key={person.id}
                      onClick={() => setSelectedPersonId(person.id)}
                      className="bg-white/60 dark:bg-gray-900/60 rounded-2xl p-3 border border-gray-100 dark:border-gray-800 flex items-center justify-between cursor-pointer hover:bg-white dark:hover:bg-gray-900 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white text-xs opacity-80"
                          style={{ backgroundColor: person.color }}
                        >
                          {getPersonInitials(person.name)}
                        </div>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {person.name}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-gray-400">Settled (₹0)</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Add Person Modal */}
      <AddPersonModal
        isOpen={showAddPersonModal}
        onClose={() => setShowAddPersonModal(false)}
        onPersonSaved={p => {
          setSelectedPersonId(p.id);
        }}
      />

      {/* Lend / Borrow Sheet */}
      <LendBorrowSheet
        isOpen={showLendBorrowSheet}
        onClose={() => setShowLendBorrowSheet(false)}
        people={people}
      />
    </div>
  );
}
