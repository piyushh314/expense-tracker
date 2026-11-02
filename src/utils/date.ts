// ============================================================
// Date utilities — local calendar dates as YYYY-MM-DD strings
// ============================================================
import {
  format,
  parse,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  subMonths,
  subDays,
  addMonths,
  addDays,
  differenceInDays,
  isToday,
  isYesterday,
  isSameMonth,
  isSameYear,
  getDay,
  eachDayOfInterval,
  startOfYear,
  endOfYear,
  subYears,
} from 'date-fns';

const DATE_FORMAT = 'yyyy-MM-dd';

export function today(): string {
  return format(new Date(), DATE_FORMAT);
}

export function parseDate(dateStr: string): Date {
  return parse(dateStr, DATE_FORMAT, new Date());
}

export function formatDate(dateStr: string): string {
  const d = parseDate(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  if (isSameYear(d, new Date())) return format(d, 'd MMM');
  return format(d, 'd MMM yyyy');
}

export function formatDateFull(dateStr: string): string {
  return format(parseDate(dateStr), 'd MMMM yyyy');
}

export function formatDateShort(dateStr: string): string {
  return format(parseDate(dateStr), 'd MMM');
}

export function formatMonthYear(dateStr: string): string {
  return format(parseDate(dateStr), 'MMMM yyyy');
}

export function formatMonth(dateStr: string): string {
  return format(parseDate(dateStr), 'MMM');
}

export function toDateString(date: Date): string {
  return format(date, DATE_FORMAT);
}

export function getWeekday(dateStr: string): string {
  return format(parseDate(dateStr), 'EEE');
}

export function getWeekdayIndex(dateStr: string): number {
  return getDay(parseDate(dateStr));
}

// Period helpers — all return { from: string, to: string }
export interface DateRange {
  from: string;
  to: string;
}

export function getCurrentMonth(monthStartDay: number = 1): DateRange {
  const now = new Date();
  if (monthStartDay === 1) {
    return {
      from: toDateString(startOfMonth(now)),
      to: toDateString(endOfMonth(now)),
    };
  }
  const currentDay = now.getDate();
  let start: Date;
  let end: Date;
  if (currentDay >= monthStartDay) {
    start = new Date(now.getFullYear(), now.getMonth(), monthStartDay);
    end = new Date(now.getFullYear(), now.getMonth() + 1, monthStartDay - 1);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 1, monthStartDay);
    end = new Date(now.getFullYear(), now.getMonth(), monthStartDay - 1);
  }
  return { from: toDateString(start), to: toDateString(end) };
}

export function getPreviousMonth(monthStartDay: number = 1): DateRange {
  const current = getCurrentMonth(monthStartDay);
  const fromDate = parseDate(current.from);
  const prevFrom = subMonths(fromDate, 1);
  const prevTo = subDays(fromDate, 1);
  return { from: toDateString(prevFrom), to: toDateString(prevTo) };
}

export function getCurrentWeek(firstDayOfWeek: number = 1): DateRange {
  const now = new Date();
  return {
    from: toDateString(startOfWeek(now, { weekStartsOn: firstDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6 })),
    to: toDateString(endOfWeek(now, { weekStartsOn: firstDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6 })),
  };
}

export function getCurrentYear(): DateRange {
  const now = new Date();
  return {
    from: toDateString(startOfYear(now)),
    to: toDateString(endOfYear(now)),
  };
}

export function getPreviousYear(): DateRange {
  const now = subYears(new Date(), 1);
  return {
    from: toDateString(startOfYear(now)),
    to: toDateString(endOfYear(now)),
  };
}

export function getDaysInRange(range: DateRange): string[] {
  const from = parseDate(range.from);
  const to = parseDate(range.to);
  return eachDayOfInterval({ start: from, end: to }).map(d => toDateString(d));
}

export function getDaysRemaining(range: DateRange): number {
  const to = parseDate(range.to);
  const now = new Date();
  const diff = differenceInDays(to, now);
  return Math.max(0, diff + 1); // include today
}

export function isInRange(dateStr: string, range: DateRange): boolean {
  return dateStr >= range.from && dateStr <= range.to;
}

export function isSameMonthStr(a: string, b: string): boolean {
  return isSameMonth(parseDate(a), parseDate(b));
}

export { addMonths, addDays, subMonths, subDays, differenceInDays };

