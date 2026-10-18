'use client'

import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ChevronDown, Search, HelpCircle, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FaqProps {
  /** Navigate back / to another tab. */
  onNavigateToTab?: (tab: string) => void
}

interface FaqItem {
  q: string
  a: string
}

interface FaqCategory {
  id: string
  label: string
  emoji: string
  items: FaqItem[]
}

/**
 * FAQ content — written specifically for PennyFlow (local-first expense tracker).
 * Answers reflect how the app actually works: all data lives on-device in
 * IndexedDB, optional Google Drive cloud sync, PIN/biometric app lock, budgets,
 * bills, goals, investments, lending, split expenses, CSV import/export, etc.
 */
const FAQ_DATA: FaqCategory[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    emoji: '🚀',
    items: [
      {
        q: 'What is PennyFlow?',
        a: 'PennyFlow is a personal finance and expense tracker. You record income and expenses, organize them into categories and accounts, set budgets and goals, track bills, investments and loans, and see where your money goes with analytics and reports — all from one app.',
      },
      {
        q: 'Do I need an account to use PennyFlow?',
        a: 'No. PennyFlow works fully offline without any sign-up. You can start adding transactions right away. Signing in with Google is optional and only needed if you want to back up and sync your data across devices.',
      },
      {
        q: 'How do I add my first transaction?',
        a: 'Tap the “+” button in the center of the bottom navigation bar. Enter the amount, pick a category and account, choose whether it is income or an expense, and save. The transaction immediately appears in your ledger and dashboard.',
      },
      {
        q: 'How do I set up my accounts?',
        a: 'Open More → Accounts (or the Accounts tab). Add accounts like Cash, Bank, UPI, Credit Card or Wallet with their starting balances. Every transaction is linked to an account so your balances stay accurate.',
      },
    ],
  },
  {
    id: 'data-privacy',
    label: 'Data & Privacy',
    emoji: '🔒',
    items: [
      {
        q: 'Where is my data stored?',
        a: 'Everything is stored locally on your device in the browser database (IndexedDB). Your financial data never leaves your device unless you explicitly turn on cloud sync. There is no hidden tracking of your transactions.',
      },
      {
        q: 'Is my data safe if I clear my browser or reinstall?',
        a: 'Because data is stored on-device, clearing your browser storage or uninstalling can erase it. Always keep a backup. Go to Settings → Backup, Restore & Export → Backup Data to save a file, or enable Google Drive cloud sync for an automatic copy.',
      },
      {
        q: 'Can other people see my spending?',
        a: 'No. Your data stays on your device. If you enable the App Lock (PIN) and Account Balance Lock in Settings → Security, balances and the whole app can be hidden behind a passcode or biometric check.',
      },
    ],
  },
  {
    id: 'backup-sync',
    label: 'Backup, Restore & Sync',
    emoji: '☁️',
    items: [
      {
        q: 'How do I back up my data?',
        a: 'Go to Settings → Backup, Restore & Export → Backup Data. This downloads a backup file to your device that contains all your transactions, accounts, budgets, goals and preferences. Do this regularly, especially before reinstalling.',
      },
      {
        q: 'How do I restore from a backup?',
        a: 'Go to Settings → Backup, Restore & Export → Restore Data and choose the backup file you saved earlier. Your data is rebuilt from the file and the app reloads. Note that restoring replaces the current data on the device.',
      },
      {
        q: 'What is Cloud Sync and how do I enable it?',
        a: 'Cloud Sync backs up your data to your Google Drive so you can restore it on another device. Open Settings → Cloud Sync and sign in with Google. Once linked, you can back up and restore from the cloud. If cloud sync is not configured on your build, your data still stays safe locally.',
      },
      {
        q: 'Does cloud sync work automatically?',
        a: 'When you are signed in, PennyFlow keeps a cloud copy and shows the last sync time. You can also enable Automatic G-Drive Backup in Settings to push a daily copy. You can trigger a manual backup or restore any time from the Cloud Sync card.',
      },
    ],
  },
  {
    id: 'budgets-goals',
    label: 'Budgets, Bills & Goals',
    emoji: '🎯',
    items: [
      {
        q: 'How do budgets work?',
        a: 'Open the Budgets screen and set a monthly limit per category (for example, Food or Transport). PennyFlow tracks your spending against each limit and warns you as you approach or exceed it. Turn on Budget Alerts in Settings → Notifications to be notified when you go off-track.',
      },
      {
        q: 'Can I track recurring bills and subscriptions?',
        a: 'Yes. Use the Scheduled/Bills screen for recurring bills and the Subscriptions screen for services like streaming. PennyFlow reminds you before due dates and can record the payment as a transaction so your budget stays accurate.',
      },
      {
        q: 'How do savings goals work?',
        a: 'In Goals, create a target (for example, “Emergency Fund — ₹50,000”) with an optional deadline. You contribute toward it over time and PennyFlow shows your progress. Optional auto-save can set aside a set amount each month.',
      },
      {
        q: 'What is the First Day of the Month setting?',
        a: 'If your salary cycle does not start on the 1st, set a custom start day in Settings → Preferences → First Day of the Month. Budgets and monthly analytics then use that cycle instead of the calendar month.',
      },
    ],
  },
  {
    id: 'features',
    label: 'Features & Tools',
    emoji: '🧰',
    items: [
      {
        q: 'Can I import transactions from my bank?',
        a: 'Yes. Export a CSV from your bank or another app, then go to Settings → Backup, Restore & Export → Import Transactions (or the Import/Export tool) and map the columns. PennyFlow adds the rows to your ledger.',
      },
      {
        q: 'Can I export my transactions?',
        a: 'Yes. Use Settings → Backup, Restore & Export → Export Transactions to download your transactions as a CSV file that opens in any spreadsheet app.',
      },
      {
        q: 'What are Split Expenses?',
        a: 'Split Expenses lets you divide a shared cost — like a trip or dinner — between people and track who owes what. It is handy for group spending without needing a separate app.',
      },
      {
        q: 'Can I track investments, assets and loans?',
        a: 'Yes. Investments tracks holdings and their value, Assets records things you own, and Lending keeps a record of money you have lent or borrowed, including repayments.',
      },
      {
        q: 'How do I change the currency or theme?',
        a: 'Open Settings → Preferences → Currency & Format to pick your currency, and Settings → Appearance → Theme to choose Light, Dark, Device or Auto (dark at night).',
      },
    ],
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting',
    emoji: '🛠️',
    items: [
      {
        q: 'I am not receiving notifications. What should I do?',
        a: 'First, allow notifications for PennyFlow in your device/browser settings. Then enable the reminders you want in Settings → Notifications (Daily Reminder, Budget Alerts). On mobile, make sure battery optimization is not blocking the app in the background.',
      },
      {
        q: 'My balances look wrong.',
        a: 'Balances are the account starting balance plus income minus expenses. Check that each transaction is set to the correct type and account, and that no duplicates were imported. Editing or deleting the wrong entry recalculates balances instantly.',
      },
      {
        q: 'I forgot my app lock PIN.',
        a: 'For security the PIN is stored only on your device and cannot be recovered. If you are locked out, you may need to clear the app’s stored data — which also removes your transactions — so keep a current backup. Where available, biometric unlock can get you back in.',
      },
      {
        q: 'How do I delete all my data or start over?',
        a: 'Go to Settings → Danger Zone → Delete Data & Start Afresh to clear your financial data, or Delete Account to remove everything including settings. These actions cannot be undone, so back up first if you might need the data later.',
      },
    ],
  },
]

const ALL_ITEMS = FAQ_DATA.flatMap(cat =>
  cat.items.map(item => ({ ...item, category: cat.label }))
)

export function FAQ({ onNavigateToTab }: FaqProps = {}) {
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  const goBack = () => {
    if (onNavigateToTab) onNavigateToTab('settings')
    else window.history.back()
  }

  const trimmed = query.trim().toLowerCase()

  // When searching, flatten to a single filtered list; otherwise keep categories.
  const searchResults = useMemo(() => {
    if (!trimmed) return null
    return ALL_ITEMS.filter(
      item =>
        item.q.toLowerCase().includes(trimmed) ||
        item.a.toLowerCase().includes(trimmed) ||
        item.category.toLowerCase().includes(trimmed),
    )
  }, [trimmed])

  return (
    <div className="-mx-5 -mt-6 min-h-full bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-background/95 px-4 py-3 backdrop-blur">
        <button
          onClick={goBack}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-[22px] font-bold text-foreground leading-tight">FAQs</h1>
          <p className="text-[12px] text-muted-foreground">Find answers to your questions</p>
        </div>
      </header>

      <div className="space-y-6 px-4 pb-10 pt-2">
        {/* ── Search ── */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpenKey(null) }}
            placeholder="Search FAQs…"
            className="h-11 w-full rounded-xl border border-border/50 bg-card pl-10 pr-10 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {/* ── Search results ── */}
        {searchResults !== null ? (
          <section className="space-y-3">
            <p className="px-1 text-[13px] text-muted-foreground">
              {searchResults.length === 0
                ? 'No matching questions'
                : `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`}
            </p>
            {searchResults.length > 0 ? (
              <div className="overflow-hidden rounded-2xl bg-card border border-border/50">
                {searchResults.map((item, i) => {
                  const key = `search-${i}`
                  return (
                    <AccordionRow
                      key={key}
                      question={item.q}
                      answer={item.a}
                      caption={item.category}
                      open={openKey === key}
                      onToggle={() => setOpenKey(openKey === key ? null : key)}
                      last={i === searchResults.length - 1}
                    />
                  )
                })}
              </div>
            ) : (
              <EmptyState onContact={() => onNavigateToTab?.('support')} />
            )}
          </section>
        ) : (
          /* ── Categorized list ── */
          <>
            {FAQ_DATA.map(cat => (
              <section key={cat.id} className="space-y-3">
                <h2 className="flex items-center gap-2 px-1 text-[15px] font-bold text-foreground">
                  <span aria-hidden>{cat.emoji}</span>
                  {cat.label}
                </h2>
                <div className="overflow-hidden rounded-2xl bg-card border border-border/50">
                  {cat.items.map((item, i) => {
                    const key = `${cat.id}-${i}`
                    return (
                      <AccordionRow
                        key={key}
                        question={item.q}
                        answer={item.a}
                        open={openKey === key}
                        onToggle={() => setOpenKey(openKey === key ? null : key)}
                        last={i === cat.items.length - 1}
                      />
                    )
                  })}
                </div>
              </section>
            ))}

            {/* ── Still need help ── */}
            <button
              onClick={() => onNavigateToTab?.('support')}
              className="flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-4 text-left hover:border-primary/40 active:scale-[0.99] transition-all"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-foreground">Still need help?</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Send us a question or feedback — we usually reply within 24 hours.
                </p>
              </div>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────── Accordion row ─────────────────────────── */

function AccordionRow({ question, answer, caption, open, onToggle, last }: {
  question: string
  answer: string
  caption?: string
  open: boolean
  onToggle: () => void
  last?: boolean
}) {
  return (
    <div className={cn(!last && 'border-b border-border/40')}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-accent/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          {caption && (
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary/70">{caption}</p>
          )}
          <p className={cn('text-[14px] font-semibold', open ? 'text-primary' : 'text-foreground')}>
            {question}
          </p>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className={cn('h-5 w-5 flex-shrink-0', open ? 'text-primary' : 'text-muted-foreground')} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-4 text-[13px] leading-relaxed text-muted-foreground">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─────────────────────────── Empty state ─────────────────────────── */

function EmptyState({ onContact }: { onContact: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-border/50 bg-secondary/20 py-10 text-center">
      <HelpCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
      <p className="text-[13px] font-semibold text-muted-foreground">No answers found</p>
      <p className="mx-auto mt-1 max-w-[260px] text-[11px] text-muted-foreground/70">
        Try a different search term, or reach out and we will help you directly.
      </p>
      <button
        onClick={onContact}
        className="mt-4 rounded-full bg-primary px-5 py-2 text-[13px] font-bold text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Contact Support
      </button>
    </div>
  )
}
