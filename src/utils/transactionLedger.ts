// ============================================================
// Transaction Ledger Synchronization
// Handles creating, updating, and deleting linked LedgerEntries
// when Transactions are modified or removed.
// ============================================================

import { v4 as uuid } from 'uuid';
import { db } from '../db';
import type { Transaction, LedgerEntry, SplitMode } from '../types';
import { calculateFifoEntryStatuses, type ParticipantEntryPlan } from './peopleLedger';

/**
 * Check if any ledger entries linked to this transaction have already been partly or fully settled.
 */
export async function checkTransactionSettlements(transactionId: string): Promise<{
  hasSettlements: boolean;
  settledPersonIds: string[];
}> {
  const linkedEntries = await db.ledgerEntries.where('transactionId').equals(transactionId).toArray();
  if (linkedEntries.length === 0) {
    return { hasSettlements: false, settledPersonIds: [] };
  }

  const settledPersonIds = new Set<string>();

  for (const entry of linkedEntries) {
    const personEntries = await db.ledgerEntries.where('personId').equals(entry.personId).toArray();
    const personSettlements = await db.settlements.where('personId').equals(entry.personId).toArray();
    const fifo = calculateFifoEntryStatuses(personEntries, personSettlements);
    const entryStatus = fifo.entries.find(e => e.entry.id === entry.id);
    if (entryStatus && entryStatus.status !== 'open') {
      settledPersonIds.add(entry.personId);
    }
  }

  return {
    hasSettlements: settledPersonIds.size > 0,
    settledPersonIds: Array.from(settledPersonIds),
  };
}

/**
 * Save or update a transaction along with its linked ledger entries.
 */
export async function saveTransactionWithSplits(params: {
  transaction: Transaction;
  splitMode: SplitMode;
  participantEntries: ParticipantEntryPlan[];
  isEdit: boolean;
}): Promise<void> {
  const { transaction, participantEntries, isEdit } = params;

  // If editing, clean up any previous ledger entries linked to this transaction
  if (isEdit) {
    const existing = await db.ledgerEntries.where('transactionId').equals(transaction.id).toArray();
    if (existing.length > 0) {
      await db.ledgerEntries.bulkDelete(existing.map(e => e.id));
    }
    await db.transactions.put(transaction);
  } else {
    await db.transactions.add(transaction);
  }

  // Create new ledger entries if participants exist
  if (participantEntries.length > 0) {
    const splitGroupId = uuid();
    const now = Date.now();
    const newEntries: LedgerEntry[] = participantEntries.map(p => ({
      id: uuid(),
      personId: p.personId,
      direction: p.direction,
      kind: p.kind,
      amount: p.amountPaise,
      date: transaction.date,
      note: transaction.note.trim() || 'Shared expense',
      transactionId: transaction.id,
      splitGroupId,
      createdAt: now,
      updatedAt: now,
    }));

    await db.ledgerEntries.bulkAdd(newEntries);
  }
}

/**
 * Delete a transaction and its linked ledger entries with undo support.
 */
export async function deleteTransactionWithSplits(txn: Transaction): Promise<{
  undo: () => Promise<void>;
  linkedCount: number;
}> {
  const linkedEntries = await db.ledgerEntries.where('transactionId').equals(txn.id).toArray();

  await db.transactions.delete(txn.id);
  if (linkedEntries.length > 0) {
    await db.ledgerEntries.bulkDelete(linkedEntries.map(e => e.id));
  }

  return {
    linkedCount: linkedEntries.length,
    undo: async () => {
      await db.transactions.add(txn);
      if (linkedEntries.length > 0) {
        await db.ledgerEntries.bulkAdd(linkedEntries);
      }
    },
  };
}
