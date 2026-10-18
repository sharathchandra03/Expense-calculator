'use client'

import React, { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  generateUUID,
  type SharedWallet,
  type SharedWalletMember,
  type SharedWalletExpense,
  type SharedWalletExpenseShare,
} from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, X, Check, Users, Trash2, ChevronLeft, UserPlus,
  Receipt, ArrowRight, Copy, Wallet, Scale,
} from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { Select } from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'

/* ─────────────────────────── Settlement math ─────────────────────────── */

/**
 * Compute each member's net position for a wallet.
 * paid   = total this member paid out for shared expenses
 * owed   = total share of expenses assigned to this member (what they consumed)
 * net    = paid - owed  →  positive means the group owes them, negative means
 *          they owe the group.
 */
export function computeMemberStats(wallet: SharedWallet) {
  const stats: Record<string, { paid: number; owed: number; net: number }> = {}
  for (const m of wallet.members) stats[m.id] = { paid: 0, owed: 0, net: 0 }

  for (const tx of wallet.transactions) {
    if (tx.type !== 'expense') continue
    if (stats[tx.paidBy]) stats[tx.paidBy].paid += tx.amount
    const shares = tx.shares && tx.shares.length > 0
      ? tx.shares
      : equalShares(tx.amount, wallet.members.map(m => m.id))
    for (const s of shares) {
      if (stats[s.memberId]) stats[s.memberId].owed += s.amount
    }
  }

  for (const id of Object.keys(stats)) {
    stats[id].net = round2(stats[id].paid - stats[id].owed)
  }
  return stats
}

/** Build an equal split of `amount` across the given member ids. */
export function equalShares(amount: number, memberIds: string[]): SharedWalletExpenseShare[] {
  if (memberIds.length === 0) return []
  const per = round2(amount / memberIds.length)
  const shares = memberIds.map((memberId) => ({ memberId, amount: per, settled: false }))
  // Fix rounding drift on the last share so shares sum exactly to amount.
  const drift = round2(amount - per * memberIds.length)
  if (drift !== 0 && shares.length > 0) {
    shares[shares.length - 1].amount = round2(shares[shares.length - 1].amount + drift)
  }
  return shares
}

/**
 * Greedy who-pays-whom settlement: match the biggest creditor with the biggest
 * debtor repeatedly until everyone is square. Returns minimal-ish transfers.
 */
export function computeSettlements(wallet: SharedWallet): Array<{ from: string; to: string; amount: number }> {
  const stats = computeMemberStats(wallet)
  const creditors = wallet.members
    .map(m => ({ id: m.id, net: stats[m.id]?.net ?? 0 }))
    .filter(m => m.net > 0.01)
    .sort((a, b) => b.net - a.net)
  const debtors = wallet.members
    .map(m => ({ id: m.id, net: stats[m.id]?.net ?? 0 }))
    .filter(m => m.net < -0.01)
    .sort((a, b) => a.net - b.net)

  const transfers: Array<{ from: string; to: string; amount: number }> = []
  let ci = 0
  let di = 0
  const cred = creditors.map(c => ({ ...c }))
  const deb = debtors.map(d => ({ ...d }))

  while (ci < cred.length && di < deb.length) {
    const give = Math.min(cred[ci].net, -deb[di].net)
    const amount = round2(give)
    if (amount > 0) {
      transfers.push({ from: deb[di].id, to: cred[ci].id, amount })
    }
    cred[ci].net = round2(cred[ci].net - give)
    deb[di].net = round2(deb[di].net + give)
    if (cred[ci].net <= 0.01) ci++
    if (deb[di].net >= -0.01) di++
  }
  return transfers
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

/* ─────────────────────────────── Screen ──────────────────────────────── */

export function SharedWallets() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const wallets = useLiveQuery(() => db.sharedWallets.toArray()) ?? []
  const safeWallets = Array.isArray(wallets) ? wallets : []
  const active = safeWallets.find(w => w.id === activeId) || null

  if (active) {
    return <WalletDetail wallet={active} onBack={() => setActiveId(null)} />
  }

  const visible = safeWallets.filter(w => !w.archived)

  return (
    <div className="flex flex-col space-y-5 pb-6">
      <PageHeader title="Shared Wallets" subtitle="Split group expenses and settle up" />

      <Button onClick={() => setShowNew(true)} size="pill" className="w-full">
        <Plus className="w-4 h-4" /> New Shared Wallet
      </Button>

      <AnimatePresence>
        {showNew && <NewWalletForm onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); setActiveId(id) }} />}
      </AnimatePresence>

      <div className="space-y-3">
        {visible.length > 0 ? visible.map(w => {
          const stats = computeMemberStats(w)
          const totalSpent = w.transactions
            .filter(t => t.type === 'expense')
            .reduce((s, t) => s + t.amount, 0)
          const unsettled = computeSettlements(w).length
          return (
            <motion.button
              key={w.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setActiveId(w.id)}
              className="w-full text-left p-4 rounded-2xl bg-card border border-border/50 hover:bg-accent active:scale-[0.99] transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Wallet className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{w.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {w.members.length} {w.members.length === 1 ? 'member' : 'members'} • {formatCurrency(totalSpent)}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {unsettled > 0 ? (
                    <span className="text-[10px] font-bold text-amber-500">{unsettled} to settle</span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-500">All settled</span>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{Object.keys(stats).length} balances</p>
                </div>
              </div>
            </motion.button>
          )
        }) : (
          <div className="text-center py-10 rounded-2xl bg-secondary/20 border border-dashed border-border/50">
            <Users className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No shared wallets yet</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">Create one for a trip, flatmates, or an event</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────────── New wallet ────────────────────────────── */

function NewWalletForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [description, setDescription] = useState('')

  const handleSave = async () => {
    if (!name.trim()) return
    const id = generateUUID()
    const owner: SharedWalletMember = {
      id: generateUUID(),
      name: ownerName.trim() || 'You',
      role: 'owner',
      balance: 0,
    }
    const now = new Date().toISOString()
    const wallet: SharedWallet = {
      id,
      name: name.trim(),
      inviteCode: makeInviteCode(),
      description: description.trim() || undefined,
      members: [owner],
      transactions: [],
      createdAt: now,
      updatedAt: now,
      archived: false,
    }
    await db.sharedWallets.add(wallet)
    onCreated(id)
  }

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-sm font-bold">New Shared Wallet</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Wallet name (e.g. Goa Trip)" className="w-full h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />
        <input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Your name (owner)" className="w-full h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />
        <Button onClick={handleSave} disabled={!name.trim()} size="sm" className="w-full"><Check className="w-3.5 h-3.5" />Create</Button>
      </div>
    </motion.div>
  )
}

/* ─────────────────────────── Wallet detail ───────────────────────────── */

function WalletDetail({ wallet, onBack }: { wallet: SharedWallet; onBack: () => void }) {
  const [showMember, setShowMember] = useState(false)
  const [showExpense, setShowExpense] = useState(false)

  const stats = useMemo(() => computeMemberStats(wallet), [wallet])
  const settlements = useMemo(() => computeSettlements(wallet), [wallet])
  const memberName = (id: string) => wallet.members.find(m => m.id === id)?.name ?? 'Unknown'

  const totalSpent = wallet.transactions
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0)

  const touch = (patch: Partial<SharedWallet>) =>
    db.sharedWallets.update(wallet.id, { ...patch, updatedAt: new Date().toISOString() })

  const addMember = async (name: string, role: SharedWalletMember['role']) => {
    const member: SharedWalletMember = { id: generateUUID(), name, role, balance: 0 }
    await touch({ members: [...wallet.members, member] })
  }

  const removeMember = async (id: string) => {
    // Block removal if the member is referenced by any expense.
    const referenced = wallet.transactions.some(
      t => t.paidBy === id || (t.shares ?? []).some(s => s.memberId === id)
    )
    if (referenced) return
    await touch({ members: wallet.members.filter(m => m.id !== id) })
  }

  const addExpense = async (exp: SharedWalletExpense) => {
    await touch({ transactions: [exp, ...wallet.transactions] })
  }

  const deleteExpense = async (id: string) => {
    await touch({ transactions: wallet.transactions.filter(t => t.id !== id) })
  }

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(wallet.inviteCode) } catch {}
  }

  return (
    <div className="flex flex-col space-y-5 pb-6">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-lg hover:bg-secondary">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground truncate">{wallet.name}</h1>
          <button onClick={copyInvite} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            Invite code: <span className="font-mono font-bold">{wallet.inviteCode}</span> <Copy className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-card border border-border/50">
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Total Spent</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50">
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Members</p>
          <p className="text-xl font-bold text-foreground mt-1">{wallet.members.length}</p>
        </div>
      </div>

      {/* Balances */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Balances</p>
        {wallet.members.map(m => {
          const net = stats[m.id]?.net ?? 0
          return (
            <div key={m.id} className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border/50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-foreground">
                  {m.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{m.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{m.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-xs font-bold',
                  net > 0.01 ? 'text-emerald-500' : net < -0.01 ? 'text-destructive' : 'text-muted-foreground'
                )}>
                  {net > 0.01 ? `gets ${formatCurrency(net)}` : net < -0.01 ? `owes ${formatCurrency(-net)}` : 'settled'}
                </span>
                {m.role !== 'owner' && (
                  <button
                    onClick={() => removeMember(m.id)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    title="Remove member (only if not used in any expense)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
        <button onClick={() => setShowMember(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border border-dashed border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-border">
          <UserPlus className="w-3.5 h-3.5" /> Add member
        </button>
      </div>

      <AnimatePresence>
        {showMember && <MemberForm onClose={() => setShowMember(false)} onAdd={(n, r) => { addMember(n, r); setShowMember(false) }} />}
      </AnimatePresence>

      {/* Settle up */}
      {settlements.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Scale className="w-3 h-3" /> Settle up
          </p>
          {settlements.map((s, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-center gap-1.5 text-xs text-foreground min-w-0">
                <span className="font-semibold truncate">{memberName(s.from)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="font-semibold truncate">{memberName(s.to)}</span>
              </div>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex-shrink-0">{formatCurrency(s.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add expense */}
      <Button onClick={() => setShowExpense(true)} size="pill" className="w-full">
        <Plus className="w-4 h-4" /> Add Shared Expense
      </Button>

      <AnimatePresence>
        {showExpense && (
          <ExpenseForm
            members={wallet.members}
            onClose={() => setShowExpense(false)}
            onAdd={(exp) => { addExpense(exp); setShowExpense(false) }}
          />
        )}
      </AnimatePresence>

      {/* Expenses list */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Expenses ({wallet.transactions.length})
        </p>
        {wallet.transactions.length > 0 ? wallet.transactions.map(tx => (
          <div key={tx.id} className="p-3 rounded-2xl bg-card border border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <Receipt className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{tx.description || tx.category || 'Expense'}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Paid by {memberName(tx.paidBy)} • {new Date(tx.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-bold text-foreground">{formatCurrency(tx.amount)}</span>
                <button onClick={() => deleteExpense(tx.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {tx.shares && tx.shares.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tx.shares.map(s => (
                  <span key={s.memberId} className="text-[9px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    {memberName(s.memberId)}: {formatCurrency(s.amount)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )) : (
          <div className="text-center py-6 rounded-2xl bg-secondary/20 border border-dashed border-border/50">
            <Receipt className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No expenses logged yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────────── Sub-forms ─────────────────────────────── */

function MemberForm({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, role: SharedWalletMember['role']) => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<SharedWalletMember['role']>('editor')
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-sm font-bold">Add Member</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Member name" className="w-full h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />
        <Select value={role} onChange={e => setRole(e.target.value as SharedWalletMember['role'])} className="h-9 rounded-xl">
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </Select>
        <Button onClick={() => name.trim() && onAdd(name.trim(), role)} disabled={!name.trim()} size="sm" className="w-full"><Check className="w-3.5 h-3.5" />Add</Button>
      </div>
    </motion.div>
  )
}

function ExpenseForm({
  members,
  onClose,
  onAdd,
}: {
  members: SharedWalletMember[]
  onClose: () => void
  onAdd: (exp: SharedWalletExpense) => void
}) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [paidBy, setPaidBy] = useState(members[0]?.id ?? '')
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  // Who the expense is split among (equal split). All members by default.
  const [included, setIncluded] = useState<Record<string, boolean>>(
    () => Object.fromEntries(members.map(m => [m.id, true]))
  )
  // Custom amounts per member.
  const [custom, setCustom] = useState<Record<string, string>>({})

  const amt = parseFloat(amount) || 0
  const includedIds = members.filter(m => included[m.id]).map(m => m.id)

  const customTotal = useMemo(
    () => members.reduce((s, m) => s + (parseFloat(custom[m.id]) || 0), 0),
    [custom, members]
  )
  const customValid = splitType === 'custom' ? Math.abs(customTotal - amt) < 0.01 : true

  const canSave = !!description.trim() && amt > 0 && !!paidBy &&
    (splitType === 'equal' ? includedIds.length > 0 : customValid)

  const handleSave = () => {
    let shares: SharedWalletExpenseShare[]
    if (splitType === 'equal') {
      shares = equalShares(amt, includedIds)
    } else {
      shares = members
        .map(m => ({ memberId: m.id, amount: round2(parseFloat(custom[m.id]) || 0), settled: false }))
        .filter(s => s.amount > 0)
    }
    onAdd({
      id: generateUUID(),
      date,
      description: description.trim(),
      amount: amt,
      paidBy,
      type: 'expense',
      splitType,
      shares,
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-sm font-bold">Add Shared Expense</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What was it for? (e.g. Dinner)" className="w-full h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />

        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" className="h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />
          <Select value={paidBy} onChange={e => setPaidBy(e.target.value)} className="h-9 rounded-xl">
            {members.map(m => <option key={m.id} value={m.id}>Paid by {m.name}</option>)}
          </Select>
        </div>

        <DatePicker value={date} onChange={d => setDate(d)} placeholder="Date" />

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSplitType('equal')}
            className={cn('h-9 rounded-xl text-xs font-semibold border', splitType === 'equal' ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-secondary border-border/50 text-muted-foreground')}
          >
            Split equally
          </button>
          <button
            onClick={() => setSplitType('custom')}
            className={cn('h-9 rounded-xl text-xs font-semibold border', splitType === 'custom' ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-secondary border-border/50 text-muted-foreground')}
          >
            Custom split
          </button>
        </div>

        {splitType === 'equal' ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Split between</p>
            {members.map(m => (
              <label key={m.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/60 cursor-pointer">
                <span className="text-xs text-foreground">{m.name}</span>
                <input
                  type="checkbox"
                  checked={!!included[m.id]}
                  onChange={e => setIncluded(prev => ({ ...prev, [m.id]: e.target.checked }))}
                  className="h-4 w-4 accent-[#6d5efc]"
                />
              </label>
            ))}
            {includedIds.length > 0 && amt > 0 && (
              <p className="text-[10px] text-muted-foreground px-1">
                {formatCurrency(round2(amt / includedIds.length))} each
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Amount per member</p>
            {members.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-foreground flex-1 truncate">{m.name}</span>
                <input
                  type="number"
                  value={custom[m.id] ?? ''}
                  onChange={e => setCustom(prev => ({ ...prev, [m.id]: e.target.value }))}
                  placeholder="0"
                  className="w-24 h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                />
              </div>
            ))}
            <p className={cn('text-[10px] px-1', customValid ? 'text-muted-foreground' : 'text-destructive')}>
              Split total: {formatCurrency(customTotal)} / {formatCurrency(amt)}
            </p>
          </div>
        )}

        <Button onClick={handleSave} disabled={!canSave} size="sm" className="w-full"><Check className="w-3.5 h-3.5" />Save Expense</Button>
      </div>
    </motion.div>
  )
}
