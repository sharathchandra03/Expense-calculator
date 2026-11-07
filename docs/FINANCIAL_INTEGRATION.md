# Automated bank & UPI import (Account Aggregator)

Status: Phase 1 and the bank/UPI part of Phase 2 are implemented and verified against the
sandbox provider. No live provider is connected. See "What is not done" at the end.

## 1. Technical assessment of the existing app

| Area | Finding |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, framer-motion, recharts |
| Data | Local-first. Dexie/IndexedDB (`src/db/schema.ts`, schema version 13 before this work). All screens read it with `useLiveQuery` |
| Layers | UI modules → `services/` → `repositories/` → Dexie. Some UI writes Dexie directly |
| Auth | Optional Supabase (Google OAuth, PKCE). The app works fully offline/guest |
| Cloud | `SyncService` backs up Dexie tables to Supabase for signed-in users |
| Backend | None before this work (no API routes). Hosted as a Node app (Render) |
| Money model | `Transaction` (income/expense) adjusts `Account.balance`; `Asset` mirrors accounts by name; `NetWorthService` sums Assets + Investments − borrowed |
| Navigation | `TabType` in `bottom-nav.tsx`, dynamic imports in `app/page.tsx`, entries in `more-page.tsx` |

Consequences for the design:

* AA calls need secrets and signed requests, so they live in **Next.js route handlers** (`src/app/api/fin/*`), the first server code in the app.
* The server stores **only the consent lifecycle** (Supabase tables, owner-only RLS). Fetched financial data is returned once to the signed-in browser and stored in IndexedDB, consistent with the app's local-first model and data-minimisation. Because of that, "scheduled sync" runs when the app is opened (and on the connect screen). True server-side background sync would require storing financial data server-side; that is a deliberate later decision, not an omission.
* The Dexie schema is only extended (version 14, additive). Existing tables and rows are untouched.

## 2. Architecture

```
Provider adapter ──▶ RawAccount / RawTransaction          src/lib/fin/providers/*
  (ReBIT mapper in rebit.ts)
        │  server only: /api/fin/consents/[id]/sync
        ▼
Engine (pure, no I/O)                                      src/lib/fin/engine/*
  mode.ts        UPI / IMPS / NEFT / RTGS / CARD / ATM / CHEQUE / AUTO_DEBIT / …
  merchant.ts    narration → merchant, VPA, UPI ref, person-vs-merchant
  categorize.ts  user preference → merchant dictionary → narration rules → history → review
  accounting.ts  income / expense vs transfer / card bill / investment / refund; cross-txn reconcile
  fingerprint.ts deterministic de-dup key
  pipeline.ts    processBatch()
        ▼
ImportService (browser)                                    src/services/ImportService.ts
  importedTransactions  original bank record + automatic classification (never edited)
  transactionOverrides  user corrections (separate)
  classificationPrefs   learned merchant → category
  transactions          ledger mirror, ONLY for income/expense (id = imp_<fingerprint>)
```

Key rules enforced in code:

* **Idempotency.** Primary key of an imported record is its fingerprint: `(account, bank txnId)` when the bank gives an id, otherwise a hash of timestamp, direction, amount, normalised narration, reference and balance-after (+ occurrence index for byte-identical rows). Writes use `bulkPut`; the ledger id is derived from the fingerprint. Re-syncs and overlapping windows insert nothing new.
* **Balances.** Imported rows never change `Account.balance`. The bank's reported balance is written directly (stale snapshots ignored).
* **No double counting.** Own-account transfers (matched debit/credit across connected accounts within 3 days, also across separate syncs), investments/SIPs, savings transfers, card-bill payments (only when a credit-card account is tracked) and matched refunds get no ledger row. A refund reduces the expense it reverses. An unmatched refund is shown as income and flagged for review.
* **Narration kept.** Original narration is stored on the imported record and on the ledger row's note.
* **Learning.** Changing a category writes an override, learns the merchant/VPA, and updates other *pending-review* transactions from the same counterparty.
* **Review Required.** Anything under 0.6 confidence (e.g. UPI to a person) is listed on the connect screen until categorised.
* **AI step.** `AiCategoryClassifier` is an interface only. Sending bank narrations to a third-party model is a privacy/consent decision, so no vendor is wired in.

Connection states (`src/lib/fin/state.ts`): not connected, awaiting consent, connected, syncing, synced, sync failed, consent expired, consent revoked. "Synced" only appears after a sync really completed. Revocation is only reported after the provider call succeeds.

## 3. API (all require auth; rate-limited; `Cache-Control: no-store`)

| Route | Purpose |
|---|---|
| `GET /api/fin/providers` | Provider list + availability |
| `POST /api/fin/consents` | Create consent, returns the provider's consent URL |
| `GET /api/fin/consents` | List consents (status refreshed from provider) |
| `GET /api/fin/consents/[id]` | One consent, status refreshed |
| `POST /api/fin/consents/[id]/sync` | Fetch data (`from` optional for incremental) |
| `DELETE /api/fin/consents/[id]` | Revoke; `?purge=1` also deletes the record + audit trail |
| `POST /api/fin/consents/[id]/mock-decision` | Sandbox-only stand-in for the AA consent screen |

Auth: Supabase bearer token validated server-side. Without Supabase configured, only the sandbox provider is reachable and only outside production. Every store call is filtered by `user_id`.

## 4. Files

Created

* `src/lib/fin/types.ts`, `state.ts`, `app-categories.ts`
* `src/lib/fin/engine/{fingerprint,mode,merchant,categorize,accounting,pipeline}.ts`
* `src/lib/fin/providers/{rebit,mock,registry}.ts`
* `src/lib/fin/server/{http,store,consents}.ts`
* `src/app/api/fin/{providers,consents,consents/[id],consents/[id]/sync,consents/[id]/mock-decision}/route.ts`
* `src/services/{ImportService,FinancialConnectionService}.ts`
* `src/components/modules/{connect-accounts,fin-review-queue}.tsx`
* `supabase/migrations/20261107_financial_consents.sql`
* `docs/FINANCIAL_INTEGRATION.md`

Modified

* `src/db/schema.ts` – version 14: tables `financialConnections`, `linkedAccounts`, `syncHistory`, `importedTransactions`, `transactionOverrides`, `classificationPrefs`; optional fields on `Transaction` (`source`, `importedId`, `paymentMode`, `confidence`, `isSimulated`) and `Account` (`linkedAccountId`, `maskedNumber`, `isSimulated`)
* `src/components/layout/bottom-nav.tsx` (tab id), `src/app/page.tsx` (route, return-from-consent, scheduled sync), `src/components/modules/more-page.tsx` (entry)
* `src/components/modules/transaction-edit-sheet.tsx` – imported rows: only category/note editable, no balance adjustment, learns category
* `src/components/modules/transactions-ledger.tsx` – imported delete = hide (no balance change, not re-imported), duplicate creates a manual row, Auto/Sandbox badges
* `src/providers/AuthProvider.tsx` – new tables cleared on sign-out
* `.env.example`

## 5. Database migrations

* Browser: Dexie version 14 (automatic, additive).
* Supabase: run `supabase/migrations/20261107_financial_consents.sql` (tables `financial_consents`, `financial_consent_audit`, RLS owner-select, `provider_consent_ref` not readable by client roles).

## 6. Environment variables (server only, never `NEXT_PUBLIC_`)

| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Consent registry writes (required in production) |
| `PENNYFLOW_APP_URL` | Public origin for the post-consent redirect |
| `PENNYFLOW_ENABLE_MOCK_AA` | Sandbox provider; default on outside production, off in production |
| Provider credentials | e.g. `SETU_CLIENT_ID`, `SETU_CLIENT_SECRET`, `SETU_PRODUCT_INSTANCE_ID`; names are placeholders until the adapter is written against the provider's docs |

## 7. Provider onboarding (required before live data)

1. Confirm PennyFlow's regulatory route with counsel: direct FIU registration/RBI-regulated entity status, or a partner FIU arrangement (the registry's adapters are partner-agnostic).
2. Choose a provider (Setu, Finvu, CAMSfinserv, OneMoney, Anumati) and complete its onboarding; obtain sandbox, then production credentials, webhook/notification configuration and the redirect URL allow-list.
3. Implement the `FinancialDataProvider` interface for that provider from its **official** docs, replacing the placeholder in `providers/registry.ts`. FI payloads are ReBIT JSON: hand the decoded deposit document to `mapRebitDepositAccount` and verify field names against the provider's sandbox payloads.
4. Add webhook handling (consent status notifications) with signature verification per the provider's spec; polling via `GET /consents/[id]` already works as the fallback.
5. Review data-retention and privacy notices for the consent purpose text used in `POST /consents`.

## 8. What is not done

* **No live provider adapter.** All five providers are registered as "not ready" with the reason shown in the UI. Nothing is faked: only the labelled sandbox generates data.
* **Phase 3** (mutual funds, demat, valuations, investment net-worth), **Phase 4** (insight engine, recurring detection, reports), and the unified dashboard/analytics redesign are not started. `FiType` already includes `MUTUAL_FUNDS | EQUITIES | ETF` and the connect screen shows those tiles disabled.
* Dashboard / Statistics already include imported income and expenses (they read `transactions`), and bank balances flow into net worth through the mirrored `Account` + `Asset`, but there is no new cash-flow UI, payment-mode breakdown or filters by payment mode yet.
* Webhooks, server-side background sync and distributed rate limiting (the limiter is per-instance memory).
* Imported data is part of the normal IndexedDB → Supabase backup for signed-in users (as all other data is). If that is not acceptable for bank data, exclude `transactions` rows with `source: 'imported'` in `SyncService`.
* IndexedDB is not encrypted by the app beyond the device's own protections.
* UI was type-checked and built but not exercised in a browser here; the logic below was.

## 9. Verification performed

Run with throw-away scripts (not committed) against the sandbox provider using `fake-indexeddb`:

* Engine: mode detection, merchant normalisation for the spec's examples, deterministic fingerprints, overlapping windows produce 0 new fingerprints.
* Import: 271 records imported once; identical re-sync and overlapping sync insert 0; two-part incremental import yields the same 271 records and the same transfer/refund pairs as a single import.
* Accounting: transfers, SIPs and fully refunded purchases have no ledger row; totals match the imported countable amounts; account balances equal the bank's figures; manual transactions untouched.
* Learning: one correction updated 22 pending transactions, survives re-sync; original classification unchanged; recategorising to Investments removes the ledger row; hidden rows are not resurrected; disconnect-and-delete removes imported data and keeps manual data.
* API: unauthenticated → 401 (production, with and without Supabase); real provider refused with an honest status; no sync before approval (409); revoke blocks sync; purge removes the record; internal fields not returned; rate limiting returns 429; masked account numbers only.
