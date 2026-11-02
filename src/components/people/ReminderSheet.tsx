import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  MessageSquare,
  Calendar,
  Send,
  Copy,
  Clock,
  Download,
  Bell,
  CheckCircle2,
} from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { db } from '../../db';
import { formatINR } from '../../utils/money';
import { today } from '../../utils/date';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { getPersonInitials } from '../../utils/peopleLedger';
import {
  generateWhatsAppReminderMessage,
  generateIcsCalendarEvent,
  downloadIcsFile,
  computeSnoozeDate,
  requestNotificationPermission,
  showBrowserNotification,
  type ReminderTone,
} from '../../utils/reminders';
import type { Person, LedgerEntry } from '../../types';

interface ReminderSheetProps {
  isOpen: boolean;
  onClose: () => void;
  person: Person | null;
  entry?: LedgerEntry | null;
  netPaise: number;
  onSettleRequested?: () => void;
}

type TabType = 'message' | 'schedule';

export default function ReminderSheet({
  isOpen,
  onClose,
  person,
  entry,
  netPaise,
  onSettleRequested,
}: ReminderSheetProps) {
  const { settings, updateSettings } = useSettings();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('message');
  const [tone, setTone] = useState<ReminderTone>('gentle');
  const [userUpiId, setUserUpiId] = useState(settings.userUpiId || '');
  const [customSnoozeDate, setCustomSnoozeDate] = useState(computeSnoozeDate(3));
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );

  const amountPaise = entry ? entry.amount : Math.abs(netPaise);
  const isOwedToMe = entry ? entry.direction === 'they_owe_me' : netPaise > 0;

  // Generate WhatsApp message preview
  const { message, whatsappUrl } = useMemo(() => {
    if (!person) return { message: '', whatsappUrl: '' };
    return generateWhatsAppReminderMessage({
      personName: person.name,
      amountPaise,
      note: entry?.note,
      userUpiId: userUpiId.trim() || undefined,
      phone: person.phone,
      tone,
    });
  }, [person, amountPaise, entry, userUpiId, tone]);

  if (!isOpen || !person) return null;

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      showToast('Reminder message copied to clipboard');
      if (userUpiId !== settings.userUpiId) {
        updateSettings({ userUpiId: userUpiId.trim() });
      }
    } catch {
      showToast('Could not copy message');
    }
  };

  const handleOpenWhatsApp = () => {
    if (userUpiId !== settings.userUpiId) {
      updateSettings({ userUpiId: userUpiId.trim() });
    }
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    showToast('Opening WhatsApp...');
  };

  const handleSnooze = async (days: number, label: string) => {
    const targetDate = computeSnoozeDate(days);
    await db.ledgerReminders.add({
      id: uuid(),
      personId: person.id,
      entryId: entry?.id || null,
      nextRemindAt: targetDate,
      snoozedUntil: targetDate,
      active: true,
    });
    showToast(`Reminder snoozed for ${label} (until ${targetDate})`);
    onClose();
  };

  const handleCustomDateSnooze = async () => {
    if (!customSnoozeDate) return;
    await db.ledgerReminders.add({
      id: uuid(),
      personId: person.id,
      entryId: entry?.id || null,
      nextRemindAt: customSnoozeDate,
      snoozedUntil: customSnoozeDate,
      active: true,
    });
    showToast(`Reminder set for ${customSnoozeDate}`);
    onClose();
  };

  const handleDownloadCalendarIcs = () => {
    const icsContent = generateIcsCalendarEvent({
      personName: person.name,
      amountPaise,
      direction: isOwedToMe ? 'owes_me' : 'i_owe',
      targetDate: customSnoozeDate || today(),
      note: entry?.note,
      userUpiId: userUpiId.trim() || undefined,
    });

    const filename = `Reminder-${person.name.replace(/\s+/g, '_')}-${formatINR(amountPaise)}`;
    downloadIcsFile(filename, icsContent);
    showToast('Calendar event (.ics) downloaded! Open to add to phone calendar.');
  };

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotificationStatus(perm);
    if (perm === 'granted') {
      showToast('Browser notifications enabled!');
      showBrowserNotification('Expense Tracker Reminders', {
        body: `Notifications active for ${person.name} and your other contacts.`,
      });
    } else {
      showToast('Notifications permission not granted');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal Card */}
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative z-10 w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-3xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800"
        >
          {/* Grab Bar (Mobile) */}
          <div className="flex justify-center -mt-2 pb-3 md:hidden">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0 shadow-sm"
                style={{ backgroundColor: person.color }}
              >
                {getPersonInitials(person.name)}
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                  Remind {person.name}
                </h3>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {isOwedToMe ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Owes you {formatINR(amountPaise)}
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      You owe {formatINR(amountPaise)}
                    </span>
                  )}
                  {entry?.note && <span> · {entry.note}</span>}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mt-4">
            <button
              onClick={() => setActiveTab('message')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'message'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <MessageSquare size={14} /> Send Reminder Message
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'schedule'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Clock size={14} /> Schedule & Calendar
            </button>
          </div>

          {/* TAB 1: MESSAGE & WHATSAPP */}
          {activeTab === 'message' && (
            <div className="space-y-4 pt-4">
              {/* Tone Selector */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                  Message Tone
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['gentle', 'casual', 'direct'] as ReminderTone[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold capitalize transition-all ${
                        tone === t
                          ? 'bg-indigo-500 text-white shadow-sm ring-2 ring-indigo-400/40'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Your UPI ID Input */}
              {isOwedToMe && (
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                    Your UPI ID (included for 1-tap payment)
                  </label>
                  <input
                    type="text"
                    value={userUpiId}
                    onChange={e => setUserUpiId(e.target.value)}
                    placeholder="e.g. yourname@okhdfcbank"
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl text-xs font-semibold outline-none border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500/30 text-gray-900 dark:text-white"
                  />
                </div>
              )}

              {/* Live Message Preview */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Preview
                </label>
                <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/80 rounded-2xl text-xs text-gray-800 dark:text-gray-200 font-medium whitespace-pre-wrap leading-relaxed">
                  {message}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={handleCopyMessage}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Copy size={14} /> Copy Message
                </button>
                <button
                  onClick={handleOpenWhatsApp}
                  className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                >
                  <Send size={14} /> Send WhatsApp
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: SCHEDULE, SNOOZE & CALENDAR */}
          {activeTab === 'schedule' && (
            <div className="space-y-4 pt-4">
              {/* Quick Snooze Options */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                  Quick Snooze Reminder
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleSnooze(1, 'tomorrow')}
                    className="py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 text-xs font-semibold hover:border-indigo-400 transition-all text-center"
                  >
                    Tomorrow
                    <span className="block text-[10px] text-gray-400 font-normal">+1 day</span>
                  </button>
                  <button
                    onClick={() => handleSnooze(3, '3 days')}
                    className="py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 text-xs font-semibold hover:border-indigo-400 transition-all text-center"
                  >
                    In 3 Days
                    <span className="block text-[10px] text-gray-400 font-normal">+3 days</span>
                  </button>
                  <button
                    onClick={() => handleSnooze(7, '1 week')}
                    className="py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 text-xs font-semibold hover:border-indigo-400 transition-all text-center"
                  >
                    In 1 Week
                    <span className="block text-[10px] text-gray-400 font-normal">+7 days</span>
                  </button>
                </div>
              </div>

              {/* Custom Date Picker */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                  Remind On Specific Date
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={customSnoozeDate}
                    onChange={e => setCustomSnoozeDate(e.target.value)}
                    min={today()}
                    className="flex-1 px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl text-xs font-semibold outline-none border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-indigo-500/30 text-gray-900 dark:text-white"
                  />
                  <button
                    onClick={handleCustomDateSnooze}
                    className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-all"
                  >
                    Set Date
                  </button>
                </div>
              </div>

              {/* Guaranteed Phone Calendar Alert (.ICS) */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 space-y-2">
                <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-bold text-xs">
                  <Calendar size={16} className="text-indigo-500" />
                  <span>Guaranteed Phone Calendar Alert (.ics)</span>
                </div>
                <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300 leading-relaxed">
                  Generates a standard calendar event with an alarm. Fires directly on your phone or computer even when the app is completely closed.
                </p>
                <button
                  onClick={handleDownloadCalendarIcs}
                  className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-500/20 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Download size={14} /> Download .ics to Add to Calendar
                </button>
              </div>

              {/* Browser Notification Status */}
              <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-gray-400" />
                  <div>
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      Browser Notifications
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {notificationStatus === 'granted'
                        ? 'Active when app is open'
                        : 'Permission not enabled'}
                    </p>
                  </div>
                </div>

                {notificationStatus !== 'granted' && (
                  <button
                    onClick={handleEnableNotifications}
                    className="px-2.5 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Enable
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Quick Settle footer option */}
          <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
            <span className="text-gray-400">Already got paid?</span>
            <button
              onClick={() => {
                onClose();
                onSettleRequested?.();
              }}
              className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <CheckCircle2 size={13} /> Settle Up Now
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
