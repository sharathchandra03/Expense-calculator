'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Subscription, generateUUID } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Check, RefreshCw, AlertTriangle, Calendar, Trash2, Zap } from 'lucide-react'

export function SubscriptionTracker() {
  const [showForm, setShowForm] = useState(false)
  const [showDetected, setShowDetected] = useState(false)

  const subscriptions = useLiveQuery(() => db.subscriptions.toArray()) ?? []
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const safeSubs = Array.isArray(subscriptions) ? subscriptions : []
  const safeTx = Array.isArray(transactions) ? transactions : []

  // Auto-detect potential subscriptions from recurring transactions
  const detectedSubs = useMemo(() => {
    const recurring = safeTx.filter(tx => tx.isRecurring && tx.type === 'expense')
    const existingNames = safeSubs.map(s => s.name.toLowerCase())

    return recurring
      .filter(tx => !existingNames.includes(tx.description.toLowerCase()) && !existingNames.includes(tx.category.toLowerCase()))
      .reduce((acc, tx) => {
        // Deduplicate by description
        if (!acc.find(a => a.description.toLowerCase() === tx.description.toLowerCase())) {
          acc.push(tx)
        }
        return acc
      }, [] as typeof recurring)
  }, [safeTx, safeSubs])

  const activeSubs = safeSubs.filter(s => s.isActive)
  const inactiveSubs = safeSubs.filter(s => !s.isActive)

  // Monthly cost calculation
  const monthlyCost = useMemo(() => {
    return activeSubs.reduce((sum, s) => {
      if (s.cycle === 'monthly') return sum + s.amount
      if (s.cycle === 'yearly') return sum + s.amount / 12
      if (s.cycle === 'weekly') return sum + s.amount * 4.33
      return sum
    }, 0)
  }, [activeSubs])

  const yearlyCost = monthlyCost * 12

  // Upcoming renewals (next 7 days)
  const upcoming = useMemo(() => {
    const now = new Date()
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    return activeSubs.filter(s => {
      const nextDate = new Date(s.nextBilling)
      return nextDate >= now && nextDate <= weekLater
    })
  }, [activeSubs])

  // Possibly unused (no lastUsed in 30+ days)
  const possiblyUnused = activeSubs.filter(s => {
    if (!s.lastUsed) return true
    const daysSinceUse = (Date.now() - new Date(s.lastUsed).getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceUse > 30
  })

  const handleCancel = async (id: string) => {
    await db.subscriptions.update(id, { isActive: false })
  }

  const handleReactivate = async (id: string) => {
    await db.subscriptions.update(id, { isActive: true })
  }

  const handleDelete = async (id: string) => {
    await db.subscriptions.delete(id)
  }

  return (
    <div className="flex flex-col space-y-5 pb-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-xs text-muted-foreground">Track recurring payments and subscriptions</p>
      </div>

      {/* Cost Summary */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl bg-card border border-border/50">
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Monthly Cost</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(monthlyCost)}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="p-4 rounded-2xl bg-card border border-border/50">
          <p className="text-[9px] font-bold text-muted-foreground uppercase">Yearly Cost</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(yearlyCost)}</p>
        </motion.div>
      </div>

      {/* Upcoming Renewals Alert */}
      {upcoming.length > 0 && (
        <div className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-3">
          <Calendar className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400">Upcoming renewals</p>
            {upcoming.map(s => (
              <p key={s.id} className="text-[10px] text-muted-foreground mt-0.5">
                {s.name} - {formatCurrency(s.amount)} on {new Date(s.nextBilling).toLocaleDateString()}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Unused Suggestion */}
      {possiblyUnused.length > 0 && (
        <div className="p-3 rounded-2xl bg-secondary/50 border border-border/50 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">Possibly unused</p>
            <p className="text-[10px] text-muted-foreground">
              {possiblyUnused.map(s => s.name).join(', ')} - not used in 30+ days. Consider cancelling?
            </p>
          </div>
        </div>
      )}

      {/* Add Button */}
      <button
        onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
      >
        <Plus className="w-4 h-4" /> Add Subscription
      </button>

      {/* Add Form */}
      <AnimatePresence>{showForm && <SubForm onClose={() => setShowForm(false)} />}</AnimatePresence>

      {/* Auto-detected from recurring transactions */}
      {detectedSubs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Detected from Recurring ({detectedSubs.length})</p>
          </div>
          {detectedSubs.slice(0, 3).map(tx => (
            <div key={tx.id} className="flex items-center justify-between p-3 rounded-2xl bg-primary/5 border border-primary/20">
              <div>
                <p className="text-xs font-medium text-foreground">{tx.description || tx.category}</p>
                <p className="text-[10px] text-muted-foreground">{formatCurrency(tx.amount)} • {tx.recurrenceRule || 'recurring'}</p>
              </div>
              <button
                onClick={async () => {
                  await db.subscriptions.add({
                    id: generateUUID(),
                    name: tx.description || tx.category,
                    amount: tx.amount,
                    cycle: (tx.recurrenceRule as 'monthly' | 'yearly' | 'weekly') || 'monthly',
                    category: tx.category,
                    nextBilling: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    startDate: tx.date,
                    isActive: true,
                  })
                }}
                className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20"
              >
                + Track
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Active Subscriptions */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active ({activeSubs.length})</p>
        {activeSubs.length > 0 ? activeSubs.map(sub => (
          <div key={sub.id} className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border/50">
            <div>
              <p className="text-xs font-bold text-foreground">{sub.name}</p>
              <p className="text-[10px] text-muted-foreground">{sub.category} • {sub.cycle} • Next: {new Date(sub.nextBilling).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">{formatCurrency(sub.amount)}</span>
              <button onClick={() => handleCancel(sub.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )) : (
          <div className="text-center py-6 rounded-2xl bg-secondary/20 border border-dashed border-border/50">
            <Zap className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No active subscriptions</p>
          </div>
        )}
      </div>

      {/* Cancelled */}
      {inactiveSubs.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cancelled ({inactiveSubs.length})</p>
          {inactiveSubs.map(sub => (
            <div key={sub.id} className="flex items-center justify-between p-3 rounded-2xl bg-secondary/30 border border-border/30 opacity-60">
              <div>
                <p className="text-xs font-medium text-muted-foreground line-through">{sub.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatCurrency(sub.amount)}/{sub.cycle}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleReactivate(sub.id)} className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-[9px] font-bold">Reactivate</button>
                <button onClick={() => handleDelete(sub.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SubForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [cycle, setCycle] = useState<'monthly' | 'yearly' | 'weekly'>('monthly')
  const [category, setCategory] = useState('Subscriptions')
  const [nextBilling, setNextBilling] = useState(new Date().toISOString().split('T')[0])

  const handleSave = async () => {
    if (!name || !amount || Number(amount) <= 0) return
    await db.subscriptions.add({
      id: generateUUID(),
      name,
      amount: parseFloat(amount),
      cycle,
      category,
      nextBilling,
      startDate: new Date().toISOString().split('T')[0],
      isActive: true,
    })
    onClose()
  }

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-sm font-bold">New Subscription</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Netflix)" className="w-full h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />
          <select value={cycle} onChange={(e) => setCycle(e.target.value as any)} className="h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none">
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <input type="date" value={nextBilling} onChange={(e) => setNextBilling(e.target.value)} className="w-full h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60" />
        <button onClick={handleSave} disabled={!name || !amount} className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 hover:opacity-90"><Check className="w-3.5 h-3.5 inline mr-1" />Save</button>
      </div>
    </motion.div>
  )
}
