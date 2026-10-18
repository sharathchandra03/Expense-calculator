'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { db, getProfile, saveProfile } from '@/db/schema'
import { SyncCard } from '@/components/ui/sync-card'
import { invalidateCurrencyCache, getCurrencySymbol, cn } from '@/lib/utils'
import { useTheme } from '@/providers/ThemeProvider'
import {
  ArrowLeft, ChevronRight, Check, Crown, Trash2,
  Download, Upload, HardDriveDownload, Paperclip,
  HelpCircle, MessageSquare, BellOff,
} from 'lucide-react'
import { useAppLock } from '@/providers/AppLockProvider'
import { AppConfig, getAppConfig, updateAppConfig } from '@/lib/app-config'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/category-icons'

/* ─────────────────────────── Static option data ─────────────────────────── */

const CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR (₹) — Indian Rupee' },
  { value: 'USD', label: 'USD ($) — US Dollar' },
  { value: 'EUR', label: 'EUR (€) — Euro' },
  { value: 'GBP', label: 'GBP (£) — British Pound' },
  { value: 'JPY', label: 'JPY (¥) — Japanese Yen' },
  { value: 'AED', label: 'AED (د.إ) — Dirham' },
  { value: 'CAD', label: 'CAD (CA$) — Canadian Dollar' },
  { value: 'AUD', label: 'AUD (A$) — Australian Dollar' },
  { value: 'SGD', label: 'SGD (S$) — Singapore Dollar' },
  { value: 'CHF', label: 'CHF — Swiss Franc' },
  { value: 'CNY', label: 'CNY (¥) — Chinese Yuan' },
  { value: 'KRW', label: 'KRW (₩) — Korean Won' },
  { value: 'BRL', label: 'BRL (R$) — Brazilian Real' },
  { value: 'ZAR', label: 'ZAR (R) — South African Rand' },
  { value: 'MXN', label: 'MXN (MX$) — Mexican Peso' },
  { value: 'THB', label: 'THB (฿) — Thai Baht' },
]

const THEME_OPTIONS = [
  { value: 'system', label: 'Device theme' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto (dark at night)' },
]

const TIME_FORMAT_OPTIONS = [
  { value: '12h', label: '12-Hour Format' },
  { value: '24h', label: '24-Hour Format' },
]

const DECIMAL_FORMAT_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'comma', label: 'Comma (1.234,56)' },
  { value: 'none', label: 'No decimals' },
]

const PAYMENT_MODE_OPTIONS = ['Cash', 'UPI', 'Debit Card', 'Credit Card', 'Net Banking', 'Wallet']

const HOME_BALANCE_OPTIONS = [
  { value: 'net', label: 'Show net balance for the summary' },
  { value: 'total', label: 'Show total balance across accounts' },
  { value: 'available', label: 'Show available (spendable) balance' },
]

const ORDINAL = (d: number) => `${d}${d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}`
const MONTH_DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: ORDINAL(i + 1) }))

const WEEK_START_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
  { value: 'saturday', label: 'Saturday' },
]

const APP_ICONS: { id: AppConfig['appIcon']; glyph: string; bg: string; fg: string }[] = [
  { id: 'default', glyph: '📊', bg: 'bg-black', fg: 'text-white' },
  { id: 'dollar', glyph: '$', bg: 'bg-black', fg: 'text-white' },
  { id: 'rupee', glyph: '₹', bg: 'bg-black', fg: 'text-white' },
  { id: 'rupee-gold', glyph: '₹', bg: 'bg-[#0f4c5c]', fg: 'text-amber-400' },
]

/* ─────────────────────────── Main component ─────────────────────────── */

export function Settings({ onNavigateToTab }: { onNavigateToTab?: (tab: string) => void } = {}) {
  const { theme, setTheme: setProviderTheme } = useTheme()
  const [currency, setCurrency] = useState('INR')
  const [config, setConfig] = useState<AppConfig>(getAppConfig)
  const [toast, setToast] = useState<string | null>(null)
  const [showReset, setShowReset] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [picker, setPicker] = useState<null | PickerState>(null)

  const importRef = React.useRef<HTMLInputElement>(null)
  const restoreRef = React.useRef<HTMLInputElement>(null)

  // Load currency from profile/localStorage
  useEffect(() => {
    getProfile()
      .then(p => setCurrency(p?.currency || localStorage.getItem('finance-os-currency') || 'INR'))
      .catch(() => setCurrency(localStorage.getItem('finance-os-currency') || 'INR'))
  }, [])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const setCfg = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setConfig(updateAppConfig(key, value))
  }

  const handleCurrencyChange = async (val: string) => {
    setCurrency(val)
    localStorage.setItem('finance-os-currency', val)
    invalidateCurrencyCache()
    try { await saveProfile({ currency: val }) } catch {}
  }

  const goBack = () => {
    if (onNavigateToTab) onNavigateToTab('more')
    else window.history.back()
  }

  const navigate = (tab: string) => {
    if (onNavigateToTab) onNavigateToTab(tab)
    else {
      window.history.pushState({ tab }, '', `?tab=${tab}`)
      window.dispatchEvent(new PopStateEvent('popstate', { state: { tab } }))
    }
  }

  /* ── Backup / Restore / Export / Import ── */
  const handleBackup = async () => {
    try {
      const mod = await import('@/services/DataExportService')
      const res = await mod.DataExportService.downloadFullBackup()
      flash(res.success ? 'Backup saved to your device' : (res.error || 'Backup failed'))
    } catch {
      flash('Backup failed')
    }
  }

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      await restoreFromBackupObject(data)
      flash('Data restored — reloading…')
      setTimeout(() => window.location.reload(), 900)
    } catch {
      flash('Could not read backup file')
    }
    e.target.value = ''
  }

  const handleExportTransactions = async () => {
    try {
      const txns = await db.transactions.toArray()
      if (!txns.length) { flash('No transactions to export'); return }
      const headers = ['Date', 'Type', 'Category', 'Amount', 'Account', 'Description']
      const rows = txns.map((t) => [
        t.date ?? '', t.type ?? '', t.category ?? '', t.amount ?? '', t.accountId ?? '',
        `"${String(t.description ?? '').replace(/"/g, '""')}"`,
      ].join(','))
      const csv = [headers.join(','), ...rows].join('\n')
      downloadBlob(csv, `pennyflow-transactions-${today()}.csv`, 'text/csv')
      flash('Transactions exported as CSV')
    } catch {
      flash('Export failed')
    }
  }

  const handleImportTransactions = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Hand off to the dedicated CSV import flow.
    e.target.value = ''
    navigate('csvimport')
  }

  /* ── Danger zone ── */
  const handleDeleteData = async () => {
    try {
      await Promise.all([
        db.transactions.clear(), db.accounts.clear(), db.assets.clear(), db.lending.clear(),
        db.bills.clear(), db.goals.clear(), db.budgets.clear(), db.investments.clear(),
        db.customCategories.clear(), db.notifications.clear(),
      ])
    } catch {}
    setShowReset(false)
    flash('All data cleared')
    setTimeout(() => window.location.reload(), 900)
  }

  const handleDeleteAccount = async () => {
    try {
      await Promise.all([
        db.transactions.clear(), db.accounts.clear(), db.assets.clear(), db.lending.clear(),
        db.bills.clear(), db.goals.clear(), db.budgets.clear(), db.investments.clear(),
        db.customCategories.clear(), db.notifications.clear(),
      ])
      localStorage.clear()
    } catch {}
    setShowDeleteAccount(false)
    flash('Account deleted')
    setTimeout(() => window.location.reload(), 900)
  }

  const currencySymbol = getCurrencySymbol(currency)
  const themeLabel = THEME_OPTIONS.find(o => o.value === theme)?.label ?? 'Device theme'

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
        <h1 className="text-[22px] font-bold text-foreground">Settings</h1>
      </header>

      {/* ── Save toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5"
          >
            <Check className="h-4 w-4 text-emerald-500" />
            <p className="text-[13px] text-emerald-600 dark:text-emerald-400">{toast}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-7 px-4 pb-10 pt-2">
        {/* ─────────────── App Icon ─────────────── */}
        <Section title="App Icon">
          <div className="flex gap-4">
            {APP_ICONS.map(icon => {
              const active = config.appIcon === icon.id
              return (
                <button
                  key={icon.id}
                  onClick={() => { setCfg('appIcon', icon.id); flash('App icon updated') }}
                  className={cn(
                    'flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold transition-all',
                    icon.bg, icon.fg,
                    active ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105' : 'opacity-80 hover:opacity-100',
                  )}
                  aria-label={`App icon ${icon.id}`}
                >
                  <span className={cn(icon.id === 'default' && 'rounded-full bg-white/10 p-1')}>{icon.glyph}</span>
                </button>
              )
            })}
          </div>
        </Section>

        {/* ─────────────── Appearance ─────────────── */}
        <Section title="Appearance">
          <Card>
            <NavRow
              label="Theme"
              value={themeLabel}
              onClick={() => setPicker({
                title: 'Theme',
                options: THEME_OPTIONS,
                selected: theme,
                onSelect: (v) => setProviderTheme(v as 'dark' | 'light' | 'system' | 'auto'),
              })}
            />
            <NavRow
              label="Time Format"
              value={TIME_FORMAT_OPTIONS.find(o => o.value === config.timeFormat)?.label}
              onClick={() => setPicker({
                title: 'Time Format',
                options: TIME_FORMAT_OPTIONS,
                selected: config.timeFormat,
                onSelect: (v) => setCfg('timeFormat', v as AppConfig['timeFormat']),
              })}
            />
            <NavRow
              label="Decimal Format"
              value={DECIMAL_FORMAT_OPTIONS.find(o => o.value === config.decimalFormat)?.label}
              last
              onClick={() => setPicker({
                title: 'Decimal Format',
                options: DECIMAL_FORMAT_OPTIONS,
                selected: config.decimalFormat,
                onSelect: (v) => setCfg('decimalFormat', v as AppConfig['decimalFormat']),
              })}
            />
          </Card>
        </Section>

        {/* ─────────────── Preferences ─────────────── */}
        <Section title="Preferences">
          <Card>
            <NavRow
              label="Currency & Format"
              value={`${currency} (${currencySymbol})`}
              onClick={() => setPicker({
                title: 'Currency & Format',
                options: CURRENCY_OPTIONS,
                selected: currency,
                onSelect: handleCurrencyChange,
              })}
            />
            <NavRow
              label="Default Payment Mode"
              value={config.defaultPaymentMode}
              onClick={() => setPicker({
                title: 'Default Payment Mode',
                options: PAYMENT_MODE_OPTIONS.map(p => ({ value: p, label: p })),
                selected: config.defaultPaymentMode,
                onSelect: (v) => setCfg('defaultPaymentMode', v),
              })}
            />
            <NavRow
              label="Default Expense Category"
              value={config.defaultExpenseCategory}
              onClick={() => setPicker({
                title: 'Default Expense Category',
                options: EXPENSE_CATEGORIES.map(c => ({ value: c.label, label: `${c.emoji}  ${c.label}` })),
                selected: config.defaultExpenseCategory,
                onSelect: (v) => setCfg('defaultExpenseCategory', v),
              })}
            />
            <NavRow
              label="Default Income Category"
              value={config.defaultIncomeCategory}
              onClick={() => setPicker({
                title: 'Default Income Category',
                options: INCOME_CATEGORIES.map(c => ({ value: c.label, label: `${c.emoji}  ${c.label}` })),
                selected: config.defaultIncomeCategory,
                onSelect: (v) => setCfg('defaultIncomeCategory', v),
              })}
            />
            <NavRow
              label="First Day of the Month"
              pro
              value={ORDINAL(config.monthlyStartDate)}
              onClick={() => setPicker({
                title: 'First Day of the Month',
                options: MONTH_DAY_OPTIONS,
                selected: String(config.monthlyStartDate),
                onSelect: (v) => setCfg('monthlyStartDate', Number(v)),
              })}
            />
            <NavRow
              label="Week Starts On"
              pro
              value={WEEK_START_OPTIONS.find(o => o.value === config.weekStartDay)?.label}
              onClick={() => setPicker({
                title: 'Week Starts On',
                options: WEEK_START_OPTIONS,
                selected: config.weekStartDay,
                onSelect: (v) => setCfg('weekStartDay', v as AppConfig['weekStartDay']),
              })}
            />
            <NavRow
              label="Home Page Balance View"
              value={HOME_BALANCE_OPTIONS.find(o => o.value === config.homeBalanceView)?.label}
              onClick={() => setPicker({
                title: 'Home Page Balance View',
                options: HOME_BALANCE_OPTIONS,
                selected: config.homeBalanceView,
                onSelect: (v) => setCfg('homeBalanceView', v as AppConfig['homeBalanceView']),
              })}
            />
            <ToggleRow
              label="Haptics"
              description="Subtle taps when you interact with the app"
              value={config.hapticsEnabled}
              onChange={(v) => setCfg('hapticsEnabled', v)}
              last
            />
          </Card>
        </Section>

        {/* ─────────────── Notifications ─────────────── */}
        <Section title="Notifications">
          <Card>
            <ToggleRow
              label="Daily Reminder"
              description={`Remind me daily at ${formatTime(config.dailyReminderTime, config.timeFormat)}.`}
              value={config.dailyReminderEnabled}
              onChange={(v) => setCfg('dailyReminderEnabled', v)}
            />
            <ToggleRow
              label="Budget Alerts"
              pro
              description="Notify me when I go off-track with my budget."
              value={config.budgetAlertsEnabled}
              onChange={(v) => setCfg('budgetAlertsEnabled', v)}
              last
            />
          </Card>
        </Section>

        {/* ─────────────── Backup, Restore & Export ─────────────── */}
        <Section title="Backup, Restore & Export">
          <Card>
            <NavRow label="Backup Data" description="Backup my PennyFlow data" onClick={handleBackup} chevron={false} icon={HardDriveDownload} />
            <NavRow label="Restore Data" description="Restore from an existing backup (.bk file)" onClick={() => restoreRef.current?.click()} chevron={false} icon={Download} />
            <NavRow label="Export Transactions" pro description="Export data to a spreadsheet or a PDF" onClick={handleExportTransactions} chevron={false} icon={Upload} />
            <NavRow label="Import Transactions" description="Import data from a spreadsheet (.csv file)" onClick={() => importRef.current?.click()} chevron={false} icon={Upload} />
            <NavRow label="Export Attachments" pro description="Export all attachments to a .zip file" onClick={() => navigate('receipts')} chevron={false} icon={Paperclip} />
            <ToggleRow
              label="Automatic G-Drive Backup"
              pro
              description="Automatically backup data on my G-Drive daily"
              value={config.autoGDriveBackup}
              onChange={(v) => setCfg('autoGDriveBackup', v)}
              last
            />
          </Card>
          <input ref={restoreRef} type="file" accept=".bk,.json" className="hidden" onChange={handleRestoreFile} />
          <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImportTransactions} />
        </Section>

        {/* ─────────────── Cloud Sync ─────────────── */}
        <Section title="Cloud Sync">
          <SyncCard />
        </Section>

        {/* ─────────────── Security ─────────────── */}
        <Section title="Security">
          <Card>
            <ToggleRow
              label="Account Balance Lock"
              description="Require biometric to view balances"
              value={config.accountBalanceLock}
              onChange={(v) => setCfg('accountBalanceLock', v)}
            />
            <AppLockRow />
            <BiometricRow
              value={config.biometricLoginEnabled}
              onChange={(v) => setCfg('biometricLoginEnabled', v)}
            />
          </Card>
        </Section>

        {/* ─────────────── Support & Feedback ─────────────── */}
        <Section title="Support & Feedback">
          <Card>
            <NavRow label="FAQs" description="Find answers to your questions" onClick={() => navigate('faq')} icon={HelpCircle} />
            <NavRow label="Query And Feedback" description="We generally reply within 24 hours" onClick={() => navigate('support')} icon={MessageSquare} />
            <NavRow label="Not Receiving Notifications?" description="Not receiving notifications for reminders set" onClick={() => navigate('support')} icon={BellOff} last />
          </Card>
        </Section>

        {/* ─────────────── More ─────────────── */}
        <Section title="More">
          <Card>
            <SimpleRow label="Upgrade to Pro" onClick={() => navigate('health')} />
            <SimpleRow label="Restore Purchases" onClick={() => flash('Checking for previous purchases…')} />
            <SimpleRow label="Privacy Policy" onClick={() => navigate('about')} />
            <SimpleRow label="Terms of Service" onClick={() => navigate('about')} />
            <SimpleRow label="Contact Us" onClick={() => navigate('support')} />
            <SimpleRow label="About App" onClick={() => navigate('about')} last />
          </Card>
        </Section>

        {/* ─────────────── Danger Zone ─────────────── */}
        <Section title="Danger Zone">
          <Card>
            <DangerRow label="Delete Data & Start Afresh" onClick={() => setShowReset(true)} />
            <DangerRow label="Delete Account" onClick={() => setShowDeleteAccount(true)} last />
          </Card>
        </Section>
      </div>

      {/* ── Option picker sheet ── */}
      <PickerSheet picker={picker} onClose={() => setPicker(null)} />

      {/* ── Confirm dialogs ── */}
      <ConfirmSheet
        open={showReset}
        icon={Trash2}
        title="Delete Data & Start Afresh?"
        body="This permanently clears all your financial data on this device. Make sure you have a backup first."
        confirmLabel="Delete Data"
        onConfirm={handleDeleteData}
        onCancel={() => setShowReset(false)}
      />
      <ConfirmSheet
        open={showDeleteAccount}
        icon={Trash2}
        title="Delete Account?"
        body="This removes all your data and settings from this device. This action cannot be undone."
        confirmLabel="Delete Account"
        onConfirm={handleDeleteAccount}
        onCancel={() => setShowDeleteAccount(false)}
      />
    </div>
  )
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-[17px] font-bold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-card border border-border/50">
      {children}
    </div>
  )
}

function RowShell({ children, onClick, last }: { children: React.ReactNode; onClick?: () => void; last?: boolean }) {
  const className = cn(
    'flex w-full items-center gap-3 px-4 py-3.5 text-left',
    onClick && 'hover:bg-accent/60 active:bg-accent transition-colors',
    !last && 'border-b border-border/40',
  )
  if (onClick) {
    return <button onClick={onClick} className={className}>{children}</button>
  }
  return <div className={className}>{children}</div>
}

function ProBadge() {
  return <Crown className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" aria-label="Pro feature" />
}

function NavRow({ label, value, description, pro, onClick, last, chevron = true, icon: Icon }: {
  label: string
  value?: string
  description?: string
  pro?: boolean
  onClick: () => void
  last?: boolean
  chevron?: boolean
  icon?: React.ElementType
}) {
  return (
    <RowShell onClick={onClick} last={last}>
      {Icon && <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground" strokeWidth={1.8} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[15px] font-semibold text-foreground">{label}</p>
          {pro && <ProBadge />}
        </div>
        {(value || description) && (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{value ?? description}</p>
        )}
      </div>
      {chevron && <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
    </RowShell>
  )
}

function SimpleRow({ label, onClick, last }: { label: string; onClick: () => void; last?: boolean }) {
  return (
    <RowShell onClick={onClick} last={last}>
      <span className="flex-1 text-[15px] font-semibold text-foreground">{label}</span>
    </RowShell>
  )
}

function DangerRow({ label, onClick, last }: { label: string; onClick: () => void; last?: boolean }) {
  return (
    <RowShell onClick={onClick} last={last}>
      <span className="flex-1 text-[15px] font-semibold text-red-500">{label}</span>
    </RowShell>
  )
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange() }}
      disabled={disabled}
      className={cn('ml-3 h-6 w-11 flex-shrink-0 rounded-full transition-colors', value ? 'bg-emerald-500' : 'bg-muted-foreground/40', disabled && 'opacity-50')}
      role="switch"
      aria-checked={value}
    >
      <motion.div
        animate={{ x: value ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="h-5 w-5 rounded-full bg-white shadow-sm"
      />
    </button>
  )
}

function ToggleRow({ label, description, value, onChange, pro, last, disabled }: {
  label: string
  description?: string
  value: boolean
  onChange: (v: boolean) => void
  pro?: boolean
  last?: boolean
  disabled?: boolean
}) {
  return (
    <RowShell last={last}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[15px] font-semibold text-foreground">{label}</p>
          {pro && <ProBadge />}
        </div>
        {description && <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{description}</p>}
      </div>
      <Toggle value={value} onChange={() => onChange(!value)} disabled={disabled} />
    </RowShell>
  )
}

/* App Lock (PIN) — wired to the real AppLockProvider */
function AppLockRow() {
  const { isEnabled, disableLock, enableLock } = useAppLock()
  const [showPin, setShowPin] = useState(false)
  const [pin, setPin] = useState('')

  const toggle = () => {
    if (isEnabled) disableLock()
    else setShowPin(v => !v)
  }

  const confirm = () => {
    if (/^\d{4}$/.test(pin)) {
      enableLock(pin)
      setPin('')
      setShowPin(false)
    }
  }

  return (
    <>
      <RowShell>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[15px] font-semibold text-foreground">App Lock</p>
            <ProBadge />
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Set up a security passcode</p>
        </div>
        <Toggle value={isEnabled} onChange={toggle} />
      </RowShell>
      <AnimatePresence>
        {showPin && !isEnabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border/40 bg-secondary/30"
          >
            <div className="flex gap-2 p-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4-digit PIN"
                className="h-10 flex-1 rounded-lg border border-border/50 bg-background px-3 text-center font-mono tracking-[0.5em] text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
              />
              <button
                onClick={confirm}
                disabled={pin.length !== 4}
                className="h-10 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-40"
              >
                Set PIN
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/* Biometric login — uses AppLockProvider biometrics when available */
function BiometricRow({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { isBiometricAvailable, isBiometricEnabled, enableBiometric, disableBiometric, isEnabled } = useAppLock()
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (!isBiometricAvailable || !isEnabled) {
      // Fall back to a local preference flag when native biometrics aren't set up.
      onChange(!value)
      return
    }
    setBusy(true)
    if (isBiometricEnabled) disableBiometric()
    else await enableBiometric()
    setBusy(false)
    onChange(!value)
  }

  const on = isBiometricAvailable && isEnabled ? isBiometricEnabled : value

  return (
    <RowShell last>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[15px] font-semibold text-foreground">Biometric Login</p>
          <ProBadge />
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Unlock the app using biometric login</p>
      </div>
      <Toggle value={on} onChange={toggle} disabled={busy} />
    </RowShell>
  )
}

/* ── Option picker bottom sheet ── */
interface PickerState {
  title: string
  options: { value: string; label: string }[]
  selected: string
  onSelect: (value: string) => void
}

function PickerSheet({ picker, onClose }: { picker: PickerState | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {picker && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="absolute inset-x-0 bottom-0 z-50 max-h-[70%] overflow-hidden rounded-t-3xl bg-card border-t border-border/60"
          >
            <div className="mx-auto my-3 h-1 w-10 rounded-full bg-border" />
            <h3 className="px-5 pb-2 text-[17px] font-bold text-foreground">{picker.title}</h3>
            <div className="max-h-[52vh] overflow-y-auto px-3 pb-6">
              {picker.options.map(opt => {
                const active = opt.value === picker.selected
                return (
                  <button
                    key={opt.value}
                    onClick={() => { picker.onSelect(opt.value); onClose() }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors',
                      active ? 'bg-primary/10' : 'hover:bg-accent/60',
                    )}
                  >
                    <span className={cn('text-[14px]', active ? 'font-semibold text-primary' : 'text-foreground')}>
                      {opt.label}
                    </span>
                    {active && <Check className="h-4 w-4 text-primary" />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ── Confirm bottom sheet (danger actions) ── */
function ConfirmSheet({ open, icon: Icon, title, body, confirmLabel, onConfirm, onCancel }: {
  open: boolean
  icon: React.ElementType
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="absolute inset-x-0 bottom-0 z-50 rounded-t-3xl bg-card border-t border-border/60 p-5 pb-8"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
                <Icon className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-foreground">{title}</h3>
                <p className="text-[12px] text-muted-foreground">This cannot be undone</p>
              </div>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={onCancel}
                className="rounded-xl border border-border py-3 text-[14px] font-semibold text-foreground hover:bg-secondary/60 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="rounded-xl bg-red-500 py-3 text-[14px] font-bold text-white hover:bg-red-600 transition-colors"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function today() {
  return new Date().toISOString().split('T')[0]
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function formatTime(hhmm: string, fmt: '12h' | '24h') {
  const [h, m] = hhmm.split(':').map(Number)
  if (fmt === '24h') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const period = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m).padStart(2, '0')} ${period}`
}

/**
 * Fallback restore for a PennyFlow backup file. Supports the current
 * FullBackupFile shape (`{ tables: {...}, preferences: {...} }`) as well as the
 * older `{ data: {...} }` / flat export shapes.
 */
async function restoreFromBackupObject(data: unknown) {
  const obj = (data ?? {}) as {
    tables?: Record<string, unknown[]>
    data?: Record<string, unknown[]>
    preferences?: Record<string, unknown>
    profile?: Record<string, unknown>
  }
  // Preferred: the full-backup "tables" map produced by DataExportService.
  const tablesMap: Record<string, unknown[]> =
    obj.tables && typeof obj.tables === 'object'
      ? obj.tables
      : (obj.data && typeof obj.data === 'object' ? obj.data : (obj as Record<string, unknown[]>))

  const dbTables = db as unknown as Record<
    string,
    { clear?: () => Promise<void>; bulkAdd?: (rows: unknown[]) => Promise<unknown> }
  >
  for (const [name, rows] of Object.entries(tablesMap || {})) {
    if (!Array.isArray(rows)) continue
    const table = dbTables[name]
    if (!table || typeof table.clear !== 'function' || typeof table.bulkAdd !== 'function') continue
    try {
      await table.clear()
      await table.bulkAdd(rows)
    } catch {
      // Skip tables that don't exist in this DB version.
    }
  }

  // Restore preferences from the full-backup shape.
  if (obj.preferences && typeof obj.preferences === 'object') {
    for (const [key, value] of Object.entries(obj.preferences)) {
      try { localStorage.setItem(key, String(value)) } catch {}
    }
  }

  if (obj.profile) { try { await saveProfile(obj.profile) } catch {} }
}
