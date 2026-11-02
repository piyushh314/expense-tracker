import { describe, it, expect } from 'vitest';
import {
  splitEqually,
  splitFullyTheirs,
  splitFullyMine,
  validateCustomSplit,
  computePersonBalance,
  calculateFifoEntryStatuses,
  getPersonInitials,
  getEffectiveExpensePaise,
  computeTransactionSplits,
} from '../peopleLedger';
import type { LedgerEntry, Settlement } from '../../types';

describe('People Ledger Accounting & Math Utilities (Step 1)', () => {
  describe('1. Equal Split with Exact Paise Rounding', () => {
    it('splits ₹100 (10000 paise) equally among 3 people without losing a single paise', () => {
      // 10000 paise / 3 = 3333 with remainder 1
      // participant 0 gets 3334, others get 3333
      const result = splitEqually(10000, ['me', 'rohit', 'ananya']);
      expect(result.shares).toHaveLength(3);
      expect(result.shares[0].amountPaise).toBe(3334); // ₹33.34
      expect(result.shares[1].amountPaise).toBe(3333); // ₹33.33
      expect(result.shares[2].amountPaise).toBe(3333); // ₹33.33

      // Guarantee: Exact sum match
      const total = result.shares.reduce((sum, s) => sum + s.amountPaise, 0);
      expect(total).toBe(10000);
      expect(result.mySharePaise).toBe(3334);
    });

    it('splits 100 paise among 3 people (exact 34, 33, 33)', () => {
      const result = splitEqually(100, ['p1', 'p2', 'p3']);
      expect(result.shares[0].amountPaise).toBe(34);
      expect(result.shares[1].amountPaise).toBe(33);
      expect(result.shares[2].amountPaise).toBe(33);
      expect(result.shares.reduce((s, x) => s + x.amountPaise, 0)).toBe(100);
    });

    it('splits ₹60 (6000 paise) equally between 2 people (Milk case)', () => {
      // Milk 60: half his -> 3000 paise each
      const result = splitEqually(6000, ['me', 'rohit']);
      expect(result.shares[0].amountPaise).toBe(3000); // ₹30
      expect(result.shares[1].amountPaise).toBe(3000); // ₹30
      expect(result.mySharePaise).toBe(3000);
      expect(result.shares.reduce((s, x) => s + x.amountPaise, 0)).toBe(6000);
    });

    it('handles splitFullyTheirs: my share is 0, full amount owed by others', () => {
      // His item ₹120 (12000 paise) -> my share 0, Rohit owes 12000
      const result = splitFullyTheirs(12000, ['rohit']);
      expect(result.mySharePaise).toBe(0);
      const rohitShare = result.shares.find(s => s.id === 'rohit')?.amountPaise;
      expect(rohitShare).toBe(12000);
      expect(result.shares.reduce((s, x) => s + x.amountPaise, 0)).toBe(12000);
    });

    it('handles splitFullyMine: my share is 100%, others owe 0', () => {
      // He paid for my chai ₹40 (4000 paise) -> my share 4000
      const result = splitFullyMine(4000, ['rohit']);
      expect(result.mySharePaise).toBe(4000);
      const rohitShare = result.shares.find(s => s.id === 'rohit')?.amountPaise;
      expect(rohitShare).toBe(0);
      expect(result.shares.reduce((s, x) => s + x.amountPaise, 0)).toBe(4000);
    });

    it('validates custom split correctness', () => {
      const valid = validateCustomSplit(5000, [
        { id: 'me', amountPaise: 2000 },
        { id: 'rohit', amountPaise: 3000 },
      ]);
      expect(valid.valid).toBe(true);
      expect(valid.differencePaise).toBe(0);

      const invalid = validateCustomSplit(5000, [
        { id: 'me', amountPaise: 2000 },
        { id: 'rohit', amountPaise: 2500 },
      ]);
      expect(invalid.valid).toBe(false);
      expect(invalid.differencePaise).toBe(500); // 500 paise missing
    });
  });

  describe('2. Derived Net Balance Calculation', () => {
    it('handles Scenario a: I lent Rohit 500 (50000 paise) -> He owes 500', () => {
      const entries: LedgerEntry[] = [
        {
          id: 'e1',
          personId: 'rohit',
          direction: 'they_owe_me',
          kind: 'loan',
          amount: 50000,
          date: '2026-11-01',
          note: 'Cash loan',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];
      const summary = computePersonBalance('rohit', entries, [], '2026-11-02');
      expect(summary.netPaise).toBe(50000);
      expect(summary.displayDirection).toBe('owes_me');
      expect(summary.theyOweMePaise).toBe(50000);
      expect(summary.iOweThemPaise).toBe(0);
      expect(summary.oldestUnsettledDays).toBe(1);
    });

    it('handles Scenario b: I paid for both shared milk 60 (half his = 3000 paise)', () => {
      const entries: LedgerEntry[] = [
        {
          id: 'e2',
          personId: 'rohit',
          direction: 'they_owe_me',
          kind: 'shared_purchase',
          amount: 3000,
          date: '2026-11-02',
          note: 'Milk 60 shared',
          createdAt: 2000,
          updatedAt: 2000,
        },
      ];
      const summary = computePersonBalance('rohit', entries, [], '2026-11-02');
      expect(summary.netPaise).toBe(3000);
      expect(summary.displayDirection).toBe('owes_me');
    });

    it('handles Scenario d & e: I owe Rohit (he bought my chai 40 or I borrowed 300)', () => {
      const entries: LedgerEntry[] = [
        {
          id: 'e3',
          personId: 'rohit',
          direction: 'i_owe_them',
          kind: 'loan',
          amount: 30000, // ₹300 borrowed
          date: '2026-11-02',
          note: 'Borrowed cash',
          createdAt: 3000,
          updatedAt: 3000,
        },
      ];
      const summary = computePersonBalance('rohit', entries, [], '2026-11-02');
      expect(summary.netPaise).toBe(-30000);
      expect(summary.displayDirection).toBe('i_owe');
      expect(summary.iOweThemPaise).toBe(30000);
    });

    it('nets balances: if he owes 300 and I owe 100 -> Rohit owes you 200', () => {
      const entries: LedgerEntry[] = [
        {
          id: 'e1',
          personId: 'rohit',
          direction: 'they_owe_me',
          kind: 'loan',
          amount: 30000, // ₹300
          date: '2026-11-01',
          note: 'He owes me 300',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'e2',
          personId: 'rohit',
          direction: 'i_owe_them',
          kind: 'paid_for_me',
          amount: 10000, // ₹100
          date: '2026-11-02',
          note: 'I owe him 100',
          createdAt: 2000,
          updatedAt: 2000,
        },
      ];
      const summary = computePersonBalance('rohit', entries, [], '2026-11-02');
      expect(summary.netPaise).toBe(20000); // 300 - 100 = 200
      expect(summary.displayDirection).toBe('owes_me');
    });

    it('excludes future-dated entries from current balance until their date', () => {
      const entries: LedgerEntry[] = [
        {
          id: 'e1',
          personId: 'rohit',
          direction: 'they_owe_me',
          kind: 'loan',
          amount: 20000, // ₹200 today
          date: '2026-11-02',
          note: 'Today loan',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'e2',
          personId: 'rohit',
          direction: 'they_owe_me',
          kind: 'loan',
          amount: 50000, // ₹500 future
          date: '2026-11-10',
          note: 'Future scheduled loan',
          createdAt: 2000,
          updatedAt: 2000,
        },
      ];
      const summary = computePersonBalance('rohit', entries, [], '2026-11-02');
      expect(summary.netPaise).toBe(20000); // Only ₹200 counted so far
      expect(summary.futurePendingPaise).toBe(50000); // ₹500 pending in future
    });
  });

  describe('3. FIFO Settlement Allocation to Entries', () => {
    it('settles oldest entries first (FIFO)', () => {
      const entries: LedgerEntry[] = [
        {
          id: 'e1',
          personId: 'rohit',
          direction: 'they_owe_me',
          kind: 'loan',
          amount: 30000, // ₹300 on Oct 20
          date: '2026-10-20',
          note: 'Oldest entry',
          createdAt: 100,
          updatedAt: 100,
        },
        {
          id: 'e2',
          personId: 'rohit',
          direction: 'they_owe_me',
          kind: 'shared_purchase',
          amount: 20000, // ₹200 on Oct 25
          date: '2026-10-25',
          note: 'Middle entry',
          createdAt: 200,
          updatedAt: 200,
        },
        {
          id: 'e3',
          personId: 'rohit',
          direction: 'they_owe_me',
          kind: 'loan',
          amount: 15000, // ₹150 on Nov 01
          date: '2026-11-01',
          note: 'Newest entry',
          createdAt: 300,
          updatedAt: 300,
        },
      ];

      // Settlement: Rohit paid me ₹400 (40000 paise)
      // e1 (₹300) should be fully settled.
      // e2 (₹200) should be partly settled (₹100 settled, ₹100 remaining).
      // e3 (₹150) should be completely open.
      const settlements: Settlement[] = [
        {
          id: 's1',
          personId: 'rohit',
          direction: 'they_paid_me',
          amount: 40000,
          date: '2026-11-02',
          method: 'upi',
          note: 'UPI transfer',
          createdAt: 400,
        },
      ];

      const fifo = calculateFifoEntryStatuses(entries, settlements);
      const e1Status = fifo.entries.find(x => x.entry.id === 'e1')!;
      const e2Status = fifo.entries.find(x => x.entry.id === 'e2')!;
      const e3Status = fifo.entries.find(x => x.entry.id === 'e3')!;

      expect(e1Status.status).toBe('settled');
      expect(e1Status.settledPaise).toBe(30000);
      expect(e1Status.remainingPaise).toBe(0);

      expect(e2Status.status).toBe('partly_settled');
      expect(e2Status.settledPaise).toBe(10000);
      expect(e2Status.remainingPaise).toBe(10000);

      expect(e3Status.status).toBe('open');
      expect(e3Status.settledPaise).toBe(0);
      expect(e3Status.remainingPaise).toBe(15000);

      expect(fifo.overpaymentTheyPaidMePaise).toBe(0);
    });

    it('detects oversettlement when payment exceeds open entries', () => {
      const entries: LedgerEntry[] = [
        {
          id: 'e1',
          personId: 'rohit',
          direction: 'they_owe_me',
          kind: 'loan',
          amount: 29000, // ₹290 owed
          date: '2026-10-25',
          note: 'Lent 290',
          createdAt: 100,
          updatedAt: 100,
        },
      ];

      // Settling 400 against 290 owed
      const settlements: Settlement[] = [
        {
          id: 's1',
          personId: 'rohit',
          direction: 'they_paid_me',
          amount: 40000, // ₹400
          date: '2026-11-02',
          method: 'upi',
          note: 'Overpayment',
          createdAt: 200,
        },
      ];

      const fifo = calculateFifoEntryStatuses(entries, settlements);
      expect(fifo.entries[0].status).toBe('settled');
      expect(fifo.overpaymentTheyPaidMePaise).toBe(11000); // ₹110 overpayment
    });
  });

  describe('4. Display & Formatting Helpers', () => {
    it('extracts clean initials from single and multi-word names', () => {
      expect(getPersonInitials('Rohit')).toBe('RO');
      expect(getPersonInitials('Rohit Sharma')).toBe('RS');
      expect(getPersonInitials('Ananya Singh Rathore')).toBe('AR');
    });
  });

  describe('5. Step 3: Transaction Split Computation & Accounting Rules', () => {
    const personNames = new Map([
      ['p_rohit', 'Rohit'],
      ['p_priya', 'Priya'],
    ]);

    it('Scenario B: I paid for both, shared: milk 60, half his. My spend 30. He owes me 30.', () => {
      const res = computeTransactionSplits({
        totalPaise: 6000, // ₹60
        paidBy: 'me',
        splitMode: 'equally',
        participantPersonIds: ['p_rohit'],
        personNamesById: personNames,
      });

      expect(res.mySharePaise).toBe(3000); // ₹30
      expect(res.participantEntries).toHaveLength(1);
      expect(res.participantEntries[0]).toEqual({
        personId: 'p_rohit',
        direction: 'they_owe_me',
        kind: 'shared_purchase',
        amountPaise: 3000,
      });
      expect(res.summaryText).toBe('You spend ₹30. Rohit owes you ₹30');
    });

    it('Scenario C: I paid for him, fully his: his item 120. My spend 0. He owes me 120.', () => {
      const res = computeTransactionSplits({
        totalPaise: 12000, // ₹120
        paidBy: 'me',
        splitMode: 'fully_theirs',
        participantPersonIds: ['p_rohit'],
        personNamesById: personNames,
      });

      expect(res.mySharePaise).toBe(0);
      expect(res.participantEntries).toHaveLength(1);
      expect(res.participantEntries[0]).toEqual({
        personId: 'p_rohit',
        direction: 'they_owe_me',
        kind: 'paid_for_them',
        amountPaise: 12000,
      });
      expect(res.summaryText).toBe('You spend ₹0. Rohit owes you ₹120');
    });

    it('Scenario D1: He paid for me, fully mine: he bought my chai 40. My spend 40. I owe him 40.', () => {
      const res = computeTransactionSplits({
        totalPaise: 4000, // ₹40
        paidBy: 'p_rohit',
        splitMode: 'fully_mine',
        participantPersonIds: [],
        personNamesById: personNames,
      });

      expect(res.mySharePaise).toBe(4000);
      expect(res.participantEntries).toHaveLength(1);
      expect(res.participantEntries[0]).toEqual({
        personId: 'p_rohit',
        direction: 'i_owe_them',
        kind: 'paid_for_me',
        amountPaise: 4000,
      });
      expect(res.summaryText).toBe('You spend ₹40. You owe Rohit ₹40.');
    });

    it('Scenario D2: He paid for me, shared: we split a 200 bill. My spend 100. I owe him 100.', () => {
      const res = computeTransactionSplits({
        totalPaise: 20000, // ₹200
        paidBy: 'p_rohit',
        splitMode: 'equally',
        participantPersonIds: ['p_rohit'],
        personNamesById: personNames,
      });

      expect(res.mySharePaise).toBe(10000);
      expect(res.participantEntries).toHaveLength(1);
      expect(res.participantEntries[0]).toEqual({
        personId: 'p_rohit',
        direction: 'i_owe_them',
        kind: 'shared_purchase',
        amountPaise: 10000,
      });
      expect(res.summaryText).toBe('You spend ₹100. You owe Rohit ₹100.');
    });

    it('Three-way equal split: dinner 90 paid by me with Rohit and Priya', () => {
      const res = computeTransactionSplits({
        totalPaise: 9000,
        paidBy: 'me',
        splitMode: 'equally',
        participantPersonIds: ['p_rohit', 'p_priya'],
        personNamesById: personNames,
      });

      expect(res.mySharePaise).toBe(3000);
      expect(res.participantEntries).toHaveLength(2);
      expect(res.participantEntries.find(e => e.personId === 'p_rohit')?.amountPaise).toBe(3000);
      expect(res.participantEntries.find(e => e.personId === 'p_priya')?.amountPaise).toBe(3000);
      expect(res.summaryText).toBe('You spend ₹30. Rohit owes you ₹30. Priya owes you ₹30');
    });

    it('getEffectiveExpensePaise strictly uses mySharePaise and ignores loans/non-expenses', () => {
      // Normal expense without split
      expect(getEffectiveExpensePaise({ type: 'expense', amount: 5000 })).toBe(5000);

      // Shared expense where my share is 3000 out of 6000
      expect(getEffectiveExpensePaise({ type: 'expense', amount: 6000, mySharePaise: 3000 })).toBe(3000);

      // Fully theirs expense where my share is 0
      expect(getEffectiveExpensePaise({ type: 'expense', amount: 12000, mySharePaise: 0 })).toBe(0);

      // Income transaction
      expect(getEffectiveExpensePaise({ type: 'income', amount: 10000 })).toBe(0);

      // Transfer / loan
      expect(getEffectiveExpensePaise({ type: 'transfer', amount: 5000 })).toBe(0);
    });
  });
});

