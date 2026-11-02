import { db } from '../db';
import type { Transaction, Category, PaymentMethod } from '../types';
import { toRupees } from './money';

export async function exportBackup(): Promise<string> {
  const [transactions, categories, paymentMethods, budgets, recurringRules, persons, ledgerEntries, savingsGoals] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.paymentMethods.toArray(),
    db.budgets.toArray(),
    db.recurringRules.toArray(),
    db.persons.toArray(),
    db.ledgerEntries.toArray(),
    db.savingsGoals.toArray(),
  ]);

  return JSON.stringify({
    version: 1,
    exportDate: new Date().toISOString(),
    app: 'expense-tracker',
    data: { transactions, categories, paymentMethods, budgets, recurringRules, persons, ledgerEntries, savingsGoals },
  }, null, 2);
}

export async function importBackup(jsonString: string): Promise<{ success: boolean; message: string }> {
  try {
    const backup = JSON.parse(jsonString);

    if (!backup.app || backup.app !== 'expense-tracker') {
      return { success: false, message: 'Invalid backup file. Not an Expense Tracker backup.' };
    }
    if (!backup.data) {
      return { success: false, message: 'Invalid backup file. No data found.' };
    }

    const { data } = backup;

    // Clear existing data
    await Promise.all([
      db.transactions.clear(),
      db.categories.clear(),
      db.paymentMethods.clear(),
      db.budgets.clear(),
      db.recurringRules.clear(),
      db.persons.clear(),
      db.ledgerEntries.clear(),
      db.savingsGoals.clear(),
    ]);

    // Import data
    if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions);
    if (data.categories?.length) await db.categories.bulkAdd(data.categories);
    if (data.paymentMethods?.length) await db.paymentMethods.bulkAdd(data.paymentMethods);
    if (data.budgets?.length) await db.budgets.bulkAdd(data.budgets);
    if (data.recurringRules?.length) await db.recurringRules.bulkAdd(data.recurringRules);
    if (data.persons?.length) await db.persons.bulkAdd(data.persons);
    if (data.ledgerEntries?.length) await db.ledgerEntries.bulkAdd(data.ledgerEntries);
    if (data.savingsGoals?.length) await db.savingsGoals.bulkAdd(data.savingsGoals);

    const txnCount = data.transactions?.length || 0;
    return { success: true, message: `Restored ${txnCount} transactions successfully.` };
  } catch (e) {
    return { success: false, message: `Import failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
  }
}

export async function exportCSV(
  transactions: Transaction[],
  categories: Category[],
  paymentMethods: PaymentMethod[]
): Promise<string> {
  const catMap = new Map(categories.map(c => [c.id, c.name]));
  const pmMap = new Map(paymentMethods.map(p => [p.id, p.name]));

  const headers = ['Date', 'Type', 'Amount (₹)', 'Category', 'Payment Method', 'Note', 'Tags', 'Scope'];
  const rows = transactions
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(t => {
      const [y, m, d] = t.date.split('-');
      return [
        `${d}/${m}/${y}`,
        t.type,
        toRupees(t.amount).toFixed(2),
        catMap.get(t.categoryId) || 'Unknown',
        pmMap.get(t.paymentMethodId) || 'Unknown',
        `"${t.note.replace(/"/g, '""')}"`,
        t.tags.join('; '),
        t.scope,
      ].join(',');
    });

  return [headers.join(','), ...rows].join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

