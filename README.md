# 💰 Expense Tracker

A fast, personal expense tracker built for Indian students and early founders. Log a spend in under 5 seconds, track where your money goes, and present your spending insights.

## ✨ Features

- **Quick Add** — Log expenses in 3 taps. Amount supports math (`120+80` = `200`)
- **Smart Categories** — 15 pre-built categories with icons, sorted by usage
- **Notes & Search** — Every transaction can carry a note. Full-text search across everything
- **Insights Engine** — Real charts and plain-language insights, not dead dashboards
- **Presentation Mode** — Auto-generated slide deck of your spending for any period
- **Budgets** — Monthly overall + per-category budgets with safe-to-spend tracking
- **INR Native** — ₹ symbol, Indian number formatting (1,23,456), paise-precise
- **Dark Mode** — System-aware theme with manual override
- **Offline First** — All data stays in your browser (IndexedDB). No server, no signup
- **Export** — CSV for spreadsheets, JSON for full backup and restore
- **PWA** — Installable on phone. Works offline

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🛠 Tech Stack

- **React 18** + **TypeScript** — Type-safe UI
- **Vite** — Fast builds
- **Tailwind CSS v4** — Utility-first styling
- **Dexie.js** — IndexedDB wrapper for offline storage
- **Recharts** — Charts for insights
- **Framer Motion** — Smooth animations
- **Lucide React** — Clean icons
- **date-fns** — Date utilities
- **Vite PWA** — Service worker + manifest

## 📱 Mobile First

Designed for phones first, works great on laptops too:
- Bottom tab bar on mobile, sidebar on desktop
- Floating + button always accessible
- Touch-optimized tap targets (44px+)
- Safe area support for notched phones

## 💾 Data & Privacy

- **All data stays on your device** — IndexedDB storage, no analytics
- **Export anytime** — JSON backup for full restore, CSV for spreadsheets
- **No signup required** — Just open and start tracking

## 📊 Insights

The app generates plain-language insight cards:
- "Food is 38% of your spend, up 12% from last month"
- "You spend 2.3x more on weekends than weekdays"
- "7 small purchases under ₹200 added up to ₹980"
- "At this pace you'll spend ₹X this month"
- "Most frequent note keyword: 'chai' (14 times, ₹420)"

## 🎤 Presentation Mode

Auto-generates a slide deck with:
1. Title & headline numbers
2. Category breakdown
3. Spending trend
4. Top 5 expenses
5. Patterns (weekday & payment method)
6. Budget performance
7. Key takeaways
8. Editable plan for next period

Navigate with arrow keys, swipe, or click. Fullscreen supported.

## License

MIT
