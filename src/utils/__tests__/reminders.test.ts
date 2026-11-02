import { describe, it, expect } from 'vitest';
import {
  generateWhatsAppReminderMessage,
  generateIcsCalendarEvent,
  formatIcsDate,
  computeSnoozeDate,
} from '../reminders';

describe('People Ledger Reminder Utilities (Step 5)', () => {
  describe('WhatsApp Reminder Message Generator', () => {
    it('generates gentle tone with UPI ID and payment link', () => {
      const res = generateWhatsAppReminderMessage({
        personName: 'Rohit',
        amountPaise: 34000, // ₹340
        note: 'dinner',
        userUpiId: 'myname@upi',
        phone: '9876543210',
        tone: 'gentle',
      });

      expect(res.message).toContain('Hey Rohit!');
      expect(res.message).toContain('₹340');
      expect(res.message).toContain('dinner');
      expect(res.message).toContain('myname@upi');
      expect(res.message).toContain('upi://pay?pa=myname%40upi');
      expect(res.whatsappUrl).toContain('https://wa.me/919876543210?text=');
    });

    it('generates casual tone without phone number using wa.me selector', () => {
      const res = generateWhatsAppReminderMessage({
        personName: 'Ananya',
        amountPaise: 12000,
        tone: 'casual',
      });

      expect(res.message).toContain('Hey Ananya, quick ping for ₹120');
      expect(res.whatsappUrl).toContain('https://wa.me/?text=');
    });

    it('generates direct tone correctly', () => {
      const res = generateWhatsAppReminderMessage({
        personName: 'Vikram',
        amountPaise: 50000,
        userUpiId: 'vikram@okaxis',
        tone: 'direct',
      });

      expect(res.message).toContain('Hi Vikram, sharing a reminder to settle ₹500');
      expect(res.message).toContain('UPI ID: vikram@okaxis');
    });
  });

  describe('RFC 5545 iCalendar (.ICS) Export', () => {
    it('generates a valid .ics calendar string with alarm for phone calendar', () => {
      const ics = generateIcsCalendarEvent({
        personName: 'Rohit',
        amountPaise: 34000,
        direction: 'owes_me',
        targetDate: '2026-11-10',
        note: 'shared groceries',
        userUpiId: 'rohit@upi',
      });

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('DTSTART:20261110T100000');
      expect(ics).toContain('DTEND:20261110T103000');
      expect(ics).toContain('SUMMARY:Reminder: Rohit owes you ₹340');
      expect(ics).toContain('BEGIN:VALARM');
      expect(ics).toContain('TRIGGER:-PT15M');
      expect(ics).toContain('END:VALARM');
      expect(ics).toContain('END:VEVENT');
      expect(ics).toContain('END:VCALENDAR');
    });

    it('formats ICS date YYYYMMDD correctly', () => {
      expect(formatIcsDate('2026-11-02')).toBe('20261102');
    });
  });

  describe('Snooze Date Calculation', () => {
    it('calculates snooze date for 1 day, 3 days, and 7 days', () => {
      const d1 = computeSnoozeDate(1);
      const d3 = computeSnoozeDate(3);
      const d7 = computeSnoozeDate(7);

      expect(typeof d1).toBe('string');
      expect(d1).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d3).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d7).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d1 < d3).toBe(true);
      expect(d3 < d7).toBe(true);
    });
  });
});
