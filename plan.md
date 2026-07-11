# PennyFlow - Product Roadmap & Implementation Plan

> Philosophy: The best finance app isn't the one with the most features.
> It's the one where logging an expense takes 2 seconds, not 10.
> Every decision below is guided by: "Does this reduce time-to-value for the user?"

---

## Guiding Principles

1. **Speed over completeness** — A fast, simple action beats a feature-rich slow one
2. **Show, don't navigate** — The most important info is visible without tapping anything
3. **Reduce decisions** — Smart defaults, remembered preferences, predictive inputs
4. **Mobile-first always** — Thumb-reachable, one-handed, glanceable
5. **Progressive complexity** — Simple surface, depth available for those who want it

---

## Status Legend
- [ ] Not started
- [~] In progress
- [x] Completed

---

## PHASE 0 - Core UX Overhaul (DO FIRST)
> These aren't features. They're fixes to the fundamental daily experience.
> Without these, no amount of new features will make users stay.

### 0.1 Redesign Home Screen — Transaction-First
- [x] Top bar: Monthly remaining budget indicator (₹18,000 of ₹30,000 left)
- [x] Below: Today's transactions list (what happened today, right there)
- [x] Quick-add row: 4-5 category buttons (Food, Transport, Shopping, Bills, +More)
- [x] One tap on a category → amount input → done. 2 taps to log an expense.
- [x] Net Worth / Health Score moves to a secondary "Overview" card below
- [x] On empty state: "Nothing logged today" with prominent quick-add buttons
- **Why:** Users open finance apps 3-5x per day. Each time it should feel instant and purposeful.

### 0.2 Quick Expense Templates (1-Tap Logging)
- [x] User-saveable templates: "Coffee ₹200", "Auto ₹150", "Groceries ₹500"
- [x] Templates appear as pill buttons above the transaction list
- [x] Single tap: creates the transaction immediately (pre-filled amount, category, account)
- [x] Long-press to edit/delete a template
- [x] "Create template" option in quick-add modal after saving any expense
- [x] Store in new Dexie table `templates`
- **Why:** 80% of expenses are repetitive. Make them zero-thought.

### 0.3 Smart Defaults & Predictive Input
- [x] Remember last-used account (pre-select it next time)
- [x] Pre-select category based on time: morning = Transport, noon = Food, evening = Entertainment
- [x] Amount suggestions based on category history (median of last 10 "Food" transactions)
- [x] Auto-fill today's date (already done)
- [x] After saving, show "Undo" toast for 4 seconds
- **Why:** Every decision you eliminate = one less reason to abandon the entry.

### 0.4 Inline Transaction Edit & Swipe Actions
- [x] Tap any transaction in ledger → expand to edit (amount, category, date, description)
- [x] Swipe left → delete (with undo toast)
- [x] Swipe right → duplicate (for repetitive entries)
- [x] No separate "edit screen" — everything in-place
- **Why:** People make mistakes. Fixing them should be as fast as making them.

### 0.5 Monthly Budget Awareness (Always Visible)
- [x] Thin progress bar at top of every screen (not just budget page)
- [x] Shows: spent vs limit, color-coded (green/amber/red)
- [x] Tap it to expand: per-category budget breakdown
- [x] If no budget set: gentle prompt "Set a monthly limit?"
- [x] Recalculates in real-time as transactions are added
- **Why:** The #1 question people have: "How much can I still spend?" Answer it without navigation.

### 0.6 Undo System
- [x] After any destructive or creation action (add, edit, delete transaction/account/bill)
- [x] Show toast at bottom: "Transaction added. Undo" for 4 seconds
- [x] Tapping Undo reverts the action
- [x] Smooth slide-up animation, non-intrusive
- **Why:** Error recovery builds trust. Users add things faster when they know mistakes are reversible.

### 0.7 Voice/Text Quick-Add (Parse Natural Language)
- [x] Input field at top: type "food 200" or "salary 50000" or "auto 150 cash"
- [x] Parser extracts: category (food), amount (200), account (cash) automatically
- [x] One tap to confirm parsed result
- [x] Optional: microphone button for voice-to-text (browser SpeechRecognition API)
- [x] Works as alternative to the full form — for power users
- **Why:** The absolute fastest input method. Type 3 words and you're done.

---

## PHASE 1 - Essential Features (What Users Expect)

### 1. Recurring Transactions Auto-Entry
- [x] Background check on app load: if today matches a recurrence date, auto-create transaction
- [x] Use existing `isRecurring` + `recurrenceRule` fields
- [x] Show notification: "₹1,200 Rent was auto-logged"
- [x] Allow user to skip/edit before confirming
- [x] "Auto-added" badge on auto-generated transactions
- **Depends on:** Phase 0.3 (smart defaults)

### 2. Split Expenses (Splitwise-style)
- [x] New Dexie table: `splits` (id, expenseId, participants[], amounts[], paidBy, settled)
- [x] "Split" button appears after adding a group expense
- [x] Add participants by name (no phone/app required — local tracking)
- [x] Split equally / custom amounts / by percentage
- [x] Summary: "Rahul owes you ₹350" — clear, actionable
- [x] Settlement: mark as paid, deduct from lending ledger
- [x] Connect to existing lending module for deeper tracking
- **New module:** `split-expenses.tsx`

### 3. Photo Receipt Capture
- [x] "Attach receipt" button on transaction form
- [x] Camera capture or gallery upload
- [x] Store as compressed base64 in transaction record (`receiptImage?: string`)
- [x] Thumbnail in transaction ledger
- [x] Tap to view full-size in lightbox
- [x] Compression to keep DB size manageable (max 200KB per image)
- **Touches:** `Transaction` interface + `quick-add-modal.tsx` + `transactions-ledger.tsx`

### 4. Currency Converter
- [x] Converter tool accessible from settings or utility menu
- [x] Free API: exchangerate-api.com or frankfurter.app
- [x] Cache rates locally (refresh daily)
- [x] Convert between 20+ currencies
- [x] Optional: show converted amount on transactions when viewing in non-default currency
- **New module:** `currency-converter.tsx`

### 5. Debt Payoff Planner
- [x] Input: total debt, interest rate, monthly payment
- [x] Two strategy visualizations: Snowball vs Avalanche
- [x] Month-by-month payoff table
- [x] "You'll be debt-free by March 2028" headline
- [x] Total interest comparison between strategies
- [x] Link to existing lending records
- **New module:** `debt-planner.tsx`

### 6. Monthly Budget vs Actual Comparison
- [x] Side-by-side bar chart: budgeted vs actual per category
- [x] Red bars when over, green when under
- [x] Monthly history (swipe between months)
- [x] "You saved ₹2,000 vs budget" or "₹3,000 over budget"
- [x] Integrated into analytics or budget section
- **Touches:** `budget-manager.tsx` or `analytics.tsx`

---

## PHASE 2 - Differentiators (Why Choose PennyFlow Over Others)

### 7. Smart Suggestions / AI Insights
- [x] Rule-based engine (no external API, pure client-side logic)
- [x] Patterns: spending spikes, category trends, unusual transactions
- [x] Contextual: "You spent 40% more on food this week compared to average"
- [x] Actionable: "Consider setting a ₹3,000 food budget"
- [x] Surface in dashboard + notifications
- **New service:** `SmartInsightsService.ts`

### 8. Expense Streaks & Gamification
- [x] Daily saving streak: "You stayed under budget for 7 days!"
- [x] Achievement badges: "First budget", "100 transactions", "30-day streak"
- [x] Visual streak calendar (contribution-graph style)
- [x] Light motivational messages — not annoying, not childish
- [x] Store in localStorage or Dexie table
- **New module:** `achievements.tsx`

### 9. Shared Wallets (Couples/Family)
- [x] Create shared wallet with invite code
- [x] Both users see + add to same transaction set
- [x] Uses Supabase real-time for sync between users
- [x] Individual balance tracking within shared wallet
- [x] Permission: view-only vs full edit
- **Complexity:** High — requires Supabase schema changes + real-time subscriptions
- **New module:** `shared-wallets.tsx`

### 10. Subscription Tracker
- [x] Dedicated view: all active subscriptions listed
- [x] Fields: name, amount, cycle (monthly/yearly), next billing, category
- [x] Total cost: "You spend ₹2,400/month on subscriptions"
- [x] Renewal reminders (3 days before)
- [x] "Haven't used in 30 days" — cancel suggestion
- [x] Auto-detect from recurring transactions
- **New module:** `subscriptions.tsx` + new Dexie table

### 11. Tax Helper (India-focused)
- [x] Tag expenses as tax-deductible (toggle on transaction)
- [x] Auto-tag by category: medical (80D), education, donations (80G)
- [x] Financial year view (April to March)
- [x] Summary: Section-wise deduction totals
- [x] Export tax report
- **New module:** `tax-helper.tsx` + new fields on Transaction

### 12. Net Worth Timeline Chart
- [x] Line chart: net worth over months/years
- [x] Data from account balance snapshots (end-of-month)
- [x] Milestone markers: "Crossed ₹1L", "Crossed ₹5L"
- [x] Show on dashboard as compact sparkline
- [x] Full interactive view in analytics
- **Touches:** `dashboard.tsx` + `analytics.tsx`

---

## PHASE 3 - Polish & Delight

### 13. PWA Shortcuts (Home Screen Quick Actions)
- [x] Manifest shortcuts: "Add Expense", "View Balance"
- [x] Long-press app icon → quick actions
- **Touches:** `manifest.json`

### 14. Smart Theme Schedule
- [x] Auto dark after 7pm, auto light before 7am
- [x] Follow system preference option
- [x] Manual override always available
- **Touches:** `ThemeProvider.tsx`

### 15. CSV / Bank Statement Import
- [x] Upload CSV → map columns → preview → import
- [x] Support common Indian bank formats (SBI, HDFC, ICICI, Axis)
- [x] Bulk-add to transactions
- [x] Duplicate detection (don't re-import same entries)
- **New section in:** `settings.tsx` or standalone module

### 16. Custom Dashboard Layout (Enhanced)
- [x] Already have drag-to-reorder
- [x] Add: show/hide specific cards (toggle visibility)
- [x] Compact vs expanded card modes
- [x] "Reset to default" option
- **Touches:** `dashboard.tsx`

### 17. Expense Templates (Extended)
- [x] Already planned in Phase 0.2
- [x] This extends it: shareable templates, suggested templates based on peer data
- [x] "Most people track: Rent, Groceries, Petrol, Subscriptions" — starter pack
- **Extends:** Phase 0.2

### 18. App Lock (PIN / Biometric)
- [x] 4-digit PIN set in settings
- [x] Web Authentication API for fingerprint (supported devices)
- [x] Lock after 5 minutes of inactivity
- [x] Store PIN hash (not plaintext) in localStorage
- [x] Toggle on/off in settings
- **New provider:** `AppLockProvider.tsx`

---

## PHASE 4 - Visual Upgrade (Inspired by Premium Finance Apps)

### 19. Emoji Category System (30+ Categories)
- [x] 32 expense categories + 12 income categories with emoji icons
- [x] Color-coded backgrounds per category
- [x] getCategoryConfig() utility for universal use across app
- [x] Replaces generic arrow icons with contextual emojis
- **New file:** `lib/category-icons.ts`

### 20. Graphic Statistics (Donut Charts)
- [x] Donut chart for expense breakdown by category with % labels
- [x] Donut chart for income sources
- [x] Horizontal progress bars per category (amount + percentage)
- [x] Monthly navigation (swipe between months)
- [x] Search by category
- [x] Expense/Income tab toggle
- **New module:** `graphic-statistics.tsx`

### 21. Visual Ledger Redesign
- [x] Transactions grouped by date with daily income/expense totals in header
- [x] Emoji category icons on every transaction
- [x] Receipt badge + auto-generated badge visible
- [x] Swipe actions preserved (delete left, duplicate right)
- **Enhanced:** `transactions-ledger.tsx`

### 22. Monthly Summary Header
- [x] Prominent card on dashboard: Expenses (red) | Income (green) | Net (dynamic)
- [x] Live-calculated from current month's transactions
- [x] Visible immediately when app opens
- **Added to:** `dashboard.tsx`

### 23. Quick Action Bar
- [x] Horizontal scrollable pills: Ledger, Statistics, Categories, Receipts, Recurring
- [x] One-tap navigation to key modules
- [x] Emoji-labeled for quick recognition
- **Added to:** `dashboard.tsx`

---

## Implementation Strategy

```
Phase 0 (UX Overhaul)     → Do this FIRST. It's not optional.
                             Makes the app feel 10x better overnight.
                             Timeline: ASAP

Phase 1 (Must-haves)      → Core features users search for when comparing apps.
                             Timeline: ASAP

Phase 2 (Differentiators) → What makes PennyFlow unique. What earns word-of-mouth.
                             Timeline: ASAP

Phase 3 (Polish)           → Nice touches that show craft. Do after everything else works perfectly.
                             Timeline: ASAP
```

---

## Architecture Notes

- All new tables must be added to `SyncService.ts` push/pull arrays
- All new modules need: nav item in `bottom-nav.tsx` + case in `page.tsx`
- All monetary values must use `formatCurrency()` (dynamic INR/USD/etc)
- Follow existing UI conventions: rounded-2xl/3xl, motion animations, card-based layout
- Mobile-first: test on 320px width minimum
- New features should work offline-first, sync when online
- Keep bundle size in check — lazy-load heavy modules if possible

---

## Success Metrics (How We Know It's Working)

- Time to log an expense: target < 3 seconds (currently ~8-10 seconds)
- Daily active usage: user opens app 3+ times per day
- Data accuracy: users edit/delete < 5% of entries (means smart defaults work)
- Retention: user still active after 30 days
- Recommendation: users share the app without being asked

---

*Plan created: July 9, 2026*
*By: K. Sharath Chandra*
*App: PennyFlow v1.0*
