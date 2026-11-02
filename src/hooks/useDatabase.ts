// ============================================================
// Custom hooks for database queries
// ============================================================
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { TransactionFilter, DateRange, Person } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { getCurrentMonth, getPreviousMonth } from '../utils/date';
import { computePersonBalance } from '../utils/peopleLedger';

export function useCategories(type?: 'expense' | 'income') {
  return useLiveQuery(async () => {
    let query = db.categories.orderBy('order');
    const all = await query.toArray();
    if (type) return all.filter(c => c.type === type && !c.archived);
    return all.filter(c => !c.archived);
  }, [type]) ?? [];
}

export function useAllCategories() {
  return useLiveQuery(() => db.categories.orderBy('order').toArray()) ?? [];
}

export function usePaymentMethods() {
  return useLiveQuery(
    () => db.paymentMethods.orderBy('order').filter(m => !m.archived).toArray()
  ) ?? [];
}

export function useAllPaymentMethods() {
  return useLiveQuery(() => db.paymentMethods.orderBy('order').toArray()) ?? [];
}

export function useTransactions(filter?: Partial<TransactionFilter>) {
  return useLiveQuery(async () => {
    let collection = db.transactions.orderBy('date');
    let results = await collection.reverse().toArray();

    if (filter) {
      if (filter.dateFrom) results = results.filter(t => t.date >= filter.dateFrom!);
      if (filter.dateTo) results = results.filter(t => t.date <= filter.dateTo!);
      if (filter.categoryIds?.length) results = results.filter(t => filter.categoryIds!.includes(t.categoryId));
      if (filter.paymentMethodIds?.length) results = results.filter(t => filter.paymentMethodIds!.includes(t.paymentMethodId));
      if (filter.tags?.length) results = results.filter(t => filter.tags!.some(tag => t.tags.includes(tag)));
      if (filter.scope && filter.scope !== 'all') results = results.filter(t => t.scope === filter.scope);
      if (filter.type && filter.type !== 'all') results = results.filter(t => t.type === filter.type);
      if (filter.amountMin !== undefined && filter.amountMin !== null) results = results.filter(t => t.amount >= filter.amountMin!);
      if (filter.amountMax !== undefined && filter.amountMax !== null) results = results.filter(t => t.amount <= filter.amountMax!);
      if (filter.search) {
        const q = filter.search.toLowerCase();
        results = results.filter(t =>
          t.note.toLowerCase().includes(q) ||
          t.tags.some(tag => tag.toLowerCase().includes(q))
        );
      }
    }

    return results;
  }, [filter ? JSON.stringify(filter) : '']) ?? [];
}

export function useTransactionsByDateRange(range: DateRange) {
  return useLiveQuery(async () => {
    return db.transactions
      .where('date')
      .between(range.from, range.to, true, true)
      .toArray();
  }, [range.from, range.to]) ?? [];
}

export function useMonthlyTransactions() {
  const { settings } = useSettings();
  const range = getCurrentMonth(settings.monthStartDay);
  return useTransactionsByDateRange(range);
}

export function usePreviousMonthTransactions() {
  const { settings } = useSettings();
  const range = getPreviousMonth(settings.monthStartDay);
  return useTransactionsByDateRange(range);
}

export function useRecentTransactions(limit: number = 5) {
  return useLiveQuery(async () => {
    return db.transactions.orderBy('createdAt').reverse().limit(limit).toArray();
  }, [limit]) ?? [];
}

export function useAllTags(): string[] {
  return useLiveQuery(async () => {
    const txns = await db.transactions.toArray();
    const tagSet = new Set<string>();
    txns.forEach(t => t.tags.forEach(tag => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }) ?? [];
}

export function useNoteSuggestions(prefix: string): string[] {
  return useLiveQuery(async () => {
    if (!prefix || prefix.length < 2) return [];
    const q = prefix.toLowerCase();
    const txns = await db.transactions
      .filter(t => t.note.toLowerCase().includes(q))
      .limit(50)
      .toArray();
    const notes = new Map<string, number>();
    txns.forEach(t => {
      if (t.note) {
        const count = notes.get(t.note) || 0;
        notes.set(t.note, count + 1);
      }
    });
    return Array.from(notes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([note]) => note);
  }, [prefix]) ?? [];
}

export function useBudgets(period: string) {
  return useLiveQuery(
    () => db.budgets.where('period').equals(period).toArray(),
    [period]
  ) ?? [];
}

export function useRecurringRules() {
  return useLiveQuery(
    () => db.recurringRules.where('active').equals(1).toArray()
  ) ?? [];
}

export function usePersons() {
  return useLiveQuery(() => db.persons.toArray()) ?? [];
}

export function useLedgerEntries(personId?: string) {
  return useLiveQuery(async () => {
    if (personId) {
      return db.ledgerEntries.where('personId').equals(personId).toArray();
    }
    return db.ledgerEntries.toArray();
  }, [personId]) ?? [];
}

export function useSettlements(personId?: string) {
  return useLiveQuery(async () => {
    if (personId) {
      return db.settlements.where('personId').equals(personId).toArray();
    }
    return db.settlements.toArray();
  }, [personId]) ?? [];
}

export function useFrequentPeople() {
  const persons = usePersons();
  const ledgerEntries = useLiveQuery(() => db.ledgerEntries.toArray()) ?? [];
  return useMemo(() => {
    const counts = new Map<string, number>();
    ledgerEntries.forEach(e => counts.set(e.personId, (counts.get(e.personId) || 0) + 1));
    return [...persons]
      .filter(p => !p.archived)
      .sort((a, b) => {
        const ca = counts.get(a.id) || 0;
        const cb = counts.get(b.id) || 0;
        return cb - ca;
      });
  }, [persons, ledgerEntries]);
}

export function useCategoryUsageCount(): Map<string, number> {
  const txns = useLiveQuery(() => db.transactions.toArray()) ?? [];
  const counts = new Map<string, number>();
  txns.forEach(t => {
    counts.set(t.categoryId, (counts.get(t.categoryId) || 0) + 1);
  });
  return counts;
}

export interface UnsettledPersonInfo {
  person: Person;
  netPaise: number;
  oldestUnsettledDays: number | null;
  displayDirection: 'owes_me' | 'i_owe' | 'settled';
}

export function usePeopleLedgerSummary() {
  const people = useLiveQuery(() => db.persons.toArray()) ?? [];
  const entries = useLiveQuery(() => db.ledgerEntries.toArray()) ?? [];
  const settlements = useLiveQuery(() => db.settlements.toArray()) ?? [];

  return useMemo(() => {
    let totalOwedToMe = 0;
    let totalIOwe = 0;
    const balances = new Map<string, ReturnType<typeof computePersonBalance>>();
    const unsettledPeople: UnsettledPersonInfo[] = [];

    people.forEach(p => {
      const b = computePersonBalance(p.id, entries, settlements);
      balances.set(p.id, b);
      if (b.netPaise !== 0) {
        if (b.netPaise > 0) totalOwedToMe += b.netPaise;
        else totalIOwe += Math.abs(b.netPaise);
        if (!p.archived) {
          unsettledPeople.push({
            person: p,
            netPaise: b.netPaise,
            oldestUnsettledDays: b.oldestUnsettledDays,
            displayDirection: b.displayDirection,
          });
        }
      }
    });

    // Sort unsettled people: first by oldest unsettled days descending, then by largest amount
    unsettledPeople.sort((a, b) => {
      const daysA = a.oldestUnsettledDays ?? 0;
      const daysB = b.oldestUnsettledDays ?? 0;
      if (daysB !== daysA) return daysB - daysA;
      return Math.abs(b.netPaise) - Math.abs(a.netPaise);
    });

    return {
      people,
      entries,
      settlements,
      balances,
      totalOwedToMe,
      totalIOwe,
      netTotal: totalOwedToMe - totalIOwe,
      unsettledPeople,
      badgeCount: unsettledPeople.length,
    };
  }, [people, entries, settlements]);
}

