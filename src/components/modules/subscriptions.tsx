'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, X, Check, AlertTriangle, CalendarClock, Trash2, Zap, RotateCcw, Sparkles,
} from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { Select } from '@/components/ui/select'

type Filter = 'active' | 'cancelled'

export function SubscriptionTracker() {
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState<Filter>('active')

  const subscriptions = useLiveQuery(() => db.subscriptions.toArray()) ?? []
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const safeSubs = Array.isArray(subscriptions) ? subscriptions : []
  const safeTx = Array.isArray(transactions) ? transactions : []

  // Auto-detect potential subscriptions from recurring transactions
  const detectedSubs = useMemo(() => {
    const recurring = safeTx.filter(tx => tx.isRecurring && tx.type === 'expense')
    const existingNames = safeSubs.map(s => s.name.toLowerCase())
    return recurring
      .filter(tx => !existingNames.includes((tx.description || '').toLowerCase()) && !existingNames.includes(tx.category.toLowerCase()))
      .reduce((acc, tx) => {
        if (!acc.find(a => (a.description || '').toLowerCase() === (tx.description || '').toLowerCase())) acc.push(tx)
        return acc
      }, [] as typeof recurring)
  }, [safeTx, safeSubs])

  const activeSubs = safeSubs.filter(s => s.isActive)
  const inactiveSubs = safeSubs.filter(s => !s.isActive)

  const monthlyCost = useMemo(() => {
    return activeSubs.reduce((sum, s) => {
      if (s.cycle === 'monthly') return sum + s.amount
      if (s.cycle === 'yearly') return sum + s.amount / 12
      if (s.cycle === 'weekly') return sum + s.amount * 4.33
      return sum
    }, 0)
  }, [activeSubs])

  const yearlyCost = monthlyCost * 12

  const upcoming = useMemo(() => {
    const now = new Date()
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    return activeSubs
      .filter(s => {
        const nextDate = new Date(s.nextBilling)
        return nextDate >= now && nextDate <= weekLater
      })
      .sort((a, b) => new Date(a.nextBilling).getTime() - new Date(b.nextBilling).getTime())
  }, [activeSubs])

  const possiblyUnused = useMemo(() => {
    const nowMs = new Date().getTime()
    return activeSubs.filter(s => {
      if (!s.lastUsed) return false
      const daysSinceUse = (nowMs - new Date(s.lastUsed).getTime()) / (1000 * 60 * 60 * 24)
      return daysSinceUse > 30
    })
  }, [activeSubs])

  const handleCancel = async (id: string) => { await db.subscriptions.update(id, { isActive: false }) }
  const handleReactivate = async (id: string) => { await db.subscriptions.update(id, { isActive: true }) }
  const handleDelete = async (id: string) => { await db.subscriptions.delete(id) }

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'active', label: 'Active', count: activeSubs.length },
    { key: 'cancelled', label: 'Cancelled', count: inactiveSubs.length },
  ]
  const list = filter === 'active' ? activeSubs : inactiveSubs

  return (
    <div className="flex flex-col space-y-5 pb-8">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Subscriptions</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Track recurring payments</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity"
          aria-label="Add subscription"
        >
          <Plus className="w-5 h-5" strokeWidth={2.4} />
        </button>
      </div>

      {/* ===== Cost summary ===== */}
      <div className="relative rounded-[1.6rem] bg-card border border-border/70 p-5 shadow-card overflow-hidden">
        <div className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Per month</p>
            <p className="text-[26px] font-bold tracking-tight text-foreground mt-1 tabular-nums truncate">{formatCurrency(monthlyCost)}</p>
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Per year</p>
            <p className="text-[26px] font-bold tracking-tight text-foreground mt-1 tabular-nums truncate">{formatCurrency(yearlyCost)}</p>
          </div>
        </div>
        <div className="relative mt-5 flex items-center justify-between rounded-2xl bg-secondary/60 px-4 py-3.5">
          <span className="text-[14px] font-semibold text-muted-foreground">Active subscriptions</span>
          <span className="text-[18px] font-extrabold text-foreground">{activeSubs.length}</span>
        </div>
      </div>

      {/* ===== Upcoming renewals ===== */}
      {upcoming.length > 0 && (
        <div className="rounded-[1.4rem] bg-amber-500/5 border border-amber-500/25 p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <CalendarClock className="w-[18px] h-[18px] text-amber-500" strokeWidth={2.2} />
            <p className="text-[13px] font-bold text-amber-600 dark:text-amber-400">Renewing this week</p>
          </div>
          <div className="space-y-1.5">
            {upcoming.map(s => (
              <div key={s.id} className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-foreground">{s.name}</span>
                <span className="text-[12px] text-muted-foreground">
                  {formatCurrency(s.amount)} • {new Date(s.nextBilling).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Possibly unused ===== */}
      {possiblyUnused.length > 0 && (
        <div className="rounded-[1.4rem] bg-secondary/50 border border-border/60 p-4 flex items-start gap-3">
          <AlertTriangle className="w-[18px] h-[18px] text-muted-foreground mt-0.5 flex-shrink-0" strokeWidth={2.2} />
          <div>
            <p className="text-[13px] font-bold text-foreground">Possibly unused</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {possiblyUnused.map(s => s.name).join(', ')} — not used in 30+ days. Consider cancelling.
            </p>
          </div>
        </div>
      )}

      {/* ===== Add form ===== */}
      <AnimatePresence>{showForm && <SubForm onClose={() => setShowForm(false)} />}</AnimatePresence>

      {/* ===== Detected from recurring ===== */}
      {detectedSubs.length > 0 && (
        <div>
          <h2 className="text-[19px] font-semibold tracking-tight text-foreground mb-3 flex items-center gap-2">
            <Sparkles className="w-[18px] h-[18px] text-primary" strokeWidth={2.2} /> Detected
          </h2>
          <div className="rounded-[1.6rem] bg-card border border-border/70 p-2.5 shadow-card space-y-1">
            {detectedSubs.slice(0, 3).map(tx => (
              <div key={tx.id} className="flex items-center gap-3 p-2.5 rounded-2xl">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-lg flex-shrink-0 ring-1 ring-black/5 dark:ring-white/5">🔁</div>
                <div className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-foreground truncate">{tx.description || tx.category}</span>
                  <span className="text-[12px] text-muted-foreground">{formatCurrency(tx.amount)} • {tx.recurrenceRule || 'recurring'}</span>
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
                  className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[12px] font-bold hover:bg-primary/20 transition-colors flex-shrink-0"
                >
                  Track
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Active / Cancelled toggle ===== */}
      <div className="grid grid-cols-2 gap-1 p-1.5 rounded-full bg-secondary/70">
        {FILTERS.map(f => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn('relative h-9 rounded-full text-[13px] font-bold transition-colors', active ? 'text-foreground' : 'text-muted-foreground')}
            >
              {active && (
                <motion.span layoutId="sub-pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} className="absolute inset-0 rounded-full bg-background shadow-sm" />
              )}
              <span className="relative z-10">{f.label} ({f.count})</span>
            </button>
          )
        })}
      </div>

      {/* ===== Subscription list ===== */}
      {list.length > 0 ? (
        <div className="space-y-3">
          {list.map(sub => (
            <motion.div
              key={sub.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'rounded-[1.6rem] bg-card border border-border/70 p-4 shadow-card flex items-center gap-3',
                !sub.isActive && 'opacity-70'
              )}
            >
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-xl flex-shrink-0 ring-1 ring-black/5 dark:ring-white/5">📱</div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-[15px] font-bold text-foreground truncate', !sub.isActive && 'line-through text-muted-foreground')}>{sub.name}</p>
                <p className="text-[12px] text-muted-foreground mt-0.5 capitalize">
                  {sub.category} • {sub.cycle}
                  {sub.isActive && ` • next ${new Date(sub.nextBilling).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className="text-[16px] font-extrabold text-foreground">{formatCurrency(sub.amount)}</span>
                {sub.isActive ? (
                  <button onClick={() => handleCancel(sub.id)} className="text-[11px] font-bold text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleReactivate(sub.id)} className="text-[11px] font-bold text-primary hover:opacity-80 transition-opacity flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" /> Restore
                    </button>
                    <button onClick={() => handleDelete(sub.id)} className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="rounded-[1.6rem] bg-secondary/20 border border-dashed border-border/60 py-10 text-center">
          <Zap className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[14px] font-semibold text-foreground">No {filter} subscriptions</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            {filter === 'active' ? 'Add one to start tracking recurring payments.' : 'Cancelled subscriptions show up here.'}
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Add subscription form
 * ------------------------------------------------------------------ */
function SubForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [cycle, setCycle] = useState<'monthly' | 'yearly' | 'weekly'>('monthly')
  const [nextBilling, setNextBilling] = useState(new Date().toISOString().split('T')[0])
  const category = 'Subscriptions'

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
      <div className="rounded-[1.6rem] bg-card border border-border/70 p-5 shadow-card space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-[16px] font-bold text-foreground">New subscription</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/70 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Name</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Netflix"
            className="mt-1.5 w-full h-11 px-4 rounded-2xl bg-secondary/60 border border-border/60 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Amount</label>
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
              className="mt-1.5 w-full h-11 px-4 rounded-2xl bg-secondary/60 border border-border/60 text-[14px] font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cycle</label>
            <Select value={cycle} onChange={(e) => setCycle(e.target.value as 'monthly' | 'yearly' | 'weekly')} className="mt-1.5 h-11 rounded-2xl">
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="weekly">Weekly</option>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Next billing</label>
          <DatePicker value={nextBilling} onChange={(d) => setNextBilling(d)} className="mt-1.5" placeholder="Next billing date" />
        </div>

        <button
          onClick={handleSave}
          disabled={!name || !amount}
          className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          <Check className="w-4 h-4" strokeWidth={2.6} /> Save subscription
        </button>
      </div>
    </motion.div>
  )
}
