// ============================================================
// Money utilities — paise integers, INR formatting
// ============================================================

/**
 * Convert rupee amount (number or string with math) to paise integer.
 * Supports simple math like "120+80" → 20000 paise.
 */
export function toPaise(input: string | number): number {
  if (typeof input === 'number') {
    return Math.round(input * 100);
  }
  const sanitized = input.replace(/[₹,\s]/g, '');
  if (!sanitized) return 0;

  // Support simple math: +, -, *, /
  try {
    // Only allow digits, decimal points, and basic math operators
    if (!/^[\d.+\-*/() ]+$/.test(sanitized)) return 0;
    // Use Function constructor to evaluate math expression safely
    const result = new Function(`return (${sanitized})`)() as number;
    if (typeof result !== 'number' || !isFinite(result)) return 0;
    return Math.round(result * 100);
  } catch {
    return 0;
  }
}

/**
 * Convert paise integer to rupee number.
 */
export function toRupees(paise: number): number {
  return paise / 100;
}

/**
 * Format paise as INR string with ₹ symbol and Indian number format.
 * Example: 12345678 paise → "₹1,23,456.78"
 * For whole rupees (no paise): 12300 → "₹123"
 */
export function formatINR(paise: number, showDecimal: boolean = false): string {
  const rupees = Math.abs(paise) / 100;
  const isNegative = paise < 0;

  let formatted: string;
  if (showDecimal || rupees % 1 !== 0) {
    formatted = formatIndianNumber(rupees, 2);
  } else {
    formatted = formatIndianNumber(rupees, 0);
  }

  return `${isNegative ? '-' : ''}₹${formatted}`;
}

/**
 * Format number with Indian grouping (1,23,456).
 */
function formatIndianNumber(num: number, decimals: number): string {
  const parts = num.toFixed(decimals).split('.');
  let intPart = parts[0];
  const decPart = parts[1];

  // Indian grouping: last 3 digits, then groups of 2
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const groups: string[] = [];
    for (let i = rest.length; i > 0; i -= 2) {
      groups.unshift(rest.slice(Math.max(0, i - 2), i));
    }
    intPart = groups.join(',') + ',' + last3;
  }

  return decPart !== undefined ? `${intPart}.${decPart}` : intPart;
}

/**
 * Format paise as compact string for charts/cards.
 * e.g. 1234500 → "₹12.3K", 12345600 → "₹1.23L"
 */
export function formatINRCompact(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? '-' : '';

  if (rupees >= 10000000) {
    return `${sign}₹${(rupees / 10000000).toFixed(1)}Cr`;
  }
  if (rupees >= 100000) {
    return `${sign}₹${(rupees / 100000).toFixed(1)}L`;
  }
  if (rupees >= 1000) {
    return `${sign}₹${(rupees / 1000).toFixed(1)}K`;
  }
  return `${sign}₹${rupees.toFixed(0)}`;
}

/**
 * Parse an amount string that may contain simple math.
 * Returns the evaluated result as a number (in rupees).
 */
export function evaluateMathExpression(input: string): number | null {
  const sanitized = input.replace(/[₹,\s]/g, '');
  if (!sanitized) return null;
  if (!/^[\d.+\-*/() ]+$/.test(sanitized)) return null;
  try {
    const result = new Function(`return (${sanitized})`)() as number;
    if (typeof result !== 'number' || !isFinite(result) || result < 0) return null;
    return result;
  } catch {
    return null;
  }
}

