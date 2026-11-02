// ============================================================
// Smart Text Entry Parser
// Parses expressions like "chai 20", "auto 80 to college", "swiggy 350 #food", "stipend 15000"
// ============================================================
import type { Category, TransactionType } from '../types';

export interface SmartParseResult {
  amount: number | null; // in rupees
  note: string;
  suggestedCategoryId: string | null;
  suggestedType: TransactionType;
  tags: string[];
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // Food & Drinks
  'Food & Drinks': ['chai', 'tea', 'coffee', 'canteen', 'swiggy', 'zomato', 'mcdonald', 'burger', 'pizza', 'biryani', 'dinner', 'lunch', 'breakfast', 'snacks', 'maggi', 'juice', 'roll', 'shawarma', 'cafe', 'bar', 'beer'],
  // Groceries
  'Groceries': ['blinkit', 'zepto', 'instamart', 'milk', 'bread', 'eggs', 'vegetables', 'fruits', 'd-mart', 'supermarket', 'ration', 'atta', 'oil'],
  // Transport
  'Transport': ['auto', 'cab', 'uber', 'ola', 'rapido', 'metro', 'bus', 'petrol', 'fuel', 'diesel', 'train', 'flight', 'toll', 'parking'],
  // Shopping
  'Shopping': ['amazon', 'flipkart', 'myntra', 'clothes', 'shoes', 'shirt', 'pants', 'tshirt', 'mall', 'electronics', 'zudio'],
  // Bills & Recharge
  'Bills & Recharge': ['recharge', 'jio', 'airtel', 'vi', 'wifi', 'electricity', 'water', 'gas', 'bill', 'broadband'],
  // Rent
  'Rent': ['rent', 'brokerage', 'deposit', 'maintenance', 'pg', 'flat'],
  // Entertainment
  'Entertainment': ['movie', 'cinema', 'bookmyshow', 'pvr', 'inox', 'game', 'steam', 'concert', 'match'],
  // Subscriptions
  'Subscriptions': ['netflix', 'spotify', 'youtube', 'prime', 'hotstar', 'apple', 'chatgpt', 'github', 'icloud'],
  // Education
  'Education': ['fee', 'course', 'udemy', 'coursera', 'books', 'exam', 'college', 'tuition', 'stationery', 'xerox'],
  // Health
  'Health': ['medicine', 'pharmacy', 'doctor', 'apollo', 'clinic', 'gym', 'protein', 'hospital'],
  // Startup/Business
  'Startup/Business': ['domain', 'hosting', 'aws', 'gcp', 'vercel', 'supabase', 'freelance', 'ads', 'meta', 'google ads', 'saas', 'api'],
  // Income
  'Salary/Stipend': ['salary', 'stipend', 'internship', 'payroll'],
  'Freelance': ['freelance', 'client', 'project', 'gig'],
  'Pocket Money': ['pocket money', 'parents', 'mom', 'dad'],
};

export function parseSmartText(text: string, categories: Category[]): SmartParseResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Extract tags (#tag)
  const tagMatches = trimmed.match(/#([a-zA-Z0-9_-]+)/g) || [];
  const tags = tagMatches.map(t => t.slice(1).toLowerCase());
  let cleanText = trimmed.replace(/#([a-zA-Z0-9_-]+)/g, '').trim();

  // Find amount: looks for digits or math pattern like 20, 150, 120+80, 50.50
  // e.g. "chai 20" or "20 chai" or "auto 80 to college"
  const amountMatch = cleanText.match(/\b(\d+(?:\.\d+)?(?:\s*[\+\-\*\/]\s*\d+(?:\.\d+)?)*)\b/);

  let amount: number | null = null;
  let remainingText = cleanText;

  if (amountMatch) {
    const rawExpr = amountMatch[1];
    try {
      if (/^[\d.+\-*/ ]+$/.test(rawExpr)) {
        const val = new Function(`return (${rawExpr})`)();
        if (typeof val === 'number' && isFinite(val) && val > 0) {
          amount = val;
          // remove the amount from text to get note
          remainingText = cleanText.replace(rawExpr, '').replace(/\s+/g, ' ').trim();
        }
      }
    } catch {
      amount = null;
    }
  }

  const note = remainingText || cleanText;
  const lowerNote = note.toLowerCase();

  // Check if it's income
  let suggestedType: TransactionType = 'expense';
  const incomeKeywords = ['salary', 'stipend', 'freelance', 'pocket money', 'bonus', 'cashback', 'received'];
  if (incomeKeywords.some(kw => lowerNote.includes(kw))) {
    suggestedType = 'income';
  }

  // Find best matching category
  let suggestedCategoryId: string | null = null;
  let bestScore = 0;

  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matched = keywords.filter(kw => lowerNote.includes(kw));
    if (matched.length > bestScore) {
      bestScore = matched.length;
      const targetCat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
      if (targetCat) {
        suggestedCategoryId = targetCat.id;
        if (targetCat.type === 'income') suggestedType = 'income';
      }
    }
  }

  return {
    amount,
    note: note.charAt(0).toUpperCase() + note.slice(1),
    suggestedCategoryId,
    suggestedType,
    tags,
  };
}
