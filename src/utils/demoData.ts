// ============================================================
// Demo Data Generator for Indian College Student / Early Founder
// ============================================================
import { db } from '../db';
import { v4 as uuid } from 'uuid';
import { subDays, format } from 'date-fns';
import type { Transaction, Budget, Person, LedgerEntry, Settlement } from '../types';
import { getPersonAvatarColor } from './peopleLedger';

export async function loadDemoData() {
  const categories = await db.categories.toArray();
  const paymentMethods = await db.paymentMethods.toArray();

  const getCatId = (name: string) => categories.find(c => c.name.toLowerCase().includes(name.toLowerCase()))?.id || categories[0]?.id || '';
  const getPmId = (name: string) => paymentMethods.find(p => p.name.toLowerCase().includes(name.toLowerCase()))?.id || paymentMethods[0]?.id || '';

  const upiId = getPmId('upi');
  const cashId = getPmId('cash');
  const cardId = getPmId('debit');

  const now = new Date();
  const d = (daysAgo: number) => format(subDays(now, daysAgo), 'yyyy-MM-dd');

  // Persons for splits
  const rahulId = uuid();
  const ananyaId = uuid();
  const persons: Person[] = [
    {
      id: rahulId,
      name: 'Rahul Sharma',
      nickname: 'Rahul',
      phone: '9876543210',
      label: 'Roommate',
      color: getPersonAvatarColor('Rahul Sharma'),
      archived: false,
      createdAt: Date.now() - 86400000 * 30,
    },
    {
      id: ananyaId,
      name: 'Ananya Verma',
      nickname: 'Ananya',
      upiId: 'ananya@okaxis',
      label: 'Friend',
      color: getPersonAvatarColor('Ananya Verma'),
      archived: false,
      createdAt: Date.now() - 86400000 * 20,
    },
  ];

  await db.persons.bulkPut(persons);

  const txns: Transaction[] = [
    // Today
    {
      id: uuid(),
      type: 'expense',
      amount: 4000, // ₹40
      categoryId: getCatId('Food & Drinks'),
      paymentMethodId: upiId,
      date: d(0),
      note: 'Morning chai + samosa with team',
      tags: ['college', 'canteen'],
      scope: 'personal',
      createdAt: Date.now() - 3600000 * 3,
      updatedAt: Date.now() - 3600000 * 3,
    },
    {
      id: uuid(),
      type: 'expense',
      amount: 8000, // ₹80
      categoryId: getCatId('Transport'),
      paymentMethodId: upiId,
      date: d(0),
      note: 'Auto to tech park / campus',
      tags: ['commute'],
      scope: 'personal',
      createdAt: Date.now() - 3600000 * 2,
      updatedAt: Date.now() - 3600000 * 2,
    },
    // Yesterday
    {
      id: uuid(),
      type: 'expense',
      amount: 32000, // ₹320
      categoryId: getCatId('Food & Drinks'),
      paymentMethodId: upiId,
      date: d(1),
      note: 'Swiggy dinner - butter chicken bowl',
      tags: ['swiggy'],
      scope: 'personal',
      createdAt: Date.now() - 86400000 * 1,
      updatedAt: Date.now() - 86400000 * 1,
    },
    {
      id: uuid(),
      type: 'expense',
      amount: 49900, // ₹499
      categoryId: getCatId('Subscriptions'),
      paymentMethodId: cardId,
      date: d(1),
      note: 'Netflix standard monthly',
      tags: ['subs'],
      scope: 'personal',
      createdAt: Date.now() - 86400000 * 1 - 5000,
      updatedAt: Date.now() - 86400000 * 1 - 5000,
    },
    // 2 days ago
    {
      id: uuid(),
      type: 'expense',
      amount: 85000, // ₹850
      categoryId: getCatId('Startup/Business'),
      paymentMethodId: cardId,
      date: d(2),
      note: 'Domain name renewal (.ai / .in) on Namecheap',
      tags: ['startup', 'founder'],
      scope: 'business',
      createdAt: Date.now() - 86400000 * 2,
      updatedAt: Date.now() - 86400000 * 2,
    },
    {
      id: uuid(),
      type: 'expense',
      amount: 6000, // ₹60
      categoryId: getCatId('Transport'),
      paymentMethodId: upiId,
      date: d(2),
      note: 'Metro card smart recharge',
      tags: ['commute'],
      scope: 'personal',
      createdAt: Date.now() - 86400000 * 2 - 1000,
      updatedAt: Date.now() - 86400000 * 2 - 1000,
    },
    // 3 days ago - Weekend dinner with friends (split)
    {
      id: uuid(),
      type: 'expense',
      amount: 140000, // ₹1,400 (My share ₹466, Rahul owes ₹467, Ananya owes ₹467)
      categoryId: getCatId('Food & Drinks'),
      paymentMethodId: upiId,
      date: d(3),
      note: 'Cafe dinner with Rahul & Ananya',
      tags: ['friends', 'split'],
      scope: 'personal',
      splitInfo: {
        participants: [
          { personId: rahulId, amount: 46700, settled: false },
          { personId: ananyaId, amount: 46700, settled: true },
        ],
        myShare: 46600,
        iPaid: true,
      },
      createdAt: Date.now() - 86400000 * 3,
      updatedAt: Date.now() - 86400000 * 3,
    },
    // 4 days ago
    {
      id: uuid(),
      type: 'expense',
      amount: 34000, // ₹340
      categoryId: getCatId('Groceries'),
      paymentMethodId: upiId,
      date: d(4),
      note: 'Blinkit quick groceries - milk, coffee, bread',
      tags: ['blinkit', 'hostel'],
      scope: 'personal',
      createdAt: Date.now() - 86400000 * 4,
      updatedAt: Date.now() - 86400000 * 4,
    },
    // 5 days ago
    {
      id: uuid(),
      type: 'expense',
      amount: 29900, // ₹299
      categoryId: getCatId('Bills & Recharge'),
      paymentMethodId: upiId,
      date: d(5),
      note: 'Jio 5G monthly recharge',
      tags: ['recharge'],
      scope: 'personal',
      createdAt: Date.now() - 86400000 * 5,
      updatedAt: Date.now() - 86400000 * 5,
    },
    // 6 days ago - Freelance income!
    {
      id: uuid(),
      type: 'income',
      amount: 1800000, // ₹18,000
      categoryId: getCatId('Freelance'),
      paymentMethodId: upiId,
      date: d(6),
      note: 'Client payment: landing page development',
      tags: ['freelance', 'client'],
      scope: 'business',
      createdAt: Date.now() - 86400000 * 6,
      updatedAt: Date.now() - 86400000 * 6,
    },
    // 7 days ago - Chai with team
    {
      id: uuid(),
      type: 'expense',
      amount: 7000, // ₹70
      categoryId: getCatId('Food & Drinks'),
      paymentMethodId: cashId,
      date: d(7),
      note: 'Tapri chai and bun maska',
      tags: ['chai'],
      scope: 'personal',
      createdAt: Date.now() - 86400000 * 7,
      updatedAt: Date.now() - 86400000 * 7,
    },
    // 8 days ago - Books / Exam stationery
    {
      id: uuid(),
      type: 'expense',
      amount: 45000, // ₹450
      categoryId: getCatId('Education'),
      paymentMethodId: upiId,
      date: d(8),
      note: 'Notes printouts & reference guide for exams',
      tags: ['exam', 'college'],
      scope: 'personal',
      createdAt: Date.now() - 86400000 * 8,
      updatedAt: Date.now() - 86400000 * 8,
    },
    // 10 days ago - Shopping
    {
      id: uuid(),
      type: 'expense',
      amount: 129900, // ₹1,299
      categoryId: getCatId('Shopping'),
      paymentMethodId: upiId,
      date: d(10),
      note: 'Zudio oversized hoodie + socks',
      tags: ['shopping', 'zudio'],
      scope: 'personal',
      createdAt: Date.now() - 86400000 * 10,
      updatedAt: Date.now() - 86400000 * 10,
    },
    // 12 days ago - Stipend
    {
      id: uuid(),
      type: 'income',
      amount: 1000000, // ₹10,000
      categoryId: getCatId('Salary/Stipend'),
      paymentMethodId: upiId,
      date: d(12),
      note: 'Monthly startup stipend',
      tags: ['stipend'],
      scope: 'personal',
      createdAt: Date.now() - 86400000 * 12,
      updatedAt: Date.now() - 86400000 * 12,
    },
  ];

  await db.transactions.bulkPut(txns);

  // Ledger entries for the split
  const splitTxn = txns.find(t => t.splitInfo);
  if (splitTxn) {
    const ledgerEntries: LedgerEntry[] = [
      {
        id: uuid(),
        personId: rahulId,
        transactionId: splitTxn.id,
        amount: 46700,
        direction: 'they_owe_me',
        kind: 'shared_purchase',
        date: splitTxn.date,
        note: 'Cafe dinner split with Rahul',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now() - 86400000 * 3,
      },
      {
        id: uuid(),
        personId: ananyaId,
        transactionId: splitTxn.id,
        amount: 46700,
        direction: 'they_owe_me',
        kind: 'shared_purchase',
        date: splitTxn.date,
        note: 'Cafe dinner split with Ananya',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now() - 86400000 * 3,
      },
    ];
    await db.ledgerEntries.bulkPut(ledgerEntries);

    // Settlement for Ananya
    const settlement: Settlement = {
      id: uuid(),
      personId: ananyaId,
      direction: 'they_paid_me',
      amount: 46700,
      date: splitTxn.date,
      method: 'upi',
      note: 'UPI payment received for cafe dinner',
      createdAt: Date.now() - 86400000 * 2,
    };
    await db.settlements.put(settlement);
  }

  // Monthly budget
  const period = format(now, 'yyyy-MM');
  const foodCatId = getCatId('Food & Drinks');
  const transportCatId = getCatId('Transport');
  const budgets: Budget[] = [
    { id: uuid(), period, categoryId: null, amount: 2000000 }, // Overall: ₹20,000
    { id: uuid(), period, categoryId: foodCatId, amount: 700000 }, // Food: ₹7,000
    { id: uuid(), period, categoryId: transportCatId, amount: 250000 }, // Transport: ₹2,500
  ];
  await db.budgets.bulkPut(budgets);

  return txns.length;
}

