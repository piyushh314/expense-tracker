// ============================================================
// People Ledger — Pure Accounting Utilities
// Money is strictly integer paise (1 INR = 100 paise).
// Dates are calendar dates (YYYY-MM-DD).
// ============================================================

import type { LedgerEntry, Settlement, SplitMode, LedgerDirection, LedgerKind } from '../types';
import { differenceInDays, parseISO } from 'date-fns';
import { formatINR } from './money';

export interface ParticipantShare {
  id: string; // 'me' or personId
  amountPaise: number;
}

export interface SplitResult {
  shares: ParticipantShare[];
  mySharePaise: number;
  totalPaise: number;
}

/**
 * Split an integer amount in paise equally among N participants.
 * Handles fractional paise by distributing remainder (1 paise each) to first participants.
 * GUARANTEE: Sum of shares strictly equals totalPaise.
 *
 * Example: 10000 paise (₹100) among 3 = [3334, 3333, 3333] -> Sum = 10000 paise.
 */
export function splitEqually(
  totalPaise: number,
  participantIds: string[]
): SplitResult {
  if (participantIds.length === 0) {
    throw new Error('Cannot split among 0 participants');
  }
  if (totalPaise < 0) {
    throw new Error('Total amount cannot be negative');
  }

  const n = participantIds.length;
  const baseShare = Math.floor(totalPaise / n);
  const remainder = totalPaise % n;

  const shares: ParticipantShare[] = participantIds.map((id, index) => ({
    id,
    amountPaise: baseShare + (index < remainder ? 1 : 0),
  }));

  const myShare = shares.find(s => s.id === 'me')?.amountPaise ?? 0;

  return {
    shares,
    mySharePaise: myShare,
    totalPaise,
  };
}

/**
 * Split where the purchase is fully for other people (my share = 0).
 */
export function splitFullyTheirs(
  totalPaise: number,
  participantIds: string[]
): SplitResult {
  if (participantIds.length === 0) {
    throw new Error('Cannot split among 0 participants');
  }
  const result = splitEqually(totalPaise, participantIds.filter(id => id !== 'me'));
  return {
    shares: [...result.shares, { id: 'me', amountPaise: 0 }],
    mySharePaise: 0,
    totalPaise,
  };
}

/**
 * Split where the purchase is fully mine (they paid or I paid, but 100% my expense).
 */
export function splitFullyMine(
  totalPaise: number,
  otherParticipantIds: string[] = []
): SplitResult {
  const shares: ParticipantShare[] = [
    { id: 'me', amountPaise: totalPaise },
    ...otherParticipantIds.map(id => ({ id, amountPaise: 0 })),
  ];
  return {
    shares,
    mySharePaise: totalPaise,
    totalPaise,
  };
}

/**
 * Custom split validator: verifies whether sum of shares equals totalPaise.
 */
export function validateCustomSplit(
  totalPaise: number,
  shares: ParticipantShare[]
): { valid: boolean; differencePaise: number } {
  const sum = shares.reduce((acc, s) => acc + s.amountPaise, 0);
  return {
    valid: sum === totalPaise,
    differencePaise: totalPaise - sum,
  };
}

export type NetDirection = 'owes_me' | 'i_owe' | 'settled';

export interface PersonBalanceSummary {
  personId: string;
  netPaise: number; // positive = they owe me, negative = I owe them, 0 = settled
  displayDirection: NetDirection;
  theyOweMePaise: number;
  iOweThemPaise: number;
  oldestUnsettledDays: number | null;
  oldestUnsettledDate: string | null;
  futurePendingPaise: number; // amounts dated in the future
}

/**
 * Compute the derived net balance for a person from raw entries and settlements.
 * Balances are strictly DERIVED, never stored.
 *
 * Accounting formulas:
 * - They owe me: entries(they_owe_me) - settlements(they_paid_me)
 * - I owe them: entries(i_owe_them) - settlements(i_paid_them)
 * - Net balance = (They owe me) - (I owe them)
 *
 * Future-dated entries are excluded from current net balance until their date.
 */
export function computePersonBalance(
  personId: string,
  entries: LedgerEntry[],
  settlements: Settlement[],
  asOfDateStr?: string
): PersonBalanceSummary {
  const todayStr = asOfDateStr || new Date().toISOString().split('T')[0];
  const todayDate = parseISO(todayStr);

  const personEntries = entries.filter(e => e.personId === personId);
  const personSettlements = settlements.filter(s => s.personId === personId);

  let theyOweGross = 0;
  let iOweGross = 0;
  let futurePending = 0;

  let oldestDateStr: string | null = null;

  // Compute status per entry to identify which are open/unsettled
  const fifoStatus = calculateFifoEntryStatuses(personEntries, personSettlements);

  for (const item of fifoStatus.entries) {
    const isFuture = item.entry.date > todayStr;
    if (isFuture) {
      if (item.entry.direction === 'they_owe_me') {
        futurePending += item.remainingPaise;
      } else {
        futurePending -= item.remainingPaise;
      }
      continue;
    }

    if (item.entry.direction === 'they_owe_me') {
      theyOweGross += item.entry.amount;
    } else {
      iOweGross += item.entry.amount;
    }

    if (item.status !== 'settled') {
      if (!oldestDateStr || item.entry.date < oldestDateStr) {
        oldestDateStr = item.entry.date;
      }
    }
  }

  // Settlements (only count settlements up to today)
  let theyPaidMeGross = 0;
  let iPaidThemGross = 0;
  for (const s of personSettlements) {
    if (s.date > todayStr) continue;
    if (s.direction === 'they_paid_me') {
      theyPaidMeGross += s.amount;
    } else {
      iPaidThemGross += s.amount;
    }
  }

  const effectiveTheyOweMe = Math.max(0, theyOweGross - theyPaidMeGross);
  const effectiveIOweThem = Math.max(0, iOweGross - iPaidThemGross);

  // Net calculation
  const netPaise = (theyOweGross - theyPaidMeGross) - (iOweGross - iPaidThemGross);

  let displayDirection: NetDirection = 'settled';
  if (netPaise > 0) displayDirection = 'owes_me';
  else if (netPaise < 0) displayDirection = 'i_owe';

  let oldestUnsettledDays: number | null = null;
  if (oldestDateStr && displayDirection !== 'settled') {
    oldestUnsettledDays = Math.max(0, differenceInDays(todayDate, parseISO(oldestDateStr)));
  }

  return {
    personId,
    netPaise,
    displayDirection,
    theyOweMePaise: effectiveTheyOweMe,
    iOweThemPaise: effectiveIOweThem,
    oldestUnsettledDays,
    oldestUnsettledDate: displayDirection === 'settled' ? null : oldestDateStr,
    futurePendingPaise: futurePending,
  };
}

export type EntrySettlementStatus = 'open' | 'partly_settled' | 'settled';

export interface EntryStatusDetail {
  entry: LedgerEntry;
  status: EntrySettlementStatus;
  settledPaise: number;
  remainingPaise: number;
}

export interface FifoStatusResult {
  entries: EntryStatusDetail[];
  totalTheyOweMePaise: number;
  totalIOweThemPaise: number;
  totalSettledTheyPaidMePaise: number;
  totalSettledIPaidThemPaise: number;
  overpaymentTheyPaidMePaise: number;
  overpaymentIPaidThemPaise: number;
}

/**
 * Applies settlements to the oldest open entries first (FIFO), per direction.
 * This determines the exact visual status of each ledger entry (Open, Partly Settled, Settled).
 */
export function calculateFifoEntryStatuses(
  entries: LedgerEntry[],
  settlements: Settlement[]
): FifoStatusResult {
  // Separate entries by direction and sort oldest first
  const theyOweEntries = entries
    .filter(e => e.direction === 'they_owe_me')
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  const iOweEntries = entries
    .filter(e => e.direction === 'i_owe_them')
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  // Total settlements by direction
  let remainingTheyPaidMe = settlements
    .filter(s => s.direction === 'they_paid_me')
    .reduce((acc, s) => acc + s.amount, 0);

  let remainingIPaidThem = settlements
    .filter(s => s.direction === 'i_paid_them')
    .reduce((acc, s) => acc + s.amount, 0);

  const totalSettledTheyPaidMe = remainingTheyPaidMe;
  const totalSettledIPaidThem = remainingIPaidThem;

  const resultDetails: EntryStatusDetail[] = [];

  // FIFO on they_owe_me entries
  let totalTheyOweMe = 0;
  for (const entry of theyOweEntries) {
    totalTheyOweMe += entry.amount;
    if (remainingTheyPaidMe >= entry.amount) {
      resultDetails.push({
        entry,
        status: 'settled',
        settledPaise: entry.amount,
        remainingPaise: 0,
      });
      remainingTheyPaidMe -= entry.amount;
    } else if (remainingTheyPaidMe > 0) {
      resultDetails.push({
        entry,
        status: 'partly_settled',
        settledPaise: remainingTheyPaidMe,
        remainingPaise: entry.amount - remainingTheyPaidMe,
      });
      remainingTheyPaidMe = 0;
    } else {
      resultDetails.push({
        entry,
        status: 'open',
        settledPaise: 0,
        remainingPaise: entry.amount,
      });
    }
  }

  // FIFO on i_owe_them entries
  let totalIOweThem = 0;
  for (const entry of iOweEntries) {
    totalIOweThem += entry.amount;
    if (remainingIPaidThem >= entry.amount) {
      resultDetails.push({
        entry,
        status: 'settled',
        settledPaise: entry.amount,
        remainingPaise: 0,
      });
      remainingIPaidThem -= entry.amount;
    } else if (remainingIPaidThem > 0) {
      resultDetails.push({
        entry,
        status: 'partly_settled',
        settledPaise: remainingIPaidThem,
        remainingPaise: entry.amount - remainingIPaidThem,
      });
      remainingIPaidThem = 0;
    } else {
      resultDetails.push({
        entry,
        status: 'open',
        settledPaise: 0,
        remainingPaise: entry.amount,
      });
    }
  }

  // Sort back by original entry ordering (newest first for timeline)
  resultDetails.sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.entry.createdAt - a.entry.createdAt);

  return {
    entries: resultDetails,
    totalTheyOweMePaise: totalTheyOweMe,
    totalIOweThemPaise: totalIOweThem,
    totalSettledTheyPaidMePaise: totalSettledTheyPaidMe,
    totalSettledIPaidThemPaise: totalSettledIPaidThem,
    overpaymentTheyPaidMePaise: remainingTheyPaidMe,
    overpaymentIPaidThemPaise: remainingIPaidThem,
  };
}

/**
 * Avatar initials generator (e.g. "Rohit Sharma" -> "RS", "Rahul" -> "R")
 */
export function getPersonInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic color palette for person avatars
 */
const AVATAR_COLORS = [
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#F97316', // Orange
  '#EAB308', // Amber
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#14B8A6', // Teal
];

export function getPersonAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

/**
 * Accounting Rule: Only MY SHARE of a purchase counts as an expense.
 * Standalone loans and someone else's share of a purchase are NEVER counted as spending.
 * If mySharePaise is set on an expense, use that.
 * Otherwise, default to t.amount.
 * Non-expense transactions return 0.
 */
export function getEffectiveExpensePaise(t: {
  type: string;
  amount: number;
  mySharePaise?: number;
}): number {
  if (t.type !== 'expense') return 0;
  return t.mySharePaise !== undefined ? t.mySharePaise : t.amount;
}

export interface ParticipantEntryPlan {
  personId: string;
  direction: LedgerDirection;
  kind: LedgerKind;
  amountPaise: number;
}

export interface TransactionSplitComputation {
  mySharePaise: number;
  participantEntries: ParticipantEntryPlan[];
  summaryText: string;
  isValid: boolean;
  validationError?: string;
}

/**
 * Pure accounting calculation for transaction splits (The Milk case, Chai case, etc.)
 */
export function computeTransactionSplits(params: {
  totalPaise: number;
  paidBy: 'me' | string;
  splitMode: SplitMode;
  participantPersonIds: string[];
  personNamesById?: Map<string, string>;
  customShares?: Record<string, number>; // id ('me' or personId) -> amount in paise
}): TransactionSplitComputation {
  const { totalPaise, paidBy, splitMode, participantPersonIds, personNamesById, customShares } = params;

  if (totalPaise <= 0) {
    return {
      mySharePaise: 0,
      participantEntries: [],
      summaryText: '',
      isValid: true,
    };
  }

  const getName = (id: string) => personNamesById?.get(id) || 'Someone';

  // If paid by Me
  if (paidBy === 'me') {
    if (splitMode === 'none' || participantPersonIds.length === 0) {
      return {
        mySharePaise: totalPaise,
        participantEntries: [],
        summaryText: `You spend ${formatINR(totalPaise)}`,
        isValid: true,
      };
    }

    if (splitMode === 'equally') {
      const allIds = ['me', ...participantPersonIds];
      const res = splitEqually(totalPaise, allIds);
      const entries: ParticipantEntryPlan[] = participantPersonIds.map(id => ({
        personId: id,
        direction: 'they_owe_me',
        kind: 'shared_purchase',
        amountPaise: res.shares.find(s => s.id === id)?.amountPaise || 0,
      }));

      const summaryParts = entries.map(e => `${getName(e.personId)} owes you ${formatINR(e.amountPaise)}`);
      return {
        mySharePaise: res.mySharePaise,
        participantEntries: entries,
        summaryText: `You spend ${formatINR(res.mySharePaise)}. ${summaryParts.join('. ')}`,
        isValid: true,
      };
    }

    if (splitMode === 'fully_theirs') {
      const res = splitFullyTheirs(totalPaise, participantPersonIds);
      const entries: ParticipantEntryPlan[] = participantPersonIds.map(id => ({
        personId: id,
        direction: 'they_owe_me',
        kind: 'paid_for_them',
        amountPaise: res.shares.find(s => s.id === id)?.amountPaise || 0,
      }));

      const summaryParts = entries.map(e => `${getName(e.personId)} owes you ${formatINR(e.amountPaise)}`);
      return {
        mySharePaise: 0,
        participantEntries: entries,
        summaryText: `You spend ${formatINR(0)}. ${summaryParts.join('. ')}`,
        isValid: true,
      };
    }

    if (splitMode === 'custom') {
      const allIds = ['me', ...participantPersonIds];
      const shares = allIds.map(id => ({
        id,
        amountPaise: customShares?.[id] || 0,
      }));
      const validation = validateCustomSplit(totalPaise, shares);
      const myShare = customShares?.['me'] || 0;
      const entries: ParticipantEntryPlan[] = participantPersonIds.map(id => ({
        personId: id,
        direction: 'they_owe_me',
        kind: 'shared_purchase',
        amountPaise: customShares?.[id] || 0,
      }));

      const summaryParts = entries.map(e => `${getName(e.personId)} owes you ${formatINR(e.amountPaise)}`);
      return {
        mySharePaise: myShare,
        participantEntries: entries,
        summaryText: `You spend ${formatINR(myShare)}. ${summaryParts.join('. ')}`,
        isValid: validation.valid,
        validationError: validation.valid ? undefined : `Custom shares do not add up to ${formatINR(totalPaise)}`,
      };
    }
  }

  // If paid by a Person (paidBy is personId)
  const payerId = paidBy;
  const payerName = getName(payerId);

  if (splitMode === 'fully_mine') {
    return {
      mySharePaise: totalPaise,
      participantEntries: [
        {
          personId: payerId,
          direction: 'i_owe_them',
          kind: 'paid_for_me',
          amountPaise: totalPaise,
        },
      ],
      summaryText: `You spend ${formatINR(totalPaise)}. You owe ${payerName} ${formatINR(totalPaise)}.`,
      isValid: true,
    };
  }

  if (splitMode === 'equally') {
    // Other participants besides payer and me
    const others = participantPersonIds.filter(id => id !== payerId);
    const allIds = ['me', payerId, ...others];
    const res = splitEqually(totalPaise, allIds);
    const myShare = res.mySharePaise;

    return {
      mySharePaise: myShare,
      participantEntries: [
        {
          personId: payerId,
          direction: 'i_owe_them',
          kind: 'shared_purchase',
          amountPaise: myShare,
        },
      ],
      summaryText: `You spend ${formatINR(myShare)}. You owe ${payerName} ${formatINR(myShare)}.`,
      isValid: true,
    };
  }

  if (splitMode === 'custom') {
    const myShare = customShares?.['me'] || 0;
    const isValid = myShare <= totalPaise;

    return {
      mySharePaise: myShare,
      participantEntries: [
        {
          personId: payerId,
          direction: 'i_owe_them',
          kind: 'shared_purchase',
          amountPaise: myShare,
        },
      ],
      summaryText: `You spend ${formatINR(myShare)}. You owe ${payerName} ${formatINR(myShare)}.`,
      isValid,
      validationError: isValid ? undefined : `Your share cannot exceed total ${formatINR(totalPaise)}`,
    };
  }

  // Fallback
  return {
    mySharePaise: totalPaise,
    participantEntries: [],
    summaryText: `You spend ${formatINR(totalPaise)}`,
    isValid: true,
  };
}


