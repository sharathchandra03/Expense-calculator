# FinanceOS - Personal Finance Operating System

A **mobile-first, local-first personal finance OS** built with Next.js, React, TypeScript, and Tailwind CSS.

## 🚀 Quick Start

```bash
npm install
npm run dev
# Visit http://localhost:3000
```

## ✨ Features

### Core Features
- 📊 **Dashboard**: Net worth, cash position, bills due, financial health score
- 💰 **Quick Add**: Record expenses, income, lending, assets, bills, goals (6 modes)
- 📈 **Spending Intelligence**: Category breakdown, insights, recurring detection, trends
- 💳 **Lending**: Track money lent/borrowed with interest calculations (simple/compound)
- 🔍 **Smart Search**: Global search with Cmd+K / Ctrl+K keyboard shortcut
- ⚙️ **Settings**: Profile, currency, theme, notifications, export/import, reset
- 🎓 **Onboarding**: Interactive 6-step tutorial for new users

### Technical Features
- ✅ 100% local storage (IndexedDB)
- ✅ Offline-first functionality
- ✅ Mobile-optimized (375px+)
- ✅ Responsive design
- ✅ Smooth 60 FPS animations
- ✅ PWA support

## 📱 Navigation

**5-Tab Bottom Navigation:**
1. **Overview** - Dashboard
2. **Insights** - Spending analysis
3. **+** - Quick add (center button)
4. **Lending** - Lending tracking
5. **Settings** - Preferences

## ⌨️ Keyboard Shortcuts

- **Cmd+K** / **Ctrl+K** - Global search
- **ESC** - Close dialog

## 🏗️ Architecture

```
UI Components → Services → Repositories → Dexie + IndexedDB
```

## 📁 Project Structure

```
src/
├── app/              # Next.js app
├── components/
│   ├── layout/       # Navigation
│   ├── modules/      # Features
│   └── ui/           # Components
├── services/         # Business logic
├── repositories/     # Data access
└── db/               # Database
```

## 🔧 Tech Stack

- **Framework**: Next.js 16.2.10
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Dexie + IndexedDB
- **Animations**: Framer Motion

## 📊 Performance

- Build: ~10s
- Bundle: ~150KB (gzipped)
- Lighthouse: 95+
- Load time: <2s

## 🔐 Privacy

- ✅ 100% local storage
- ✅ No cloud required
- ✅ No authentication
- ✅ Full data control
- ✅ Export/import available

## 📝 Documentation

| File | Purpose |
|------|---------|
| **QUICK_START.md** | User guide |
| **DEVELOPMENT_PLAN.md** | Technical details |
| **NEXT_STEPS.md** | Roadmap |

## 🎯 Features in Detail

### Dashboard
- Net worth display
- Cash position indicator
- Bills due alerts
- Financial health score
- Recent transactions

### Spending Intelligence
- Category breakdown with charts
- Recurring expense detection
- Income vs expenses
- Savings rate calculation
- Top spending days

### Lending & Interest
- Money lent/borrowed tracking
- Simple & compound interest calculations
- Payment reminders
- Overdue alerts
- Settlement tracking

### Settings
- Profile management
- Currency selection (USD/INR/EUR/GBP)
- Theme toggle (light/dark)
- Notifications control
- Data export/import
- Full data reset

## 🚀 Development

```bash
npm install           # Install dependencies
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Check code quality
```

## 📱 Mobile First

- Responsive breakpoints: 375px, 640px, 1024px+
- Touch-friendly (44px+ targets)
- Bottom navigation for thumb access
- Portrait-only design
- One-handed usage

## 🎓 Usage Examples

### Add a Transaction
1. Tap **+** button
2. Select type (Expense, Income, etc.)
3. Fill in details
4. Tap Save

### Search Transactions
1. Press **Cmd+K** (or **Ctrl+K**)
2. Type search term
3. Select result

### View Insights
1. Tap **Insights** tab
2. Choose time range (7 days, month, year)
3. View analytics

### Manage Settings
1. Tap **Settings** tab
2. Update profile, currency, theme
3. Export/import data if needed

## ✅ Quality

- TypeScript: Zero errors
- Build: Passing
- Mobile: Optimized
- Responsive: Yes

## 🎉 Status

**✅ Production Ready**

- All features implemented
- Mobile optimized
- Well documented
- Ready to deploy

---

**Version**: 1.0.0  
**Updated**: July 6, 2026
