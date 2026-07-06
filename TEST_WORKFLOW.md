# FinanceOS Data Sync & Navigation Test Workflow

## Overview
This document outlines the complete end-to-end test workflow to verify:
1. ✅ All numbers are real and sync with user inputs
2. ✅ Dashboard updates immediately after add/delete operations
3. ✅ No blank screens when navigating between tabs
4. ✅ Asset balances sync with account changes

---

## Critical Data Flow (Fixed in this session)

### Data Sync Architecture
```
User Action (Add/Delete)
    ↓
Accounts Table Updated
    ↓
Assets Table Synced (matching by account name)
    ↓
useLiveQuery Triggers Re-fetch
    ↓
Dashboard Metrics Recalculate
    ↓
UI Updates in Real-Time
```

**Key Fix**: Asset table was never being updated when transactions changed, so Dashboard metrics showed stale data.

---

## Test Scenario 1: Add Expense → Verify Dashboard Update

### Setup
- Start FinanceOS
- Navigate to Dashboard (should show initial values like ₹77,098.80 Net Worth)
- Note the current "Cash & Checking" balance

### Steps
1. Click the **+** (Quick Add) button
2. Select **"Expense"** mode
3. Fill form:
   - Amount: **₹500.00**
   - Category: **Food**
   - Account: **Chase Checking**
   - Description: **Lunch test transaction**
   - Date: Today
4. Submit

### Expected Results
✅ Modal shows success screen "Perfect! Your expense has been recorded"
✅ Return to Dashboard automatically after 2 seconds
✅ **Cash & Checking balance decreases by ₹500.00**
✅ **Net Worth decreases by ₹500.00**
✅ Recent Activity shows new transaction
✅ **No blank screen**
✅ Numbers are REAL (not hardcoded)

### Verification Checklist
- [ ] Expense recorded in Ledger tab
- [ ] Account balance reflects the change
- [ ] Dashboard metrics updated
- [ ] Net Worth decreased correctly

---

## Test Scenario 2: Delete Transaction → Verify Dashboard Rollback

### Setup
- Continue from Test Scenario 1 (have transaction added)
- Navigate to **Ledger** tab
- Find the test transaction you just added

### Steps
1. Click the **trash icon** on the test transaction
2. Confirm deletion (should be instant)

### Expected Results
✅ Transaction removed from Ledger list
✅ Dashboard **Cash & Checking balance increases by ₹500.00** (rollback)
✅ **Net Worth increases by ₹500.00** (back to original)
✅ Recent Activity no longer shows deleted transaction
✅ **No blank screen**

### Verification Checklist
- [ ] Transaction removed from Ledger
- [ ] Account balance restored
- [ ] Dashboard metrics updated
- [ ] Net Worth back to original
- [ ] No errors in console

---

## Test Scenario 3: Add Income → Verify Multiple Accounts

### Setup
- Start from Dashboard
- Identify "Cash Wallet" account balance (should be ₹450.00)

### Steps
1. Click **+** button
2. Select **"Income"** mode
3. Fill form:
   - Amount: **₹1,000.00**
   - Category: **Bonus**
   - Account: **Cash Wallet**
   - Description: **Freelance work income**
   - Date: Today
4. Submit

### Expected Results
✅ Cash Wallet balance increases by ₹1,000.00 (from ₹450 to ₹1,450)
✅ Net Worth increases by ₹1,000.00
✅ This Month → Income section updated

---

## Test Scenario 4: Navigation After Operations

### Setup
- Complete Test Scenarios 1-3
- You should have made several transactions

### Steps
1. Start on Dashboard
2. Click **Ledger** tab → verify no blank screen
3. Click **Insights** tab → verify no blank screen
4. Click **Assets** tab → verify no blank screen
5. Click **Lending** tab → verify no blank screen
6. Click **Settings** tab → verify no blank screen
7. Click **Dashboard** tab → verify it loads
8. Delete a transaction from Ledger
9. Navigate to Dashboard immediately → **verify no blank screen**

### Expected Results
✅ All tabs load instantly
✅ No blank screens on any navigation
✅ Ledger shows all transactions
✅ Dashboard shows updated numbers after delete
✅ Smooth animations between tabs

---

## Test Scenario 5: Asset Balance Consistency

### Setup
- Dashboard is open
- Note: "Vanguard Brokerage" balance (should be ₹45,000.00)

### Steps
1. Click **Assets** tab
2. Verify all asset balances match their account counterparts:
   - Chase Checking (account) → matches "Chase Checking" (asset)
   - Cash Wallet (account) → matches "Cash Wallet" (asset)
   - Vanguard Brokerage → ₹45,000.00
3. Go back to Dashboard
4. Verify Net Worth calculation includes all assets:
   - Total Assets = Cash & Checking + Invested + other holdings
   - Net Worth = Total Assets + Money Lent - Money Borrowed

### Expected Results
✅ Asset balances sync with account balances
✅ Net Worth correctly calculates from all assets
✅ No discrepancies in balances

---

## Test Scenario 6: Rapid Operations (Stress Test)

### Setup
- Start from Dashboard

### Steps
1. Add 3 expenses rapidly (within 10 seconds)
2. Without waiting, delete 2 of them
3. Add 1 income
4. Navigate between tabs quickly (Dashboard → Ledger → Dashboard → Ledger)

### Expected Results
✅ All operations complete without errors
✅ Dashboard always reflects current state
✅ No blank screens during rapid navigation
✅ Numbers are always consistent

---

## Verification Checklist (All Scenarios)

### Core Requirements
- [ ] All displayed numbers are REAL (calculated from actual data)
- [ ] Numbers update immediately after add/delete
- [ ] Asset and Account balances stay in sync
- [ ] Net Worth calculation is accurate
- [ ] No stale data ever displayed

### UI/UX Requirements
- [ ] No blank screens on navigation
- [ ] Smooth transitions between tabs
- [ ] Modal closes after successful operation
- [ ] Delete operations are instant
- [ ] Recent Activity updates in real-time

### Data Integrity
- [ ] Deleted transactions are removed from Ledger
- [ ] Account balances are correctly rolled back on delete
- [ ] Asset valuationHistory is updated with today's date
- [ ] System logs record all operations
- [ ] No duplicate entries

---

## Debugging Commands

If you encounter issues, check browser console (F12) for:

```javascript
// Check if Dexie is working
db.transactions.toArray().then(tx => console.log('Transactions:', tx))

// Check assets
db.assets.toArray().then(a => console.log('Assets:', a))

// Check accounts
db.accounts.toArray().then(acc => console.log('Accounts:', acc))

// Check if indexedDB is enabled
console.log('IndexedDB available:', !!window.indexedDB)
```

---

## Expected Database State After Tests

```
Transactions: 
  - Original mock data (8 transactions)
  - Plus 3 new test transactions (3 added, 2 deleted = net +1)
  - Total: 9 transactions

Accounts:
  - Chase Checking: Changed based on operations
  - Cash Wallet: Changed based on operations
  - Vanguard Brokerage: ₹45,000.00 (unchanged)
  - Bitcoin Wallet: ₹14,148.00 (unchanged)

Assets:
  - All balances should match their account counterparts
  - valuationHistory updated with today's date for changed assets

System Logs:
  - Records of all operations
```

---

## Summary

If all test scenarios pass:
✅ **Data Sync Bug is FIXED** - Numbers update in real-time
✅ **Blank Screen Bug is FIXED** - Navigation is smooth
✅ **UI/UX is WORKING** - All operations are instant and visible
✅ **Database Integrity is MAINTAINED** - All data is consistent

