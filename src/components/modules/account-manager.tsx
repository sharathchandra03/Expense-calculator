'use client'

import React, { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Account, PaymentMode, PaymentModeKind, generateUUID, syncAccountToAsset } from '@/db/schema'
import { formatCurrency, cn, getCurrencySymbol } from '@/lib/utils'
import {
  Plus, X, Info, ChevronRight, Banknote, Landmark, Wallet, CreditCard,
  Link2, Trash2, ArrowLeftRight, Fingerprint, Type as TypeIcon,
  Calendar,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast-notification'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { isBiometricAvailable, verifyWithBiometric } from '@/lib/biometric'

/* ------------------------------------------------------------------ */
/*  Account type metadata                                             */
/* ------------------------------------------------------------------ */

type AddKind = 'bank' | 'wallet' | 'card'

const TYPE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  cash: { icon: Banknote, label: 'Cash', color: '#10b981' },
  bank: { icon: Landmark, label: 'Bank Account', color: '#3b82f6' },
  wallet: { icon: Wallet, label: 'Wallet', color: '#8b5cf6' },
  card: { icon: CreditCard, label: 'Credit Card', color: '#f59e0b' },
  investment: { icon: Wallet, label: 'Investment', color: '#8b5cf6' },
  crypto: { icon: Wallet, label: 'Crypto', color: '#f97316' },
}

// Order in which groups are rendered
const GROUP_ORDER = ['cash', 'bank', 'wallet', 'card', 'investment', 'crypto']

const PAYMENT_MODE_OPTIONS: { kind: PaymentModeKind; label: string }[] = [
  { kind: 'debit_card', label: 'Debit Card' },
  { kind: 'upi', label: 'UPI' },
  { kind: 'cheque', label: 'Cheque' },
  { kind: 'internet_banking', label: 'Internet Banking' },
]

const todayStr = () => new Date().toISOString().split('T')[0]

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function AccountManager() {
  const { showToast } = useToast()
  const accounts = useLiveQuery(() => db.accounts.toArray())
  const safeAccounts = React.useMemo(() => (Array.isArray(accounts) ? accounts : []), [accounts])

  // ---- Show balance (biometric gated) ----
  const [showBalance, setShowBalance] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable)
    // Balance visibility is session-only — always start hidden on load for privacy.
  }, [])

  const handleToggleBalance = async () => {
    if (showBalance) {
      setShowBalance(false)
      return
    }
    // Turning ON — require fingerprint when available
    if (bioAvailable) {
      setVerifying(true)
      const ok = await verifyWithBiometric()
      setVerifying(false)
      if (!ok) {
        showToast('Authentication failed', 'error')
        return
      }
    }
    setShowBalance(true)
  }

  // ---- Add / edit sheet ----
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const openAdd = () => {
    setEditingId(null)
    setSheetOpen(true)
  }

  const openEdit = (acc: Account) => {
    setEditingId(acc.id)
    setSheetOpen(true)
  }

  // ---- Delete ----
  const [accountConfirm, setAccountConfirm] = useState<{ open: boolean; id?: string; name?: string }>({ open: false })
  const confirmDelete = async () => {
    if (accountConfirm.id) await db.accounts.delete(accountConfirm.id)
    setAccountConfirm({ open: false })
  }

  // ---- Transfer sheet ----
  const [transferOpen, setTransferOpen] = useState(false)

  // ---- Summary ----
  // Available Balance: everything that is cash-like (not credit cards).
  // Available Credit: remaining credit on cards (creditLimit - usage).
  const availableBalance = safeAccounts
    .filter((a) => a.type !== 'card')
    .reduce((sum, a) => sum + (a.balance || 0), 0)

  const availableCredit = safeAccounts
    .filter((a) => a.type === 'card')
    .reduce((sum, a) => sum + Math.max(0, a.balance || 0), 0)

  // ---- Group accounts by type ----
  const groups = React.useMemo(() => {
    const map = new Map<string, Account[]>()
    for (const a of safeAccounts) {
      const key = TYPE_META[a.type] ? a.type : 'bank'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    const ordered: { key: string; items: Account[] }[] = []
    for (const key of GROUP_ORDER) {
      if (map.has(key)) {
        ordered.push({ key, items: map.get(key)! })
        map.delete(key)
      }
    }
    // Any leftover unknown types
    for (const [key, items] of map) ordered.push({ key, items })
    return ordered
  }, [safeAccounts])

  const maskedValue = (value: number) => (showBalance ? formatCurrency(value) : `${getCurrencySymbol()}••••••`)

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-bold tracking-tight">All Accounts</h1>
          <Info className="w-4 h-4 text-muted-foreground mt-1" />
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-secondary border border-border/60 text-sm font-semibold hover:bg-secondary/70 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add account
        </button>
      </div>

      {/* Show balance toggle row */}
      <div className="flex items-center justify-between gap-3 mt-3">
        <p className="text-xs text-muted-foreground leading-snug">
          Transactions based balance, actual may va…{' '}
          <span className="font-semibold text-foreground">Show balance</span>
        </p>
        <button
          role="switch"
          aria-checked={showBalance}
          aria-label="Show balance"
          disabled={verifying}
          onClick={handleToggleBalance}
          className={cn(
            'relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors',
            showBalance ? 'bg-primary' : 'bg-secondary border border-border/60',
            verifying && 'opacity-60'
          )}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow',
              showBalance ? 'ml-6' : 'ml-1'
            )}
          >
            {verifying && <Fingerprint className="w-3 h-3 text-primary animate-pulse" />}
          </motion.span>
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-3xl bg-secondary/60 border border-border/50 p-4">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Available Balance <Info className="w-3 h-3" />
          </div>
          <p className="text-lg sm:text-xl font-bold mt-1 break-all">{maskedValue(availableBalance)}</p>
        </div>
        <div className="rounded-3xl bg-secondary/60 border border-border/50 p-4">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Available Credit <Info className="w-3 h-3" />
          </div>
          <p className="text-lg sm:text-xl font-bold mt-1 break-all">{maskedValue(availableCredit)}</p>
        </div>
      </div>

      {/* Transfer shortcut */}
      {safeAccounts.length >= 2 && (
        <button
          onClick={() => setTransferOpen(true)}
          className="mt-3 flex items-center justify-center gap-2 h-10 rounded-full border border-border/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-secondary/60 transition-colors"
        >
          <ArrowLeftRight className="w-4 h-4" /> Transfer money
        </button>
      )}

      {/* Grouped account list */}
      <div className="mt-5 space-y-6">
        {groups.map(({ key, items }) => {
          const meta = TYPE_META[key] ?? TYPE_META.bank
          const Icon = meta.icon
          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <Icon className="w-4 h-4" style={{ color: meta.color }} />
                <h2 className="text-base font-bold">{meta.label}</h2>
              </div>
              <div className="space-y-2">
                {items.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => openEdit(account)}
                    className="w-full flex items-center justify-between gap-3 rounded-2xl bg-secondary/50 border border-border/50 px-4 py-4 text-left hover:bg-secondary/70 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{account.name}</p>
                      {account.type === 'card' && account.creditLimit ? (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Limit {maskedValue(account.creditLimit)}
                        </p>
                      ) : account.paymentModes && account.paymentModes.length > 0 ? (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {account.paymentModes.map((p) => p.name).join(' · ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('text-sm font-bold', account.balance < 0 ? 'text-red-500' : 'text-foreground')}>
                        {maskedValue(account.balance)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}

        {safeAccounts.length === 0 && (
          <div className="text-center py-12 bg-secondary/20 rounded-3xl border border-dashed border-border/60">
            <Wallet className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">No accounts yet</p>
            <p className="text-[10px] text-muted-foreground/80 mt-1">Tap “Add account” to get started.</p>
          </div>
        )}
      </div>

      {/* Add / Edit sheet */}
      <AnimatePresence>
        {sheetOpen && (
          <AddAccountSheet
            key="add-sheet"
            editingId={editingId}
            accounts={safeAccounts}
            onClose={() => setSheetOpen(false)}
            onRequestDelete={(id, name) => {
              setSheetOpen(false)
              setAccountConfirm({ open: true, id, name })
            }}
          />
        )}
      </AnimatePresence>

      {/* Transfer sheet */}
      <AnimatePresence>
        {transferOpen && (
          <TransferSheet
            key="transfer-sheet"
            accounts={safeAccounts}
            onClose={() => setTransferOpen(false)}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={accountConfirm.open}
        title="Delete account?"
        message={`"${accountConfirm.name}" will be deleted. Related transactions are not affected.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setAccountConfirm({ open: false })}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Bottom sheet shell                                                */
/* ------------------------------------------------------------------ */

function BottomSheet({
  title,
  onClose,
  children,
  zIndex = 60,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  zIndex?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ zIndex }}
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md bg-card border-t sm:border border-border/70 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-secondary text-foreground hover:bg-secondary/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Add / Edit account sheet                                          */
/* ------------------------------------------------------------------ */

export function AddAccountSheet({
  editingId,
  accounts,
  onClose,
  onRequestDelete,
  onCreated,
}: {
  editingId: string | null
  accounts: Account[]
  onClose: () => void
  onRequestDelete?: (id: string, name: string) => void
  /** Called with the new account id right after a successful create. */
  onCreated?: (id: string) => void
}) {
  const { showToast } = useToast()
  const existing = editingId ? accounts.find((a) => a.id === editingId) : undefined

  // Map account type -> add-kind tab
  const initialKind: AddKind = existing
    ? existing.type === 'card'
      ? 'card'
      : existing.type === 'wallet'
      ? 'wallet'
      : 'bank'
    : 'bank'

  const [kind, setKind] = useState<AddKind>(initialKind)
  const [name, setName] = useState(existing?.name ?? '')
  const [balance, setBalance] = useState<string>(existing?.balance ? String(existing.balance) : '')
  const [creditLimit, setCreditLimit] = useState<string>(existing?.creditLimit ? String(existing.creditLimit) : '')
  const [billingDay, setBillingDay] = useState<number>(existing?.billingCycleDay ?? 1)
  const [dueDay, setDueDay] = useState<number>(existing?.paymentDueDay ?? 15)
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>(existing?.paymentModes ?? [])

  const [modeSheetOpen, setModeSheetOpen] = useState(false)

  const canDeleteType = !existing || existing.type !== 'cash'

  const appendHistory = (acc: Account | undefined, bal: number) => {
    const history = Array.isArray(acc?.balanceHistory) ? [...acc!.balanceHistory] : []
    const t = todayStr()
    const idx = history.findIndex((h) => h.date === t)
    if (idx >= 0) history[idx] = { date: t, balance: bal }
    else history.push({ date: t, balance: bal })
    return history
  }

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      showToast('Enter an account name', 'error')
      return
    }

    const type: Account['type'] = kind === 'card' ? 'card' : kind === 'wallet' ? 'wallet' : 'bank'
    const bal = kind === 'card'
      ? parseFloat(creditLimit || '0') // available limit uses balance field
      : parseFloat(balance || '0')
    const safeBal = isNaN(bal) ? 0 : bal

    const payload: Partial<Account> = {
      name: trimmed,
      type,
      balance: safeBal,
      balanceHistory: appendHistory(existing, safeBal),
    }

    if (kind === 'card') {
      const limit = parseFloat(creditLimit || '0')
      payload.creditLimit = isNaN(limit) ? 0 : limit
      payload.billingCycleDay = billingDay
      payload.paymentDueDay = dueDay
      payload.paymentModes = []
    } else if (kind === 'bank') {
      payload.paymentModes = paymentModes
      payload.creditLimit = undefined
      payload.billingCycleDay = undefined
      payload.paymentDueDay = undefined
    } else {
      payload.paymentModes = []
      payload.creditLimit = undefined
      payload.billingCycleDay = undefined
      payload.paymentDueDay = undefined
    }

    try {
      if (editingId) {
        await db.accounts.update(editingId, payload)
        await syncAccountToAsset(trimmed, safeBal)
      } else {
        const newId = generateUUID()
        await db.accounts.add({
          ...(payload as Omit<Account, 'id'>),
          id: newId,
        })
        onCreated?.(newId)
      }
      onClose()
    } catch (err) {
      console.error('Error saving account:', err)
      showToast('Could not save account', 'error')
    }
  }

  const tabs: { id: AddKind; label: string }[] = [
    { id: 'bank', label: 'Bank Account' },
    { id: 'wallet', label: 'Wallet' },
    { id: 'card', label: 'Credit Card' },
  ]

  return (
    <BottomSheet title={editingId ? 'Edit account' : 'Add account'} onClose={onClose}>
      {/* Type tabs — locked once an account exists (type stays) */}
      <div className="flex gap-1 p-1 rounded-full bg-secondary/60 border border-border/50">
        {tabs.map((t) => (
          <button
            key={t.id}
            disabled={!!editingId && t.id !== kind}
            onClick={() => setKind(t.id)}
            className={cn(
              'flex-1 h-9 rounded-full text-xs font-semibold transition-colors',
              kind === t.id ? 'bg-foreground text-background' : 'text-muted-foreground',
              !!editingId && t.id !== kind && 'opacity-30 cursor-not-allowed'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Name */}
      <div className="mt-5 flex items-center gap-3 border-b border-border/60 pb-2">
        <TypeIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="flex-1 bg-transparent text-xl font-medium placeholder:text-muted-foreground/50 focus:outline-none"
        />
      </div>

      {/* Balance / limits */}
      {kind === 'card' ? (
        <div className="mt-5 space-y-5">
          <LabeledAmount
            label="Current Available Limit"
            value={creditLimit}
            onChange={setCreditLimit}
          />
          <LabeledAmount
            label="Total Credit Limit"
            value={creditLimit}
            onChange={setCreditLimit}
          />
          <div className="grid grid-cols-2 gap-4">
            <DayField
              label="Billing Cycle Start Date"
              value={billingDay}
              onChange={setBillingDay}
            />
            <DayField
              label="Payment Due Date"
              value={dueDay}
              onChange={setDueDay}
            />
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <LabeledAmount label="Current Balance" value={balance} onChange={setBalance} />
        </div>
      )}

      {/* Linked payment modes (bank only) */}
      {kind === 'bank' && (
        <div className="mt-7">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold">Linked payment modes</h4>
            <button
              onClick={() => setModeSheetOpen(true)}
              className="flex items-center gap-1 h-8 px-3 rounded-full bg-secondary border border-border/60 text-xs font-semibold hover:bg-secondary/70 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {paymentModes.length === 0 ? (
            <div className="mt-5 flex flex-col items-center text-center py-6">
              <Link2 className="w-7 h-7 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-semibold text-muted-foreground">Link your payment modes</p>
              <p className="mt-1 text-xs text-muted-foreground/80 max-w-xs">
                You can add a Debit Card, UPI or other payment modes to use with this bank account.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {paymentModes.map((m) => {
                const label = PAYMENT_MODE_OPTIONS.find((o) => o.kind === m.kind)?.label ?? m.kind
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-2xl bg-secondary/50 border border-border/50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold">{m.name}</p>
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                    </div>
                    <button
                      onClick={() => setPaymentModes((prev) => prev.filter((p) => p.id !== m.id))}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-8 flex items-center justify-between gap-3">
        {editingId && canDeleteType && onRequestDelete ? (
          <button
            onClick={() => onRequestDelete(editingId, name || 'this account')}
            className="flex items-center gap-1.5 h-11 px-4 rounded-full border border-border/60 text-sm font-semibold text-red-500 hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        ) : (
          <span />
        )}
        <Button onClick={handleSave} size="pill" className="px-8">Save</Button>
      </div>

      {/* Add payment mode sub-sheet */}
      <AnimatePresence>
        {modeSheetOpen && (
          <AddPaymentModeSheet
            onClose={() => setModeSheetOpen(false)}
            onSave={(mode) => {
              setPaymentModes((prev) => [...prev, mode])
              setModeSheetOpen(false)
            }}
          />
        )}
      </AnimatePresence>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Add payment mode sub-sheet                                        */
/* ------------------------------------------------------------------ */

function AddPaymentModeSheet({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (mode: PaymentMode) => void
}) {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PaymentModeKind>('debit_card')

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      showToast('Enter a payment mode name', 'error')
      return
    }
    onSave({ id: generateUUID(), name: trimmed, kind })
  }

  return (
    <BottomSheet title="Add payment mode" onClose={onClose} zIndex={70}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Payment mode name"
        className="w-full h-14 rounded-2xl border border-border/60 bg-secondary/40 px-4 text-base placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {PAYMENT_MODE_OPTIONS.map((opt) => (
          <button
            key={opt.kind}
            onClick={() => setKind(opt.kind)}
            className={cn(
              'h-10 px-4 rounded-full border text-sm font-semibold transition-colors',
              kind === opt.kind
                ? 'border-foreground text-foreground'
                : 'border-border/60 text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={handleSave} size="pill" className="px-8">Save</Button>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Transfer sheet                                                    */
/* ------------------------------------------------------------------ */

function TransferSheet({
  accounts,
  onClose,
}: {
  accounts: Account[]
  onClose: () => void
}) {
  const { showToast } = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')

  const appendHistory = (acc: Account, bal: number) => {
    const history = Array.isArray(acc.balanceHistory) ? [...acc.balanceHistory] : []
    const t = todayStr()
    const idx = history.findIndex((h) => h.date === t)
    if (idx >= 0) history[idx] = { date: t, balance: bal }
    else history.push({ date: t, balance: bal })
    return history
  }

  const handleTransfer = async () => {
    const amt = parseFloat(amount || '0')
    if (!from || !to || from === to || isNaN(amt) || amt <= 0) {
      showToast('Pick two different accounts and a valid amount', 'error')
      return
    }
    const fromAcc = accounts.find((a) => a.id === from)
    const toAcc = accounts.find((a) => a.id === to)
    if (!fromAcc || !toAcc) return
    if (fromAcc.balance < amt) {
      showToast('Insufficient balance in the source account', 'error')
      return
    }
    const newFrom = fromAcc.balance - amt
    const newTo = toAcc.balance + amt
    try {
      await db.transaction('rw', [db.accounts, db.assets, db.systemLogs], async () => {
        await db.accounts.update(fromAcc.id, { balance: newFrom, balanceHistory: appendHistory(fromAcc, newFrom) })
        await db.accounts.update(toAcc.id, { balance: newTo, balanceHistory: appendHistory(toAcc, newTo) })
        await syncAccountToAsset(fromAcc.name, newFrom)
        await syncAccountToAsset(toAcc.name, newTo)
        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'system',
          description: `Transfer of ${formatCurrency(amt)} from ${fromAcc.name} to ${toAcc.name}`,
          amount: amt,
        })
      })
      onClose()
    } catch (err) {
      console.error('Transfer failed:', err)
      showToast('Transfer failed', 'error')
    }
  }

  return (
    <BottomSheet title="Transfer money" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">From</label>
          <Select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-2">
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {formatCurrency(a.balance)}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">To</label>
          <Select value={to} onChange={(e) => setTo(e.target.value)} className="mt-2">
            <option value="">Select account</option>
            {accounts.filter((a) => a.id !== from).map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {formatCurrency(a.balance)}</option>
            ))}
          </Select>
        </div>
        <LabeledAmount label="Amount" value={amount} onChange={setAmount} />
      </div>
      <div className="mt-8 flex justify-end">
        <Button onClick={handleTransfer} size="pill" className="px-8">
          <ArrowLeftRight className="w-4 h-4" /> Transfer
        </Button>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Small field helpers                                               */
/* ------------------------------------------------------------------ */

function LabeledAmount({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground font-medium text-base mt-6 select-none">{getCurrencySymbol()}</span>
      <div className="flex-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.]/g, '')
            if ((raw.match(/\./g) || []).length > 1) return
            onChange(raw)
          }}
          placeholder="0"
          className="w-full bg-transparent border-b border-border/60 pb-1 text-2xl font-bold placeholder:text-muted-foreground/40 focus:outline-none focus:border-ring"
        />
      </div>
    </div>
  )
}

function DayField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-start gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground mt-7 flex-shrink-0" />
      <div className="flex-1">
        <label className="text-xs text-muted-foreground">{label}</label>
        <div className="flex items-baseline gap-1 border-b border-border/60 pb-1">
          <Select
            value={String(value)}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            className="h-auto w-auto min-w-[72px] border-0 bg-transparent px-0 py-0 rounded-none active:scale-100"
            triggerClassName="text-2xl font-bold"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d)}>{String(d).padStart(2, '0')}</option>
            ))}
          </Select>
          <span className="text-xs text-muted-foreground">of every month</span>
        </div>
      </div>
    </div>
  )
}
