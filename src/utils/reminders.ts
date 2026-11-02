// ============================================================
// Reminders & Calendar (.ICS) Utilities
// Standalone offline reminder generation, snooze calculations,
// WhatsApp reminder messages, and RFC 5545 iCalendar export.
// ============================================================

import { v4 as uuid } from 'uuid';
import { formatINR } from './money';

export type ReminderTone = 'gentle' | 'casual' | 'direct';

export interface WhatsAppReminderOptions {
  personName: string;
  amountPaise: number;
  note?: string;
  userUpiId?: string;
  phone?: string;
  tone?: ReminderTone;
}

/**
 * Generate a personalized WhatsApp reminder message with optional UPI pay link.
 */
export function generateWhatsAppReminderMessage(options: WhatsAppReminderOptions): {
  message: string;
  whatsappUrl: string;
} {
  const { personName, amountPaise, note, userUpiId, phone, tone = 'gentle' } = options;
  const formattedAmount = formatINR(amountPaise);
  const noteSnippet = note ? ` for ${note}` : '';
  const rupees = amountPaise / 100;

  const upiLink = userUpiId
    ? `upi://pay?pa=${encodeURIComponent(userUpiId)}&pn=ExpenseTracker&am=${rupees}&cu=INR`
    : null;

  let text = '';
  switch (tone) {
    case 'gentle':
      text = `Hey ${personName}! Hope you're doing well. Just a gentle reminder about ${formattedAmount}${noteSnippet} from earlier. Whenever you get a chance, no rush!`;
      if (userUpiId && upiLink) {
        text += `\n\nUPI: ${userUpiId}\nPay link: ${upiLink}`;
      }
      break;

    case 'casual':
      text = `Hey ${personName}, quick ping for ${formattedAmount}${note ? ` (${note})` : ''} when you get a sec.`;
      if (userUpiId && upiLink) {
        text += ` GPay/UPI me here: ${userUpiId}\nPayment link: ${upiLink}`;
      }
      text += `\nCheers!`;
      break;

    case 'direct':
      text = `Hi ${personName}, sharing a reminder to settle ${formattedAmount}${noteSnippet}.`;
      if (userUpiId && upiLink) {
        text += `\n\nUPI ID: ${userUpiId}\nOne-tap pay: ${upiLink}`;
      }
      text += `\nThanks!`;
      break;
  }

  // Format WhatsApp URL
  let cleanPhone = '';
  if (phone) {
    cleanPhone = phone.replace(/[^\d+]/g, '');
    // If Indian 10-digit number without country code, prepend 91
    if (/^\d{10}$/.test(cleanPhone)) {
      cleanPhone = '91' + cleanPhone;
    }
  }

  const whatsappUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  return {
    message: text,
    whatsappUrl,
  };
}

/**
 * Format a calendar date (YYYY-MM-DD) into ICS format (YYYYMMDD).
 */
export function formatIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/**
 * Format timestamp into ICS UTC format: YYYYMMDDTHHMMSSZ.
 */
export function formatIcsTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export interface IcsCalendarOptions {
  personName: string;
  amountPaise: number;
  direction: 'owes_me' | 'i_owe';
  targetDate: string; // YYYY-MM-DD
  note?: string;
  userUpiId?: string;
}

/**
 * Generate a standard RFC 5545 iCalendar (.ics) string.
 * Native phone & desktop calendar apps (Google Calendar, Apple Calendar, Outlook)
 * fire real alerts offline even when the app is completely closed.
 */
export function generateIcsCalendarEvent(options: IcsCalendarOptions): string {
  const { personName, amountPaise, direction, targetDate, note, userUpiId } = options;
  const isOwed = direction === 'owes_me';
  const formattedAmount = formatINR(amountPaise);

  const summary = isOwed
    ? `Reminder: ${personName} owes you ${formattedAmount}`
    : `Reminder: You owe ${personName} ${formattedAmount}`;

  let description = `${summary}${note ? ` (${note})` : ''}.`;
  if (userUpiId && isOwed) {
    description += ` UPI ID: ${userUpiId}`;
  }

  const icsDate = formatIcsDate(targetDate);
  const nowStamp = formatIcsTimestamp(new Date());
  const uid = `${uuid()}@expensetracker.app`;

  // Set event start at 10:00 AM local time, duration 30 minutes
  const dtStart = `${icsDate}T100000`;
  const dtEnd = `${icsDate}T103000`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Personal Expense Tracker//People Ledger//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Trigger file download of an .ics calendar file in the browser.
 */
export function downloadIcsFile(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.ics') ? filename : `${filename}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Compute snooze target date YYYY-MM-DD from today.
 */
export function computeSnoozeDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Request browser notification permission.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return await Notification.requestPermission();
}

/**
 * Trigger an in-browser notification if permission is granted.
 */
export function showBrowserNotification(title: string, options?: NotificationOptions): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        ...options,
      });
    } catch {
      // In some environments, Notification constructor might throw without service worker
    }
  }
}
