import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, List, BarChart3, Presentation, Settings, Plus, Wallet, Users, MoreHorizontal, X } from 'lucide-react';
import { SettingsProvider } from './contexts/SettingsContext';
import { ToastProvider } from './contexts/ToastContext';
import { seedDatabase } from './db';
import HomeScreen from './screens/HomeScreen';
import TransactionsScreen from './screens/TransactionsScreen';
import InsightsScreen from './screens/InsightsScreen';
import PresentScreen from './screens/PresentScreen';
import BudgetsScreen from './screens/BudgetsScreen';
import PeopleScreen from './screens/PeopleScreen';
import SettingsScreen from './screens/SettingsScreen';
import QuickAdd from './components/QuickAdd';
import type { Transaction } from './types';

type Screen = 'home' | 'transactions' | 'insights' | 'present' | 'budgets' | 'people' | 'settings';

function AppContent() {
  const [screen, setScreen] = useState<Screen>('home');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  useEffect(() => {
    seedDatabase();
  }, []);

  const handleEdit = (txn: Transaction) => {
    setEditTransaction(txn);
    setQuickAddOpen(true);
  };

  const handleCloseQuickAdd = () => {
    setQuickAddOpen(false);
    setEditTransaction(null);
  };

  const navItems: { id: Screen; icon: typeof Home; label: string }[] = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'transactions', icon: List, label: 'History' },
    { id: 'insights', icon: BarChart3, label: 'Insights' },
    { id: 'present', icon: Presentation, label: 'Present' },
    { id: 'budgets', icon: Wallet, label: 'Budgets' },
    { id: 'people', icon: Users, label: 'People' },
  ];

  // Don't show tab bar in presentation mode
  const showTabBar = screen !== 'present';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Desktop sidebar + Mobile content */}
      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4 shrink-0">
          <div className="flex items-center gap-3 px-3 py-4 mb-4">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Wallet size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Expense</h1>
              <p className="text-xs text-gray-500 font-medium">Tracker & Insights</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map(item => (
              <button key={item.id} onClick={() => setScreen(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  screen === item.id
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}>
                <item.icon size={18} />
                {item.label}
              </button>
            ))}

            <div className="h-px bg-gray-200 dark:bg-gray-800 my-3" />

            <button onClick={() => setScreen('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                screen === 'settings'
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}>
              <Settings size={18} />
              Settings
            </button>
          </nav>

          <button onClick={() => setQuickAddOpen(true)}
            className="w-full py-3 rounded-2xl gradient-primary text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 hover:shadow-xl transition-all mt-4 active:scale-95">
            <Plus size={18} />
            Quick Add Spend
          </button>
        </aside>

        {/* Main Content */}
        <main className="flex-1 md:max-w-3xl pb-24 md:pb-6 md:px-6 mx-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {screen === 'home' && (
                <HomeScreen
                  onNavigate={s => setScreen(s as Screen)}
                  onAddNew={() => setQuickAddOpen(true)}
                  onEditTransaction={handleEdit}
                />
              )}
              {screen === 'transactions' && (
                <TransactionsScreen onEdit={handleEdit} />
              )}
              {screen === 'insights' && <InsightsScreen />}
              {screen === 'present' && <PresentScreen />}
              {screen === 'budgets' && <BudgetsScreen />}
              {screen === 'people' && <PeopleScreen />}
              {screen === 'settings' && <SettingsScreen />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      {showTabBar && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 tab-bar z-40">
          <div className="flex items-center justify-around px-2 pt-1.5 pb-1">
            <button onClick={() => setScreen('home')}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-all ${
                screen === 'home' ? 'text-indigo-500 font-semibold' : 'text-gray-400 dark:text-gray-500'
              }`}>
              <Home size={20} strokeWidth={screen === 'home' ? 2.5 : 2} />
              <span className="text-[10px]">Home</span>
            </button>

            <button onClick={() => setScreen('transactions')}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-all ${
                screen === 'transactions' ? 'text-indigo-500 font-semibold' : 'text-gray-400 dark:text-gray-500'
              }`}>
              <List size={20} strokeWidth={screen === 'transactions' ? 2.5 : 2} />
              <span className="text-[10px]">History</span>
            </button>

            {/* Center Floating Add Button */}
            <button onClick={() => setQuickAddOpen(true)}
              className="w-13 h-13 -mt-6 rounded-2xl gradient-primary text-white shadow-lg shadow-indigo-500/40 flex items-center justify-center active:scale-90 transition-transform">
              <Plus size={26} strokeWidth={2.5} />
            </button>

            <button onClick={() => setScreen('insights')}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-all ${
                screen === 'insights' ? 'text-indigo-500 font-semibold' : 'text-gray-400 dark:text-gray-500'
              }`}>
              <BarChart3 size={20} strokeWidth={screen === 'insights' ? 2.5 : 2} />
              <span className="text-[10px]">Insights</span>
            </button>

            <button onClick={() => setMoreMenuOpen(true)}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-all ${
                ['present', 'budgets', 'people', 'settings'].includes(screen) ? 'text-indigo-500 font-semibold' : 'text-gray-400 dark:text-gray-500'
              }`}>
              <MoreHorizontal size={20} strokeWidth={['present', 'budgets', 'people', 'settings'].includes(screen) ? 2.5 : 2} />
              <span className="text-[10px]">More</span>
            </button>
          </div>
        </nav>
      )}

      {/* Mobile More Drawer Sheet */}
      <AnimatePresence>
        {moreMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 md:hidden" onClick={() => setMoreMenuOpen(false)} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-3xl p-5 shadow-2xl md:hidden">
              <div className="flex justify-center -mt-2 pb-3">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
              </div>

              <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-sm">More Features</h3>
                <button onClick={() => setMoreMenuOpen(false)} className="p-1 text-gray-400"><X size={18} /></button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1 pb-4">
                <button onClick={() => { setScreen('present'); setMoreMenuOpen(false); }}
                  className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-100 dark:border-indigo-900 flex flex-col items-start gap-1 text-left">
                  <Presentation size={20} className="text-indigo-500 mb-1" />
                  <span className="font-bold text-sm">Present</span>
                  <span className="text-[11px] text-gray-500">Auto slide deck</span>
                </button>

                <button onClick={() => { setScreen('budgets'); setMoreMenuOpen(false); }}
                  className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-100 dark:border-amber-900 flex flex-col items-start gap-1 text-left">
                  <Wallet size={20} className="text-amber-500 mb-1" />
                  <span className="font-bold text-sm">Budgets</span>
                  <span className="text-[11px] text-gray-500">Limits & safe spend</span>
                </button>

                <button onClick={() => { setScreen('people'); setMoreMenuOpen(false); }}
                  className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border border-emerald-100 dark:border-emerald-900 flex flex-col items-start gap-1 text-left">
                  <Users size={20} className="text-emerald-500 mb-1" />
                  <span className="font-bold text-sm">People</span>
                  <span className="text-[11px] text-gray-500">Lend & owe ledger</span>
                </button>

                <button onClick={() => { setScreen('settings'); setMoreMenuOpen(false); }}
                  className="p-3.5 rounded-2xl bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-800 dark:to-slate-800 border border-gray-200 dark:border-gray-700 flex flex-col items-start gap-1 text-left">
                  <Settings size={20} className="text-gray-600 dark:text-gray-300 mb-1" />
                  <span className="font-bold text-sm">Settings</span>
                  <span className="text-[11px] text-gray-500">Data, backup & theme</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Quick Add Sheet */}
      <QuickAdd isOpen={quickAddOpen} onClose={handleCloseQuickAdd} editTransaction={editTransaction} />
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </SettingsProvider>
  );
}
