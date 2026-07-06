'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Account, generateUUID, syncAccountToAsset } from '@/db/schema'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, Edit2, X, ArrowLeftRight, Wallet, Landmark, CreditCard, TrendingDown, Bitcoin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

type AccountType = 'cash' | 'bank' | 'card' | 'investment' | 'crypto'

const ACCOUNT_META: Record<AccountType, { icon: React.ElementType; label: string; color: string }> = {
  cash: { icon: Wallet, label: 'Cash', color: '#10b981' },
  bank: { icon: Landmark, label: 'Bank', color: '#3b82f6' },
  card: { icon: CreditCard, label: 'Card', color: '#f59e0b' },
  investment: { icon: TrendingDown, label: 'Investment', color: '#8b5cf6' },
  crypto: { icon: Bitcoin, label: 'Crypto', color: '#f97316' },
}

const todayStr = () => new Date().toISOString().split('T')[0]

export function AccountManager() {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isTransferring, setIsTransferring] = useState(false)
  const [historyId, setHistoryId] = useState<string | null>(null)

  const [formData, setFormData] = useState<{ name: string; type: AccountType; balance: number }>({
    name: '',
    type: 'bank',
    balance: 0,
  })

  const [transfer, setTransfer] = useState<{ from: string; to: string; amount: number }>({
    from: '',
    to: '',
    amount: 0,
  })

  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const safeAccounts = Array.isArray(accounts) ? accounts : []

  const totalBalance = safeAccounts.reduce((sum, a) => sum + (a.balance || 0), 0)

  const resetForm = () => {
    setFormData({ name: '', type: 'bank', balance: 0 })
    setEditingId(null)
    setIsAdding(false)
  }

  const appendHistory = (account: Account, balance: number) => {
    const history = Array.isArray(account.balanceHistory) ? [...account.balanceHistory] : []
    const t = todayStr()
    const idx = history.findIndex((h) => h.date === t)
    if (idx >= 0) history[idx] = { date: t, balance }
    else history.push({ date: t, balance })
    return history
  }

  const handleSave = async () => {
    const name = formData.name.trim()
    if (!name) return

    try {
      if (editingId) {
        const existing = safeAccounts.find((a) => a.id === editingId)
        await db.accounts.update(editingId, {
          name,
          type: formData.type,
          balance: formData.balance,
          balanceHistory: existing ? appendHistory(existing, formData.balance) : [{ date: todayStr(), balance: formData.balance }],
        })
        await syncAccountToAsset(name, formData.balance)
      } else {
        await db.accounts.add({
          id: generateUUID(),
          name,
          type: formData.type,
          balance: formData.balance,
          balanceHistory: [{ date: todayStr(), balance: formData.balance }],
        })
      }
      resetForm()
    } catch (err) {
      console.error('Error saving account:', err)
    }
  }

  const handleEdit = (account: Account) => {
    setFormData({ name: account.name, type: account.type, balance: account.balance })
    setEditingId(account.id)
    setIsAdding(true)
    setIsTransferring(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this account? This does not delete related transactions.')) {
      await db.accounts.delete(id)
    }
  }

  const handleTransfer = async () => {
    const amount = Number(transfer.amount)
    if (!transfer.from || !transfer.to || transfer.from === transfer.to || amount <= 0) {
      alert('Pick two different accounts and a valid amount.')
      return
    }
    const fromAcc = safeAccounts.find((a) => a.id === transfer.from)
    const toAcc = safeAccounts.find((a) => a.id === transfer.to)
    if (!fromAcc || !toAcc) return
    if (fromAcc.balance < amount) {
      alert('Insufficient balance in the source account.')
      return
    }

    const newFrom = fromAcc.balance - amount
    const newTo = toAcc.balance + amount

    try {
      await db.transaction('rw', [db.accounts, db.assets, db.systemLogs], async () => {
        await db.accounts.update(fromAcc.id, {
          balance: newFrom,
          balanceHistory: appendHistory(fromAcc, newFrom),
        })
        await db.accounts.update(toAcc.id, {
          balance: newTo,
          balanceHistory: appendHistory(toAcc, newTo),
        })
        await syncAccountToAsset(fromAcc.name, newFrom)
        await syncAccountToAsset(toAcc.name, newTo)
        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'system',
          description: `Transfer of ${formatCurrency(amount)} from ${fromAcc.name} to ${toAcc.name}`,
          amount,
        })
      })
      setTransfer({ from: '', to: '', amount: 0 })
      setIsTransferring(false)
    } catch (err) {
      console.error('Transfer failed:', err)
    }
  }

  const historyAccount = safeAccounts.find((a) => a.id === historyId)

  return (
    <div className="flex flex-col space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Accounts</h1>
        <p className="text-xs text-muted-foreground">Manage balances and move money between accounts.</p>
      </div>

      {/* Total balance summary */}
      <div className="rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Balance</p>
        <p className="text-3xl font-bold mt-1">{formatCurrency(totalBalance)}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{safeAccounts.length} account{safeAccounts.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Action buttons */}
      {!isAdding && !isTransferring && (
        <div className="flex gap-2">
          <button
            onClick={() => { setIsAdding(true); setIsTransferring(false) }}
            className="flex-1 h-11 rounded-full bg-foreground text-background font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Account
          </button>
          <button
            onClick={() => { setIsTransferring(true); setIsAdding(false) }}
            disabled={safeAccounts.length < 2}
            className="flex-1 h-11 rounded-full border border-border/60 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <ArrowLeftRight className="w-4 h-4" /> Transfer
          </button>
        </div>
      )}

      {/* Add / Edit form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-secondary/50 border border-border/50 rounded-3xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">{editingId ? 'Edit Account' : 'New Account'}</h3>
              <button onClick={resetForm} className="p-2 hover:bg-secondary rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Name</label>
              <Input
                placeholder="e.g., HDFC Savings"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-2"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Type</label>
              <Select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as AccountType })}
                className="mt-2"
              >
                {Object.entries(ACCOUNT_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">
                {editingId ? 'Current Balance' : 'Starting Balance'}
              </label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={formData.balance || ''}
                onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
                className="mt-2"
              />
            </div>

            <button
              onClick={handleSave}
              className="w-full h-10 rounded-full bg-foreground text-background font-semibold text-xs uppercase tracking-wider"
            >
              {editingId ? 'Update Account' : 'Save Account'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transfer form */}
      <AnimatePresence>
        {isTransferring && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-secondary/50 border border-border/50 rounded-3xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Transfer Money</h3>
              <button onClick={() => setIsTransferring(false)} className="p-2 hover:bg-secondary rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">From</label>
              <Select
                value={transfer.from}
                onChange={(e) => setTransfer({ ...transfer, from: e.target.value })}
                className="mt-2"
              >
                <option value="">Select account</option>
                {safeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {formatCurrency(a.balance)}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">To</label>
              <Select
                value={transfer.to}
                onChange={(e) => setTransfer({ ...transfer, to: e.target.value })}
                className="mt-2"
              >
                <option value="">Select account</option>
                {safeAccounts.filter((a) => a.id !== transfer.from).map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {formatCurrency(a.balance)}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Amount</label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={transfer.amount || ''}
                onChange={(e) => setTransfer({ ...transfer, amount: parseFloat(e.target.value) || 0 })}
                className="mt-2"
              />
            </div>

            <button
              onClick={handleTransfer}
              className="w-full h-10 rounded-full bg-foreground text-background font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <ArrowLeftRight className="w-4 h-4" /> Confirm Transfer
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account list */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {safeAccounts.map((account) => {
            const meta = ACCOUNT_META[account.type] ?? ACCOUNT_META.bank
            const Icon = meta.icon
            return (
              <motion.div
                key={account.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="rounded-2xl bg-card border border-border/50 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${meta.color}22` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: meta.color }} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{account.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{meta.label}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-sm font-bold', account.balance < 0 ? 'text-red-500' : 'text-foreground')}>
                      {formatCurrency(account.balance)}
                    </p>
                    <div className="flex gap-1 justify-end mt-1">
                      <button
                        onClick={() => setHistoryId(historyId === account.id ? null : account.id)}
                        className="p-1.5 hover:bg-secondary/60 rounded-lg transition-colors"
                        title="Balance history"
                      >
                        <TrendingDown className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleEdit(account)}
                        className="p-1.5 hover:bg-secondary/60 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDelete(account.id)}
                        className="p-1.5 hover:bg-destructive/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Balance history */}
                <AnimatePresence>
                  {historyId === account.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Balance History</p>
                        {(account.balanceHistory && account.balanceHistory.length > 0) ? (
                          [...account.balanceHistory].reverse().slice(0, 6).map((h, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{h.date}</span>
                              <span className="font-medium">{formatCurrency(h.balance)}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground/70">No history recorded yet.</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {safeAccounts.length === 0 && (
          <div className="text-center py-10 bg-secondary/20 rounded-3xl border border-dashed border-border/60">
            <Wallet className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">No accounts yet</p>
            <p className="text-[10px] text-muted-foreground/80 mt-1">Add your first account to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}
