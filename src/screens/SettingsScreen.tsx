import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Monitor, ChevronRight, Download, Upload, Shield, Trash2, X, Plus, ArrowUp, ArrowDown, Sparkles } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../db';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';
import { exportBackup, importBackup, exportCSV, downloadFile } from '../utils/exportImport';
import { loadDemoData } from '../utils/demoData';
import DynamicIcon from '../components/ui/DynamicIcon';
import type { Category, PaymentMethod, ThemeMode } from '../types';

const ICON_OPTIONS = [
  'UtensilsCrossed', 'ShoppingBasket', 'Car', 'ShoppingBag', 'Zap', 'Home', 'Gamepad2', 'CreditCard',
  'GraduationCap', 'Heart', 'Plane', 'Gift', 'Briefcase', 'Sparkles', 'MoreHorizontal', 'Banknote',
  'Laptop', 'Wallet', 'Plus', 'Coffee', 'Pizza', 'Bus', 'Train', 'Smartphone', 'Headphones',
  'Book', 'Dumbbell', 'Pill', 'Camera', 'Music', 'Globe', 'Star', 'Tag', 'Fuel', 'Scissors',
];

const COLOR_OPTIONS = [
  '#F97316', '#84CC16', '#3B82F6', '#EC4899', '#EAB308', '#8B5CF6', '#F43F5E', '#6366F1',
  '#14B8A6', '#EF4444', '#0EA5E9', '#D946EF', '#78716C', '#FB923C', '#94A3B8', '#22C55E',
];

export default function SettingsScreen() {
  const { settings, updateSettings } = useSettings();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allCategories = useLiveQuery(() => db.categories.orderBy('order').toArray()) ?? [];
  const allPaymentMethods = useLiveQuery(() => db.paymentMethods.orderBy('order').toArray()) ?? [];
  const expenseCategories = allCategories.filter(c => c.type === 'expense');
  const incomeCategories = allCategories.filter(c => c.type === 'income');

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingPM, setEditingPM] = useState<PaymentMethod | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('Tag');
  const [catColor, setCatColor] = useState('#6366F1');
  const [catType, setCatType] = useState<'expense' | 'income'>('expense');
  const [pmName, setPmName] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);

  const handleExportJSON = async () => {
    const json = await exportBackup();
    const date = new Date().toISOString().split('T')[0];
    downloadFile(json, `expense-tracker-backup-${date}.json`, 'application/json');
    showToast('Backup exported successfully');
  };

  const handleExportCSV = async () => {
    const transactions = await db.transactions.toArray();
    const categories = await db.categories.toArray();
    const paymentMethods = await db.paymentMethods.toArray();
    const csv = await exportCSV(transactions, categories, paymentMethods);
    const date = new Date().toISOString().split('T')[0];
    downloadFile(csv, `expenses-${date}.csv`, 'text/csv');
    showToast('CSV exported successfully');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = await importBackup(text);
    showToast(result.message);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openCategoryEditor = (cat?: Category) => {
    if (cat) {
      setEditingCategory(cat);
      setCatName(cat.name);
      setCatIcon(cat.icon);
      setCatColor(cat.color);
      setCatType(cat.type as 'expense' | 'income');
    } else {
      setEditingCategory({ id: '', name: '', icon: 'Tag', color: '#6366F1', order: 0, archived: false, type: 'expense' });
      setCatName('');
      setCatIcon('Tag');
      setCatColor('#6366F1');
      setCatType('expense');
    }
  };

  const handleSaveCategory = async () => {
    if (!catName.trim()) return;
    const isNew = !editingCategory?.id;
    const maxOrder = allCategories.reduce((m, c) => Math.max(m, c.order), 0);
    const cat: Category = {
      id: editingCategory?.id || uuid(),
      name: catName.trim(),
      icon: catIcon,
      color: catColor,
      order: isNew ? maxOrder + 1 : editingCategory!.order,
      archived: editingCategory?.archived || false,
      type: catType,
    };
    await db.categories.put(cat);
    setEditingCategory(null);
    showToast(isNew ? 'Category added' : 'Category updated');
  };

  const handleArchiveCategory = async (cat: Category) => {
    await db.categories.update(cat.id, { archived: !cat.archived });
    showToast(cat.archived ? 'Category restored' : 'Category archived');
  };

  const handleMoveCategoryOrder = async (cat: Category, direction: 'up' | 'down') => {
    const sametype = allCategories.filter(c => c.type === cat.type).sort((a, b) => a.order - b.order);
    const idx = sametype.findIndex(c => c.id === cat.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sametype.length) return;
    const tmpOrder = sametype[idx].order;
    await db.categories.update(sametype[idx].id, { order: sametype[swapIdx].order });
    await db.categories.update(sametype[swapIdx].id, { order: tmpOrder });
  };

  const openPMEditor = (pm?: PaymentMethod) => {
    if (pm) {
      setEditingPM(pm);
      setPmName(pm.name);
    } else {
      setEditingPM({ id: '', name: '', type: 'custom', archived: false, order: 0 });
      setPmName('');
    }
  };

  const handleSavePM = async () => {
    if (!pmName.trim()) return;
    const isNew = !editingPM?.id;
    const maxOrder = allPaymentMethods.reduce((m, p) => Math.max(m, p.order), 0);
    const pm: PaymentMethod = {
      id: editingPM?.id || uuid(),
      name: pmName.trim(),
      type: editingPM?.type || 'custom',
      archived: editingPM?.archived || false,
      order: isNew ? maxOrder + 1 : editingPM!.order,
    };
    await db.paymentMethods.put(pm);
    setEditingPM(null);
    showToast(isNew ? 'Payment method added' : 'Payment method updated');
  };

  const handleClearData = async () => {
    await Promise.all([
      db.transactions.clear(),
      db.budgets.clear(),
      db.recurringRules.clear(),
      db.persons.clear(),
      db.ledgerEntries.clear(),
      db.savingsGoals.clear(),
    ]);
    setShowDeleteConfirm(false);
    showToast('All transaction data cleared');
  };

  const themeOptions: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
    { mode: 'light', icon: Sun, label: 'Light' },
    { mode: 'dark', icon: Moon, label: 'Dark' },
    { mode: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <div className="pb-8 px-4 space-y-6">
      <div className="pt-4">
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* Theme */}
      <section>
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Appearance</h2>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-1.5 flex border border-gray-100 dark:border-gray-800">
          {themeOptions.map(({ mode, icon: Icon, label }) => (
            <button key={mode} onClick={() => updateSettings({ theme: mode })}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${settings.theme === mode ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400'
                }`}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </section>

      {/* Preferences */}
      <section>
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Preferences</h2>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Month starts on day</p>
              <p className="text-xs text-gray-500 mt-0.5">For salary cycles</p>
            </div>
            <input type="number" min={1} max={28} value={settings.monthStartDay}
              onChange={e => updateSettings({ monthStartDay: Math.min(28, Math.max(1, parseInt(e.target.value) || 1)) })}
              className="w-16 text-center py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-bold outline-none" />
          </div>
          <div className="p-4 flex items-center justify-between">
            <p className="text-sm font-semibold">Week starts on</p>
            <select value={settings.firstDayOfWeek} onChange={e => updateSettings({ firstDayOfWeek: parseInt(e.target.value) })}
              className="py-1.5 px-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-bold outline-none appearance-none cursor-pointer">
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </select>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expense Categories</h2>
          <button onClick={() => { setCatType('expense'); openCategoryEditor(); }}
            className="text-xs text-indigo-500 font-semibold flex items-center gap-1">
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          {expenseCategories.map(cat => (
            <div key={cat.id} className={`p-3 flex items-center gap-3 ${cat.archived ? 'opacity-50' : ''}`}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: cat.color + '15' }}>
                <DynamicIcon name={cat.icon} size={16} style={{ color: cat.color }} />
              </div>
              <span className="flex-1 text-sm font-medium">{cat.name}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => handleMoveCategoryOrder(cat, 'up')} className="p-1 text-gray-300 hover:text-gray-500"><ArrowUp size={14} /></button>
                <button onClick={() => handleMoveCategoryOrder(cat, 'down')} className="p-1 text-gray-300 hover:text-gray-500"><ArrowDown size={14} /></button>
                <button onClick={() => openCategoryEditor(cat)} className="p-1 text-gray-400 hover:text-indigo-500">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3 mt-6">
          <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Income Categories</h2>
          <button onClick={() => { setCatType('income'); openCategoryEditor(); }}
            className="text-xs text-indigo-500 font-semibold flex items-center gap-1">
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          {incomeCategories.map(cat => (
            <div key={cat.id} className={`p-3 flex items-center gap-3 ${cat.archived ? 'opacity-50' : ''}`}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: cat.color + '15' }}>
                <DynamicIcon name={cat.icon} size={16} style={{ color: cat.color }} />
              </div>
              <span className="flex-1 text-sm font-medium">{cat.name}</span>
              <button onClick={() => openCategoryEditor(cat)} className="p-1 text-gray-400 hover:text-indigo-500">
                <ChevronRight size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Payment Methods */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Payment Methods</h2>
          <button onClick={() => openPMEditor()} className="text-xs text-indigo-500 font-semibold flex items-center gap-1">
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          {allPaymentMethods.map(pm => (
            <div key={pm.id} className={`p-3 flex items-center gap-3 ${pm.archived ? 'opacity-50' : ''}`}>
              <span className="flex-1 text-sm font-medium">{pm.name}</span>
              <button onClick={() => openPMEditor(pm)} className="p-1 text-gray-400 hover:text-indigo-500">
                <ChevronRight size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Data */}
      <section>
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Data</h2>
        <div className="space-y-2">
          <button onClick={async () => { const count = await loadDemoData(); showToast(`Loaded ${count} sample transactions, budgets & splits!`); }}
            className="w-full bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 rounded-2xl p-4 border border-indigo-200 dark:border-indigo-800 flex items-center gap-3 text-left hover:border-indigo-300 transition-all">
            <Sparkles size={18} className="text-indigo-500" />
            <div>
              <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Load Sample Student / Founder Data</p>
              <p className="text-xs text-indigo-500/80">Populate realistic spends (chai, Swiggy, auto, stipend, split dinner)</p>
            </div>
          </button>
          <button onClick={handleExportCSV}
            className="w-full bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 flex items-center gap-3 text-left hover:border-gray-200 transition-all">
            <Download size={18} className="text-indigo-500" />
            <div><p className="text-sm font-semibold">Export CSV</p><p className="text-xs text-gray-500">Download transactions as spreadsheet</p></div>
          </button>
          <button onClick={handleExportJSON}
            className="w-full bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 flex items-center gap-3 text-left hover:border-gray-200 transition-all">
            <Download size={18} className="text-green-500" />
            <div><p className="text-sm font-semibold">Export JSON Backup</p><p className="text-xs text-gray-500">Full backup of all data</p></div>
          </button>
          <label className="w-full bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 flex items-center gap-3 text-left hover:border-gray-200 transition-all cursor-pointer">
            <Upload size={18} className="text-blue-500" />
            <div><p className="text-sm font-semibold">Import Backup</p><p className="text-xs text-gray-500">Restore from JSON backup file</p></div>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={() => setShowDeleteConfirm(true)}
            className="w-full bg-white dark:bg-gray-900 rounded-2xl p-4 border border-red-100 dark:border-red-900/50 flex items-center gap-3 text-left hover:border-red-200 transition-all">
            <Trash2 size={18} className="text-red-500" />
            <div><p className="text-sm font-semibold text-red-600">Clear All Data</p><p className="text-xs text-gray-500">Delete all transactions (keeps categories)</p></div>
          </button>
        </div>
      </section>

      {/* Privacy */}
      <section className="flex items-center gap-3 px-2 text-gray-400 dark:text-gray-600">
        <Shield size={16} />
        <p className="text-xs">Your data stays on this device. No analytics or tracking.</p>
      </section>

      {/* About */}
      <section className="text-center text-xs text-gray-400 dark:text-gray-600 pb-4">
        <p className="font-semibold">Expense Tracker v1.0</p>
        <p className="mt-1">Made with ❤️ for tracking every rupee</p>
      </section>

      {/* Category Edit Modal */}
      <AnimatePresence>
        {editingCategory && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setEditingCategory(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">{editingCategory.id ? 'Edit' : 'Add'} Category</h3>
                <button onClick={() => setEditingCategory(null)} className="p-1"><X size={20} /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Name</label>
                  <input type="text" value={catName} onChange={e => setCatName(e.target.value)} placeholder="Category name"
                    className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" autoFocus />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map(color => (
                      <button key={color} onClick={() => setCatColor(color)}
                        className={`w-8 h-8 rounded-full transition-all ${catColor === color ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'hover:scale-110'}`}
                        style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Icon</label>
                  <button onClick={() => setShowIconPicker(!showIconPicker)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl">
                    <DynamicIcon name={catIcon} size={18} style={{ color: catColor }} />
                    <span className="text-sm">{catIcon}</span>
                  </button>
                  {showIconPicker && (
                    <div className="mt-2 grid grid-cols-7 gap-1.5 max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded-xl p-2">
                      {ICON_OPTIONS.map(icon => (
                        <button key={icon} onClick={() => { setCatIcon(icon); setShowIconPicker(false); }}
                          className={`p-2 rounded-lg transition-all ${catIcon === icon ? 'bg-indigo-100 dark:bg-indigo-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                          <DynamicIcon name={icon} size={18} style={{ color: catColor }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  {editingCategory.id && (
                    <button onClick={() => { handleArchiveCategory(editingCategory); setEditingCategory(null); }}
                      className="py-3 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-red-500">
                      {editingCategory.archived ? 'Restore' : 'Archive'}
                    </button>
                  )}
                  <button onClick={handleSaveCategory}
                    className="flex-1 py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600">
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Payment Method Edit Modal */}
      <AnimatePresence>
        {editingPM && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setEditingPM(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-2xl">
              <h3 className="text-lg font-bold mb-4">{editingPM.id ? 'Edit' : 'Add'} Payment Method</h3>
              <input type="text" value={pmName} onChange={e => setPmName(e.target.value)} placeholder="e.g. SBI UPI"
                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 mb-4" autoFocus />
              <div className="flex gap-3">
                {editingPM.id && (
                  <button onClick={async () => { await db.paymentMethods.update(editingPM.id, { archived: !editingPM.archived }); setEditingPM(null); showToast(editingPM.archived ? 'Restored' : 'Archived'); }}
                    className="py-3 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-red-500">
                    {editingPM.archived ? 'Restore' : 'Archive'}
                  </button>
                )}
                <button onClick={handleSavePM}
                  className="flex-1 py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600">Save</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setShowDeleteConfirm(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-2xl">
              <h3 className="text-lg font-bold mb-2">Clear All Data?</h3>
              <p className="text-sm text-gray-500 mb-4">This will delete all transactions, budgets, and other records. Categories and payment methods will be kept. This cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold">Cancel</button>
                <button onClick={handleClearData}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600">Delete All</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

