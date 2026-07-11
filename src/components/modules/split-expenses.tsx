'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, SplitExpense, generateUUID } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Plus, Check, X, Divide, Percent, Hash, ChevronRight, UserCheck, AlertCircle } from 'lucide-react'
import { useUndo } from '@/components/ui/undo-toast'

export function SplitExpenses() {
  const [showNewSplit, setShowNewSplit] = useState(false)

  const splits = useLiveQuery(() => db.splits.toArray()) ?? []
  const safeSplits = Array.isArray(splits) ? splits : []

  // Summary: who owes you / you owe
  const summary = useMemo(() => {
    const balances: Record<string, number> = {}
    safeSplits.forEach(split => {
      split.participants.forEach(p => {
        if (!p.settled && p.name !== split.paidBy) {
          if (!balances[p.name]) balances[p.name] = 0
          balances[p.name] += p.amount
        }
      })
    })
    return Object.entries(balances).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
  }, [safeSplits])

  const totalOwed = summary.reduce((sum, s) => sum + s.amount, 0)

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Split Expenses</h1>
        <p className="text-xs text-muted-foreground">Track shared expenses and settlements</p>
      </div>

      {/* Summary Card */}
      {totalOwed > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20"
        >
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Owed to You</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalOwed)}</p>
          <div className="mt-3 space-y-2">
            {summary.slice(0, 3).map(item => (
              <div key={item.name} className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">{item.name}</span>
                <span className="text-xs font-bold text-foreground">{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Add Split Button */}
      <button
        onClick={() => setShowNewSplit(true)}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all"
      >
        <Plus className="w-4 h-4" /> New Split
      </button>

      {/* New Split Form */}
      <AnimatePresence>
        {showNewSplit && <NewSplitForm onClose={() => setShowNewSplit(false)} />}
      </AnimatePresence>

      {/* Active Splits */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Splits</p>
        {safeSplits.length > 0 ? (
          safeSplits
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map(split => <SplitCard key={split.id} split={split} />)
        ) : (
          <div className="text-center py-8 rounded-2xl bg-secondary/20 border border-dashed border-border/50">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">No splits yet</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Split a group expense to track who owes what</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SplitCard({ split }: { split: SplitExpense }) {
  const [expanded, setExpanded] = useState(false)
  const unsettled = split.participants.filter(p => !p.settled && p.name !== split.paidBy)
  const allSettled = unsettled.length === 0

  const handleSettle = async (participantName: string) => {
    const participant = split.participants.find(p => p.name === participantName)
    const updated = split.participants.map(p =>
      p.name === participantName ? { ...p, settled: true } : p
    )

    await db.transaction('rw', [db.splits, db.systemLogs], async () => {
      await db.splits.update(split.id, { participants: updated })

      // Log the settlement
      await db.systemLogs.add({
        id: generateUUID(),
        timestamp: new Date().toISOString(),
        type: 'lending',
        description: `${participantName} settled ₹${participant?.amount?.toLocaleString() || 0} from split expense`,
        amount: participant?.amount || 0,
      })
    })
  }

  return (
    <motion.div
      layout
      className={cn(
        "p-4 rounded-2xl border transition-all",
        allSettled ? "bg-secondary/30 border-border/30 opacity-60" : "bg-card border-border/50"
      )}
    >
      <div className="flex items-center justify-between" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center",
            allSettled ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary"
          )}>
            {allSettled ? <Check className="w-4 h-4" /> : <Divide className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-xs font-bold text-foreground">{formatCurrency(split.totalAmount)}</p>
            <p className="text-[10px] text-muted-foreground">
              Paid by {split.paidBy} • {split.participants.length} people
            </p>
          </div>
        </div>
        <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", expanded && "rotate-90")} />
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
              {split.participants.map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className={cn("w-3.5 h-3.5", p.settled ? "text-emerald-500" : "text-muted-foreground")} />
                    <span className={cn("text-xs", p.settled ? "text-muted-foreground line-through" : "text-foreground font-medium")}>
                      {p.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">{formatCurrency(p.amount)}</span>
                    {!p.settled && p.name !== split.paidBy && (
                      <button
                        onClick={() => handleSettle(p.name)}
                        className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-[9px] font-bold hover:bg-emerald-500/20"
                      >
                        Settle
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function NewSplitForm({ onClose }: { onClose: () => void }) {
  const [totalAmount, setTotalAmount] = useState('')
  const [paidBy, setPaidBy] = useState('You')
  const [splitType, setSplitType] = useState<'equal' | 'custom' | 'percentage'>('equal')
  const [participants, setParticipants] = useState<string[]>([''])
  const [notes, setNotes] = useState('')

  const addParticipant = () => setParticipants([...participants, ''])
  const removeParticipant = (i: number) => setParticipants(participants.filter((_, idx) => idx !== i))
  const updateParticipant = (i: number, val: string) => {
    const updated = [...participants]
    updated[i] = val
    setParticipants(updated)
  }

  const handleSave = async () => {
    const amount = parseFloat(totalAmount)
    if (!amount || amount <= 0) return
    const validParticipants = participants.filter(p => p.trim())
    if (validParticipants.length === 0) return

    // All participants including paidBy
    const allPeople = [paidBy, ...validParticipants]
    const perPerson = amount / allPeople.length

    const splitParticipants = allPeople.map(name => ({
      name,
      amount: Math.round(perPerson * 100) / 100,
      settled: name === paidBy, // Payer is already settled
    }))

    await db.splits.add({
      id: generateUUID(),
      transactionId: '',
      totalAmount: amount,
      paidBy,
      splitType,
      participants: splitParticipants,
      createdAt: new Date().toISOString(),
      notes,
    })

    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-sm font-bold text-foreground">New Split</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Total Amount</label>
            <input
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="₹0"
              className="w-full h-9 mt-1 px-3 rounded-xl bg-secondary border border-border/50 text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Paid By</label>
            <input
              type="text"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="w-full h-9 mt-1 px-3 rounded-xl bg-secondary border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
            />
          </div>
        </div>

        {/* Split Type */}
        <div className="flex gap-1.5">
          {[
            { id: 'equal', label: 'Equal', icon: Divide },
            { id: 'custom', label: 'Custom', icon: Hash },
            { id: 'percentage', label: '%', icon: Percent },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSplitType(t.id as any)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[10px] font-bold transition-all",
                splitType === t.id ? "bg-primary/10 text-primary border border-primary/30" : "bg-secondary text-muted-foreground border border-border/30"
              )}
            >
              <t.icon className="w-3 h-3" /> {t.label}
            </button>
          ))}
        </div>

        {/* Participants */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Participants</label>
          {participants.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={p}
                onChange={(e) => updateParticipant(i, e.target.value)}
                placeholder={`Person ${i + 1}`}
                className="flex-1 h-8 px-3 rounded-lg bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
              />
              {participants.length > 1 && (
                <button onClick={() => removeParticipant(i)} className="px-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <button onClick={addParticipant} className="text-[10px] text-primary font-semibold flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add person
          </button>
        </div>

        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full h-8 px-3 rounded-lg bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
        />

        <button
          onClick={handleSave}
          disabled={!totalAmount || parseFloat(totalAmount) <= 0 || participants.filter(p => p.trim()).length === 0}
          className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Save Split
        </button>
      </div>
    </motion.div>
  )
}
