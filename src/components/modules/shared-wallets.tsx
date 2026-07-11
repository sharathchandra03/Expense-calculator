'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, SharedWallet, generateUUID } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Plus, X, Check, Copy, Wallet, ArrowRight, Trash2 } from 'lucide-react'

/**
 * Phase 2.9: Shared Wallets (Offline-first)
 * Local shared wallet management — create wallets, add members, track shared expenses
 */
export function SharedWallets() {
  const [showCreate, setShowCreate] = useState(false)
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null)

  const wallets = useLiveQuery(() => db.sharedWallets.toArray()) ?? []
  const safeWallets = Array.isArray(wallets) ? wallets : []

  const activeWallet = safeWallets.find(w => w.id === activeWalletId)

  const handleDelete = async (id: string) => {
    await db.sharedWallets.delete(id)
    if (activeWalletId === id) setActiveWalletId(null)
  }

  if (activeWallet) {
    return <WalletDetail wallet={activeWallet} onBack={() => setActiveWalletId(null)} />
  }

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Shared Wallets</h1>
        <p className="text-xs text-muted-foreground">Track expenses with family or roommates</p>
      </div>

      <button
        onClick={() => setShowCreate(true)}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
      >
        <Plus className="w-4 h-4" /> Create Wallet
      </button>

      <AnimatePresence>{showCreate && <CreateWalletForm onClose={() => setShowCreate(false)} />}</AnimatePresence>

      {/* Wallets List */}
      <div className="space-y-3">
        {safeWallets.length > 0 ? safeWallets.map(wallet => (
          <motion.button
            key={wallet.id}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveWalletId(wallet.id)}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-all text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{wallet.name}</p>
                <p className="text-[10px] text-muted-foreground">{wallet.members.length} members • {wallet.transactions.length} transactions</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-mono">{wallet.inviteCode}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </motion.button>
        )) : (
          <div className="text-center py-8 rounded-2xl bg-secondary/20 border border-dashed border-border/50">
            <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">No shared wallets</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Create one to start tracking shared expenses</p>
          </div>
        )}
      </div>
    </div>
  )
}

function CreateWalletForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState([''])

  const handleSave = async () => {
    if (!name) return
    const validMembers = members.filter(m => m.trim())
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()

    await db.sharedWallets.add({
      id: generateUUID(),
      name,
      inviteCode,
      members: [
        { name: 'You', role: 'owner', balance: 0 },
        ...validMembers.map(m => ({ name: m, role: 'editor' as const, balance: 0 })),
      ],
      transactions: [],
      createdAt: new Date().toISOString(),
    })
    onClose()
  }

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-sm font-bold">New Shared Wallet</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Wallet name (e.g. Roommates)" className="w-full h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Members</label>
          {members.map((m, i) => (
            <div key={i} className="flex gap-2">
              <input type="text" value={m} onChange={(e) => { const u = [...members]; u[i] = e.target.value; setMembers(u) }} placeholder={`Member ${i + 1}`} className="flex-1 h-8 px-3 rounded-lg bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />
              {members.length > 1 && <button onClick={() => setMembers(members.filter((_, idx) => idx !== i))} className="px-2 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button onClick={() => setMembers([...members, ''])} className="text-[10px] text-primary font-semibold"><Plus className="w-3 h-3 inline" /> Add member</button>
        </div>
        <button onClick={handleSave} disabled={!name} className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40"><Check className="w-3.5 h-3.5 inline mr-1" />Create Wallet</button>
      </div>
    </motion.div>
  )
}

function WalletDetail({ wallet, onBack }: { wallet: SharedWallet; onBack: () => void }) {
  const [showAddTx, setShowAddTx] = useState(false)
  const [txDesc, setTxDesc] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txPaidBy, setTxPaidBy] = useState(wallet.members[0]?.name || 'You')
  const [copied, setCopied] = useState(false)

  const memberBalances = wallet.members.map(member => {
    const paid = wallet.transactions.filter(t => t.paidBy === member.name).reduce((s, t) => s + t.amount, 0)
    const fairShare = wallet.transactions.reduce((s, t) => s + t.amount, 0) / wallet.members.length
    return { ...member, balance: paid - fairShare }
  })

  const handleAddTx = async () => {
    if (!txDesc || !txAmount || Number(txAmount) <= 0) return
    const newTx = {
      id: generateUUID(),
      date: new Date().toISOString().split('T')[0],
      description: txDesc,
      amount: parseFloat(txAmount),
      paidBy: txPaidBy,
      type: 'expense' as const,
    }
    await db.sharedWallets.update(wallet.id, {
      transactions: [...wallet.transactions, newTx],
    })
    setTxDesc('')
    setTxAmount('')
    setShowAddTx(false)
  }

  const copyCode = () => {
    navigator.clipboard?.writeText(wallet.inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <button onClick={onBack} className="text-xs text-primary font-semibold self-start">← Back to Wallets</button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{wallet.name}</h1>
          <p className="text-xs text-muted-foreground">{wallet.members.length} members</p>
        </div>
        <button onClick={copyCode} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary border border-border/50 text-[10px] font-mono text-foreground">
          <Copy className="w-3 h-3" /> {copied ? 'Copied!' : wallet.inviteCode}
        </button>
      </div>

      {/* Member Balances */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Balances</p>
        {memberBalances.map(member => (
          <div key={member.name} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                {member.name[0]}
              </div>
              <span className="text-xs font-medium text-foreground">{member.name}</span>
              {member.role === 'owner' && <span className="text-[8px] px-1 py-0.5 rounded bg-primary/10 text-primary font-bold">OWNER</span>}
            </div>
            <span className={cn("text-xs font-bold", member.balance >= 0 ? "text-emerald-500" : "text-red-500")}>
              {member.balance >= 0 ? '+' : ''}{formatCurrency(Math.round(member.balance))}
            </span>
          </div>
        ))}
      </div>

      {/* Add Transaction */}
      <button onClick={() => setShowAddTx(!showAddTx)} className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm">
        <Plus className="w-4 h-4" /> Add Shared Expense
      </button>

      <AnimatePresence>
        {showAddTx && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="p-3 rounded-2xl bg-secondary/50 border border-border/50 space-y-2">
              <input type="text" value={txDesc} onChange={(e) => setTxDesc(e.target.value)} placeholder="What was it for?" className="w-full h-9 px-3 rounded-xl bg-background border border-border/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary/60" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} placeholder="Amount" className="h-9 px-3 rounded-xl bg-background border border-border/50 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary/60" />
                <select value={txPaidBy} onChange={(e) => setTxPaidBy(e.target.value)} className="h-9 px-3 rounded-xl bg-background border border-border/50 text-xs focus:outline-none">
                  {wallet.members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <button onClick={handleAddTx} disabled={!txDesc || !txAmount} className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40">Add</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction History */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">History</p>
        {wallet.transactions.length > 0 ? [...wallet.transactions].reverse().map(tx => (
          <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
            <div>
              <p className="text-xs font-bold text-foreground">{tx.description}</p>
              <p className="text-[10px] text-muted-foreground">Paid by {tx.paidBy} • {new Date(tx.date).toLocaleDateString()}</p>
            </div>
            <span className="text-xs font-bold text-foreground">{formatCurrency(tx.amount)}</span>
          </div>
        )) : (
          <p className="text-xs text-muted-foreground text-center py-4">No transactions yet</p>
        )}
      </div>
    </div>
  )
}
