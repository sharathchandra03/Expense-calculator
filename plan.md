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
- [ ] Top bar: Monthly remaining budget indicator (₹18,000 of ₹30,000 left)
- [ ] Below: Today's transactions list (what happened today, right there)
- [ ] Quick-add row: 4-5 category buttons (Food, Transport, Shopping, Bills, +More)
- [ ] One tap on a category → amount input → done. 2 taps to log an expense.
- [ ] Net Worth / Health Score moves to a secondary "Overview" card below
- [ ] On empty state: "Nothing logged today" with prominent quick-add buttons
- **Why:** Users open finance apps 3-5x per day. Each time it should feel instant and purposeful.

### 0.2 Quick Expense Templates (1-Tap Logging)
- [ ] User-saveable templates: "Coffee ₹200", "Auto ₹150", "Groceries ₹500"
- [ ] Templates appear as pill buttons above the transaction list
- [ ] Single tap: creates the transaction immediately (pre-filled amount, category, account)
- [ ] Long-press to edit/delete a template
- [ ] "Create template" option in quick-add modal after saving any expense
- [ ] Store in new Dexie table `templates`
- **Why:** 80% of expenses are repetitive. Make them zero-thought.

### 0.3 Smart Defaults & Predictive Input
- [ ] Remember last-used account (pre-select it next time)
- [ ] Pre-select category based on time: morning = Transport, noon = Food, evening = Entertainment
- [ ] Amount suggestions based on category history (median of last 10 "Food" transactions)
- [ ] Auto-fill today's date (already done)
- [ ] After saving, show "Undo" toast for 4 seconds
- **Why:** Every decision you eliminate = one less reason to abandon the entry.

### 0.4 Inline Transaction Edit & Swipe Actions
- [ ] Tap any transaction in ledger → expand to edit (amount, category, date, description)
- [ ] Swipe left → delete (with undo toast)
- [ ] Swipe right → duplicate (for repetitive entries)
- [ ] No separate "edit screen" — everything in-place
- **Why:** People make mistakes. Fixing them should be as fast as making them.

### 0.5 Monthly Budget Awareness (Always Visible)
- [ ] Thin progress bar at top of every screen (not just budget page)
- [ ] Shows: spent vs limit, color-coded (green/amber/red)
- [ ] Tap it to expand: per-category budget breakdown
- [ ] If no budget set: gentle prompt "Set a monthly limit?"
- [ ] Recalculates in real-time as transactions are added
- **Why:** The #1 question people have: "How much can I still spend?" Answer it without navigation.

### 0.6 Undo System
- [ ] After any destructive or creation action (add, edit, delete transaction/account/bill)
- [ ] Show toast at bottom: "Transaction added. Undo" for 4 seconds
- [ ] Tapping Undo reverts the action
- [ ] Smooth slide-up animation, non-intrusive
- **Why:** Error recovery builds trust. Users add things faster when they know mistakes are reversible.

### 0.7 Voice/Text Quick-Add (Parse Natural Language)
- [ ] Input field at top: type "food 200" or "salary 50000" or "auto 150 cash"
- [ ] Parser extracts: category (food), amount (200), account (cash) automatically
- [ ] One tap to confirm parsed result
- [ ] Optional: microphone button for voice-to-text (browser SpeechRecognition API)
- [ ] Works as alternative to the full form — for power users
- **Why:** The absolute fastest input method. Type 3 words and you're done.

---

## PHASE 1 - Essential Features (What Users Expect)

### 1. Recurring Transactions Auto-Entry
- [ ] Background check on app load: if today matches a recurrence date, auto-create transaction
- [ ] Use existing `isRecurring` + `recurrenceRule` fields
- [ ] Show notification: "₹1,200 Rent was auto-logged"
- [ ] Allow user to skip/edit before confirming
- [ ] "Auto-added" badge on auto-generated transactions
- **Depends on:** Phase 0.3 (smart defaults)

### 2. Split Expenses (Splitwise-style)
- [ ] New Dexie table: `splits` (id, expenseId, participants[], amounts[], paidBy, settled)
- [ ] "Split" button appears after adding a group expense
- [ ] Add participants by name (no phone/app required — local tracking)
- [ ] Split equally / custom amounts / by percentage
- [ ] Summary: "Rahul owes you ₹350" — clear, actionable
- [ ] Settlement: mark as paid, deduct from lending ledger
- [ ] Connect to existing lending module for deeper tracking
- **New module:** `split-expenses.tsx`

### 3. Photo Receipt Capture
- [ ] "Attach receipt" button on transaction form
- [ ] Camera capture or gallery upload
- [ ] Store as compressed base64 in transaction record (`receiptImage?: string`)
- [ ] Thumbnail in transaction ledger
- [ ] Tap to view full-size in lightbox
- [ ] Compression to keep DB size manageable (max 200KB per image)
- **Touches:** `Transaction` interface + `quick-add-modal.tsx` + `transactions-ledger.tsx`

### 4. Currency Converter
- [ ] Converter tool accessible from settings or utility menu
- [ ] Free API: exchangerate-api.com or frankfurter.app
- [ ] Cache rates locally (refresh daily)
- [ ] Convert between 20+ currencies
- [ ] Optional: show converted amount on transactions when viewing in non-default currency
- **New module:** `currency-converter.tsx`

### 5. Debt Payoff Planner
- [ ] Input: total debt, interest rate, monthly payment
- [ ] Two strategy visualizations: Snowball vs Avalanche
- [ ] Month-by-month payoff table
- [ ] "You'll be debt-free by March 2028" headline
- [ ] Total interest comparison between strategies
- [ ] Link to existing lending records
- **New module:** `debt-planner.tsx`

### 6. Monthly Budget vs Actual Comparison
- [ ] Side-by-side bar chart: budgeted vs actual per category
- [ ] Red bars when over, green when under
- [ ] Monthly history (swipe between months)
- [ ] "You saved ₹2,000 vs budget" or "₹3,000 over budget"
- [ ] Integrated into analytics or budget section
- **Touches:** `budget-manager.tsx` or `analytics.tsx`

---

## PHASE 2 - Differentiators (Why Choose PennyFlow Over Others)

### 7. Smart Suggestions / AI Insights
- [ ] Rule-based engine (no external API, pure client-side logic)
- [ ] Patterns: spending spikes, category trends, unusual transactions
- [ ] Contextual: "You spent 40% more on food this week compared to average"
- [ ] Actionable: "Consider setting a ₹3,000 food budget"
- [ ] Surface in dashboard + notifications
- **New service:** `SmartInsightsService.ts`

### 8. Expense Streaks & Gamification
- [ ] Daily saving streak: "You stayed under budget for 7 days!"
- [ ] Achievement badges: "First budget", "100 transactions", "30-day streak"
- [ ] Visual streak calendar (contribution-graph style)
- [ ] Light motivational messages — not annoying, not childish
- [ ] Store in localStorage or Dexie table
- **New module:** `achievements.tsx`

### 9. Shared Wallets (Couples/Family)
- [ ] Create shared wallet with invite code
- [ ] Both users see + add to same transaction set
- [ ] Uses Supabase real-time for sync between users
- [ ] Individual balance tracking within shared wallet
- [ ] Permission: view-only vs full edit
- **Complexity:** High — requires Supabase schema changes + real-time subscriptions
- **New module:** `shared-wallets.tsx`

### 10. Subscription Tracker
- [ ] Dedicated view: all active subscriptions listed
- [ ] Fields: name, amount, cycle (monthly/yearly), next billing, category
- [ ] Total cost: "You spend ₹2,400/month on subscriptions"
- [ ] Renewal reminders (3 days before)
- [ ] "Haven't used in 30 days" — cancel suggestion
- [ ] Auto-detect from recurring transactions
- **New module:** `subscriptions.tsx` + new Dexie table

### 11. Tax Helper (India-focused)
- [ ] Tag expenses as tax-deductible (toggle on transaction)
- [ ] Auto-tag by category: medical (80D), education, donations (80G)
- [ ] Financial year view (April to March)
- [ ] Summary: Section-wise deduction totals
- [ ] Export tax report
- **New module:** `tax-helper.tsx` + new fields on Transaction

### 12. Net Worth Timeline Chart
- [ ] Line chart: net worth over months/years
- [ ] Data from account balance snapshots (end-of-month)
- [ ] Milestone markers: "Crossed ₹1L", "Crossed ₹5L"
- [ ] Show on dashboard as compact sparkline
- [ ] Full interactive view in analytics
- **Touches:** `dashboard.tsx` + `analytics.tsx`

---

## PHASE 3 - Polish & Delight

### 13. PWA Shortcuts (Home Screen Quick Actions)
- [ ] Manifest shortcuts: "Add Expense", "View Balance"
- [ ] Long-press app icon → quick actions
- **Touches:** `manifest.json`

### 14. Smart Theme Schedule
- [ ] Auto dark after 7pm, auto light before 7am
- [ ] Follow system preference option
- [ ] Manual override always available
- **Touches:** `ThemeProvider.tsx`

### 15. CSV / Bank Statement Import
- [ ] Upload CSV → map columns → preview → import
- [ ] Support common Indian bank formats (SBI, HDFC, ICICI, Axis)
- [ ] Bulk-add to transactions
- [ ] Duplicate detection (don't re-import same entries)
- **New section in:** `settings.tsx` or standalone module

### 16. Custom Dashboard Layout (Enhanced)
- [ ] Already have drag-to-reorder
- [ ] Add: show/hide specific cards (toggle visibility)
- [ ] Compact vs expanded card modes
- [ ] "Reset to default" option
- **Touches:** `dashboard.tsx`

### 17. Expense Templates (Extended)
- [ ] Already planned in Phase 0.2
- [ ] This extends it: shareable templates, suggested templates based on peer data
- [ ] "Most people track: Rent, Groceries, Petrol, Subscriptions" — starter pack
- **Extends:** Phase 0.2

### 18. App Lock (PIN / Biometric)
- [ ] 4-digit PIN set in settings
- [ ] Web Authentication API for fingerprint (supported devices)
- [ ] Lock after 5 minutes of inactivity
- [ ] Store PIN hash (not plaintext) in localStorage
- [ ] Toggle on/off in settings
- **New provider:** `AppLockProvider.tsx`

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
