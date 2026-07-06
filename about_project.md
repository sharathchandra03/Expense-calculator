# About Project — FinanceOS (Personal Finance Operating System)

FinanceOS is a premium, local-first **Personal Finance Operating System** designed with absolute craft, premium visuals, and fluid micro-interactions. It operates entirely on the client-side with zero external cloud or database dependencies.

---

## 1. Core Architecture

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 (Custom color tokens, glassmorphism utilities)
- **Animations**: Framer Motion (GPU-composited transforms and opacity)
- **Database**: IndexedDB managed via **Dexie.js** and `dexie-react-hooks` (reactive live queries)
- **Forms & Parsing**: React Hook Form with Zod schema verification
- **Charts**: Recharts (Custom themed valuation and forecast graphs)
- **PWA Capabilities**: Installable standalone application running offline with customized Service Worker caching

---

## 2. Database Schema (`src/db/schema.ts`)

Data is segregated into 7 local IndexedDB tables:

1. **`accounts`**: User wallets (Cash, Checking accounts).
   - Fields: `id`, `name`, `type` (cash/bank/card), `balance`
2. **`assets`**: Value trackers (Stocks, Crypto, Real estate, physical Gold).
   - Fields: `id`, `name`, `type` (cash/bank/stock/crypto/real_estate/gold), `balance`, `valuationHistory` (array of `{ date, value }` tracking historical appreciation)
3. **`transactions`**: Income and Expenses ledger logs.
   - Fields: `id`, `date`, `type` (income/expense), `category`, `amount`, `accountId`, `description`, `isRecurring`, `recurrenceRule`
4. **`lending`**: Loan ledger (Money Lent to or Borrowed from contacts).
   - Fields: `id`, `contactName`, `type` (lent/borrowed), `amount`, `interestRate` (annual %), `interestType` (none/simple/compound), `expectedRepaymentDate`, `status` (active/paid), `createdAt`, `description`
5. **`bills`**: Upcoming payments reminders.
   - Fields: `id`, `title`, `amount`, `dueDate`, `category`, `isPaid`, `isRecurring`, `recurrenceRule`
6. **`goals`**: Target saving allocations.
   - Fields: `id`, `title`, `targetAmount`, `currentAmount`, `targetDate`, `category`
7. **`systemLogs`**: Audit logging feed.
   - Fields: `id`, `timestamp`, `type` (transaction/lending/asset/bill/goal/system), `description`, `amount`

---

## 3. Design System & Aesthetics

- **Theming**: Automatic Dark/Light mode synchronization.
  - **Dark Mode (OLED Ethereal Glass)**: Charcoal cards (`#0d0d0f`) placed on OLED black background (`#050505`) with translucent white hairlines (`border-white/10`) and radial glowing mesh highlights.
  - **Light Mode (Soft Structuralism)**: Warm paper cream backgrounds (`#fcfbf9`) with slate borders and soft ambient shadows.
- **Concentric Curves (Double-Bezel)**: Outer wrappers use `rounded-[1.75rem]` with nested padding enclosing an inner container with `rounded-[1.375rem]` to look like premium hardware plates.
- **Pill-shaped CTA buttons**: Rounded capsules with spring-based active down-scaling (`active:scale-[0.97]`) and circle-enclosed trailing icons.
- **Inputs**: Responsive floating-label elements with inline currency indicators and error boundaries.

---

## 4. Codebase Inventory

### Configuration & Utilities
- [`package.json`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/package.json): Script declarations, Next.js, and dependencies.
- [`src/app/globals.css`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/app/globals.css): CSS imports, design tokens, glassmorphism, scrollbars, and double-bezel custom base utilities.
- [`src/lib/utils.ts`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/lib/utils.ts): Tailwind merge `cn` and currency formatters.
- [`src/providers/ThemeProvider.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/providers/ThemeProvider.tsx): Dark/light class management.
- [`src/db/schema.ts`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/db/schema.ts): Dexie.js database schema and initial mock data seeding.

### Bespoke UI Library
- [`src/components/ui/card.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/ui/card.tsx): Double-bezel compound card elements.
- [`src/components/ui/button.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/ui/button.tsx): Pill CTAs with spring physics.
- [`src/components/ui/input.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/ui/input.tsx): Form text and amount fields.
- [`src/components/ui/select.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/ui/select.tsx): Dropdowns styled for mobile.
- [`src/components/ui/dialog.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/ui/dialog.tsx): Primitives wrapped with Framer Motion spring entrances.

### Feature Modules & Pages
- [`src/components/layout/bottom-nav.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/layout/bottom-nav.tsx): Floating glass bar with central (+) button.
- [`src/components/modules/quick-add-modal.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/modules/quick-add-modal.tsx): Combined sub-forms for Expenses, Income, Lending records, Assets, Bills, and Goals. Updates account balances and logs actions recursively on submit.
- [`src/components/modules/dashboard.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/modules/dashboard.tsx): Net Worth, bento grid statistics (Goals progress ring, upcoming bills, cash reserves), advisor summaries, and recent transactions.
- [`src/components/modules/transactions-ledger.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/modules/transactions-ledger.tsx): Transactions search and filtering ledger + chronological System audit timeline logs feed.
- [`src/components/modules/assets-tracker.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/modules/assets-tracker.tsx): Net asset totals, Recharts historical appreciation line graph, asset value re-adjustment forms, and lending details (simple/compound interest calculations running on day-count offsets).
- [`src/components/modules/forecast-engine.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/modules/forecast-engine.tsx): Cash flow inflows/outflows forecast next month, savings goals contributions, and bills settlement.
- [`src/components/modules/settings.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/components/modules/settings.tsx): JSON backup export, JSON restore import, CSV ledger sheet downloads, theme toggles, currency options, database reset controls.
- [`src/app/page.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/app/page.tsx): Main client wrapper, route tab swapper, SW registration.
- [`src/app/layout.tsx`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/src/app/layout.tsx): Top-level document container, PWA manifest linking.
- [`public/manifest.json`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/public/manifest.json) & [`public/sw.js`](file:///c:/Users/LENOVO/Desktop/Expense%20Tracker/public/sw.js): PWA install configuration and offline asset caching worker.
