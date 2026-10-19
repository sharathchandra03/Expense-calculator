'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, DebtRecord, DebtKind } from '@/db/schema'
import { motion, AnimatePresence } from 'framer-motion'
import { formatCurrency, cn } from '@/lib/utils'
import {
  TrendingDown, Calculator, Calendar, Zap, Target, Download, Plus, Trash2, Save,
  Edit2, Check, X, CreditCard, Home, Car, GraduationCap, Banknote, CircleDollarSign,
  History, Wallet, PiggyBank, Flag, ChevronRight, Sparkles,
} from 'lucide-react'
import { DebtService, DebtStrategy } from '@/services/DebtService'
import { AccountSelect } from '@/components/ui/account-select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast-notification'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'

interface DebtInput {
  name: string
  kind: DebtKind
  balance: string
  interestRate: string
  minimumPayment: string
  dueDay: string
  accountId: string
}

const DEBT_KINDS: Array<{ value: DebtKind; label: string; icon: React.ElementType }> = [
  { value: 'credit_card', label: 'Credit Card', icon: CreditCard },
  { value: 'personal_loan', label: 'Personal', icon: Banknote },
  { value: 'home_loan', label: 'Home', icon: Home },
  { value: 'auto_loan', label: 'Auto', icon: Car },
  { value: 'student_loan', label: 'Student', icon: GraduationCap },
  { value: 'other', label: 'Other', icon: CircleDollarSign },
]

function kindIcon(kind?: DebtKind): React.ElementType {
  return DEBT_KINDS.find(k => k.value === kind)?.icon || CircleDollarSign
}

const emptyInput: DebtInput = {
  name: '', kind: 'credit_card', balance: '', interestRate: '', minimumPayment: '', dueDay: '', accountId: '',
}

type Tab = 'debts' | 'plan'

export function DebtPlanner() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('debts')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDebt, setNewDebt] = useState<DebtInput>(emptyInput)
  const [extraPayment, setExtraPayment] = useState('')
  const [strategy, setStrategy] = useState<DebtStrategy>('avalanche')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<DebtInput>(emptyInput)
  const [payingDebt, setPayingDebt] = useState<DebtRecord | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: string; name?: string }>({ open: false })

  const savedDebts = useLiveQuery(() => db.debts.toArray()) ?? []
  const safeDebts = useMemo(() => (Array.isArray(savedDebts) ? savedDebts : []), [savedDebts])
  const activeDebts = useMemo(() => safeDebts.filter(d => d.balance > 0), [safeDebts])

  const lending = useLiveQuery(() => db.lending.toArray()) ?? []
  const importableCount = (Array.isArray(lending) ? lending : [])
    .filter(l => l.type === 'borrowed' && l.status === 'active' && !safeDebts.some(d => d.lendingId === l.id))
    .length

  const summary = useMemo(() => DebtService.summarize(safeDebts), [safeDebts])
  const extra = parseFloat(extraPayment) || 0
  const payoffData = useMemo(() => DebtService.simulate(activeDebts, extra, strategy), [activeDebts, extra, strategy])
  const comparison = useMemo(() => DebtService.compare(activeDebts, extra, strategy), [activeDebts, extra, strategy])

  const importFromLending = async () => {
    const n = await DebtService.importFromLending()
    showToast(n > 0 ? `Imported ${n} debt${n > 1 ? 's' : ''} from Lending` : 'Nothing new to import', n > 0 ? 'success' : 'info')
  }

  const parseInput = (d: DebtInput) => {
    const balance = parseFloat(d.balance)
    const interestRate = parseFloat(d.interestRate)
    const minimumPayment = parseFloat(d.minimumPayment)
    const dueDay = parseInt(d.dueDay, 10)
    if (!d.name.trim() || isNaN(balance) || balance <= 0 || isNaN(minimumPayment) || minimumPayment <= 0) return null
    return {
      name: d.name.trim(),
      kind: d.kind,
      balance,
      interestRate: isNaN(interestRate) ? 0 : interestRate,
      minimumPayment,
      dueDay: isNaN(dueDay) ? undefined : Math.min(31, Math.max(1, dueDay)),
      accountId: d.accountId || undefined,
    }
  }

  const handleSaveDebt = async () => {
    const parsed = parseInput(newDebt)
    if (!parsed) { showToast('Enter a name, balance and minimum payment'); return }
    await DebtService.create(parsed)
    setNewDebt(emptyInput)
    setShowAddForm(false)
  }

  const startEditing = (debt: DebtRecord) => {
    setEditingId(debt.id)
    setEditData({
      name: debt.name,
      kind: debt.kind || 'other',
      balance: debt.balance.toString(),
      interestRate: debt.interestRate.toString(),
      minimumPayment: debt.minimumPayment.toString(),
      dueDay: debt.dueDay?.toString() || '',
      accountId: debt.accountId || '',
    })
  }

  const handleEditSave = async (id: string) => {
    const parsed = parseInput(editData)
    if (!parsed) { showToast('Enter a name, balance and minimum payment'); return }
    await db.debts.update(id, {
      name: parsed.name,
      kind: parsed.kind,
      balance: parsed.balance,
      interestRate: parsed.interestRate,
      minimumPayment: parsed.minimumPayment,
      dueDay: parsed.dueDay,
      accountId: parsed.accountId,
      status: parsed.balance > 0 ? 'active' : 'paid',
    })
    setEditingId(null)
  }

  const confirmDelete = async () => {
    if (deleteConfirm.id) await DebtService.delete(deleteConfirm.id)
    setDeleteConfirm({ open: false })
  }

  const hasDebts = safeDebts.length > 0

  return (
    <div className="flex flex-col space-y-5 pb-6">
      <PageHeader title="Debt Payoff Planner" subtitle="Log real payments and plan your path to debt-free" />

      {/* ===== HERO COMMAND CENTER ===== */}
      {hasDebts && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[28px] p-5 text-white bg-gradient-to-br from-[#4f46e5] via-[#6d5efc] to-[#7c3aed] shadow-fab"
        >
          {/* decorative glow */}
          <div aria-hidden className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <div aria-hidden className="absolute -left-8 -bottom-12 w-36 h-36 rounded-full bg-fuchsia-300/20 blur-2xl" />

          <div className="relative flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Total Remaining Debt</p>
              <p className="text-3xl font-extrabold tracking-tight mt-1">{formatCurrency(summary.totalBalance)}</p>
              <p className="text-[11px] text-white/70 mt-1">
                {summary.activeCount} active • {summary.paidOffCount} cleared
              </p>
            </div>
            <ProgressRing value={summary.overallProgress} />
          </div>

          {/* quick stats */}
          <div className="relative grid grid-cols-3 gap-2 mt-5">
            <HeroStat icon={Sparkles} label="Avg rate" value={`${summary.avgInterestRate.toFixed(1)}%`} />
            <HeroStat icon={Wallet} label="Min / mo" value={formatCurrency(summary.totalMinPayment)} />
            <HeroStat
              icon={Calendar}
              label="Debt-free"
              value={payoffData ? payoffData.debtFreeDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : '—'}
            />
          </div>
        </motion.div>
      )}

      {/* ===== SEGMENTED TABS ===== */}
      {hasDebts && (
        <div className="relative flex p-1 bg-secondary rounded-2xl">
          {(['debts', 'plan'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="relative flex-1 py-2.5 text-xs font-bold rounded-xl transition-colors"
            >
              {tab === t && (
                <motion.span
                  layoutId="debt-tab-pill"
                  className="absolute inset-0 bg-card rounded-xl shadow-sm"
                  transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                />
              )}
              <span className={cn('relative flex items-center justify-center gap-1.5', tab === t ? 'text-foreground' : 'text-muted-foreground')}>
                {t === 'debts' ? <TrendingDown className="w-3.5 h-3.5" /> : <Calculator className="w-3.5 h-3.5" />}
                {t === 'debts' ? `My Debts (${safeDebts.length})` : 'Payoff Plan'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB: MY DEBTS                                                          */}
      {/* ===================================================================== */}
      {(!hasDebts || tab === 'debts') && (
        <div className="space-y-3">
          {importableCount > 0 && (
            <button
              onClick={importFromLending}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Download className="w-4 h-4" /> Import {importableCount} debt{importableCount > 1 ? 's' : ''} from Lending
              </span>
              <ChevronRight className="w-4 h-4 text-primary/60" />
            </button>
          )}

          {safeDebts.map((debt) => {
            const Icon = kindIcon(debt.kind)
            const original = debt.originalBalance || debt.balance
            const paidPct = original > 0 ? ((original - debt.balance) / original) * 100 : 0
            const isPaid = debt.balance <= 0
            return (
              <motion.div
                key={debt.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'p-4 rounded-[22px] bg-card border transition-shadow',
                  isPaid ? 'border-emerald-500/30' : 'border-border/50 hover:shadow-card'
                )}
              >
                {editingId === debt.id ? (
                  /* ---------- Edit mode ---------- */
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={editData.name}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      placeholder="Debt name"
                      className="w-full h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <LabeledNumber label="Balance" value={editData.balance} onChange={(v) => setEditData({ ...editData, balance: v })} />
                      <LabeledNumber label="Rate (%)" value={editData.interestRate} onChange={(v) => setEditData({ ...editData, interestRate: v })} />
                      <LabeledNumber label="Min/mo" value={editData.minimumPayment} onChange={(v) => setEditData({ ...editData, minimumPayment: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <LabeledNumber label="Due day (1-31)" value={editData.dueDay} onChange={(v) => setEditData({ ...editData, dueDay: v })} />
                      <div>
                        <label className="text-[9px] text-muted-foreground">Pay from</label>
                        <AccountSelect value={editData.accountId} onChange={(v) => setEditData({ ...editData, accountId: v })} placeholder="Optional" className="h-8 text-xs" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleEditSave(debt.id)} className="flex items-center gap-1 h-8 px-3 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-500 transition-colors">
                        <Check className="w-3 h-3" /> Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="flex items-center gap-1 h-8 px-3 rounded-lg bg-secondary text-muted-foreground text-[10px] font-bold hover:text-foreground transition-colors">
                        <X className="w-3 h-3" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ---------- Display mode ---------- */
                  <div>
                    <div className="flex items-center gap-3">
                      {/* mini progress ring around the icon */}
                      <MiniRing value={paidPct} paid={isPaid}>
                        <Icon className={cn('w-4 h-4', isPaid ? 'text-emerald-500' : 'text-rose-500')} />
                      </MiniRing>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-foreground truncate">{debt.name}</p>
                          {isPaid && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">PAID</span>}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatCurrency(debt.balance)} left • {debt.interestRate}% APR
                          {debt.dueDay ? ` • Due ${debt.dueDay}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {(debt.payments?.length ?? 0) > 0 && (
                          <IconBtn onClick={() => setHistoryId(historyId === debt.id ? null : debt.id)} label="Payment history">
                            <History className="w-3.5 h-3.5" />
                          </IconBtn>
                        )}
                        <IconBtn onClick={() => startEditing(debt)} label="Edit">
                          <Edit2 className="w-3.5 h-3.5" />
                        </IconBtn>
                        <IconBtn onClick={() => setDeleteConfirm({ open: true, id: debt.id, name: debt.name })} label="Delete" danger>
                          <Trash2 className="w-3.5 h-3.5" />
                        </IconBtn>
                      </div>
                    </div>

                    {/* progress bar w/ labels */}
                    {original > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                          <span>{formatCurrency(original - debt.balance)} paid</span>
                          <span>{Math.round(paidPct)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <motion.div
                            className={cn('h-full rounded-full', isPaid ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#6d5efc] to-[#a78bfa]')}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, paidPct)}%` }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      </div>
                    )}

                    {/* action */}
                    <div className="mt-3">
                      {isPaid ? (
                        <div className="h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">Fully paid off</p>
                        </div>
                      ) : (
                        <button onClick={() => setPayingDebt(debt)} className="w-full h-9 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5">
                          <Wallet className="w-3.5 h-3.5" /> Log a payment
                        </button>
                      )}
                    </div>

                    {/* history */}
                    <AnimatePresence>
                      {historyId === debt.id && (debt.payments?.length ?? 0) > 0 && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
                            {[...(debt.payments || [])].reverse().map((p) => (
                              <div key={p.id} className="flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground">{new Date(p.date).toLocaleDateString()}</span>
                                <span className="text-foreground font-semibold">{formatCurrency(p.amount)}</span>
                                <span className="text-muted-foreground">
                                  {formatCurrency(p.principal)} principal · {formatCurrency(p.interest)} int
                                </span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )
          })}

          {/* Add Debt Form */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="p-4 rounded-[22px] bg-card border border-primary/30 space-y-2.5">
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Add New Debt</p>
                  <input
                    type="text"
                    value={newDebt.name}
                    onChange={(e) => setNewDebt({ ...newDebt, name: e.target.value })}
                    placeholder="Debt name (e.g. Visa Card, Home Loan)"
                    className="w-full h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {DEBT_KINDS.map(k => {
                      const KIcon = k.icon
                      return (
                        <button key={k.value} onClick={() => setNewDebt({ ...newDebt, kind: k.value })}
                          className={cn('flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-full font-semibold transition-colors',
                            newDebt.kind === k.value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>
                          <KIcon className="w-3 h-3" /> {k.label}
                        </button>
                      )
                    })}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <LabeledNumber label="Balance" value={newDebt.balance} onChange={(v) => setNewDebt({ ...newDebt, balance: v })} />
                    <LabeledNumber label="Rate (%)" value={newDebt.interestRate} onChange={(v) => setNewDebt({ ...newDebt, interestRate: v })} />
                    <LabeledNumber label="Min/mo" value={newDebt.minimumPayment} onChange={(v) => setNewDebt({ ...newDebt, minimumPayment: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <LabeledNumber label="Due day (1-31)" value={newDebt.dueDay} onChange={(v) => setNewDebt({ ...newDebt, dueDay: v })} />
                    <div>
                      <label className="text-[9px] text-muted-foreground">Pay from (optional)</label>
                      <AccountSelect value={newDebt.accountId} onChange={(v) => setNewDebt({ ...newDebt, accountId: v })} placeholder="Account" className="h-8 text-xs" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={handleSaveDebt} className="flex-1">
                      <Save className="w-3.5 h-3.5" /> Save Debt
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => { setShowAddForm(false); setNewDebt(emptyInput) }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!showAddForm && (
            <button onClick={() => setShowAddForm(true)} className="w-full flex items-center justify-center gap-1.5 h-11 rounded-2xl border-2 border-dashed border-border/60 text-xs font-bold text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
              <Plus className="w-4 h-4" /> Add a Debt
            </button>
          )}

          {/* Empty state */}
          {!hasDebts && !showAddForm && (
            <div className="p-8 rounded-[22px] bg-secondary/20 border border-dashed border-border/50 text-center">
              <TrendingDown className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs font-bold text-muted-foreground">No debts tracked yet</p>
              <p className="text-[10px] text-muted-foreground mt-1">Add a debt above to build your payoff plan.</p>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB: PAYOFF PLAN                                                       */}
      {/* ===================================================================== */}
      {hasDebts && tab === 'plan' && (
        <div className="space-y-5">
          {/* Extra payment */}
          <div className="p-4 rounded-[22px] bg-card border border-border/50 space-y-2.5">
            <div className="flex items-center gap-2">
              <PiggyBank className="w-4 h-4 text-primary" />
              <label className="text-xs font-bold text-foreground">Extra monthly payment</label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">+</span>
              <input
                type="number"
                value={extraPayment}
                onChange={(e) => setExtraPayment(e.target.value)}
                placeholder="0"
                className="w-full h-11 pl-7 pr-3 rounded-xl bg-secondary border border-border/50 text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
              />
            </div>
            {/* quick presets */}
            <div className="flex gap-1.5">
              {[500, 1000, 2000, 5000].map(v => (
                <button
                  key={v}
                  onClick={() => setExtraPayment(String(v))}
                  className="flex-1 py-1.5 rounded-lg bg-secondary text-[10px] font-bold text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  +{v >= 1000 ? `${v / 1000}k` : v}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground">Paid on top of minimums each month. Higher extra = faster payoff.</p>
          </div>

          {/* Strategy */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payoff strategy</p>
            <div className="grid grid-cols-2 gap-2">
              <StrategyCard
                active={strategy === 'avalanche'}
                onClick={() => setStrategy('avalanche')}
                icon={Zap}
                title="Avalanche"
                desc="Highest interest first. Saves the most money."
              />
              <StrategyCard
                active={strategy === 'snowball'}
                onClick={() => setStrategy('snowball')}
                icon={Target}
                title="Snowball"
                desc="Smallest balance first. Quick motivating wins."
              />
            </div>
          </div>

          {/* Results */}
          {payoffData ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="relative overflow-hidden p-5 rounded-[22px] bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border border-emerald-500/20 text-center">
                <Flag className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                <p className="text-lg font-bold text-foreground">
                  Debt-free by {payoffData.debtFreeDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {payoffData.months} months • {formatCurrency(payoffData.totalInterestPaid)} total interest
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Metric label="Total Debt" value={formatCurrency(payoffData.totalDebt)} />
                <Metric label="Total Interest" value={formatCurrency(payoffData.totalInterestPaid)} valueClass="text-rose-500" />
                <Metric label="Monthly Payment" value={formatCurrency(payoffData.monthlyPayment)} />
                <Metric label="Total Paid" value={formatCurrency(payoffData.totalPaid)} />
              </div>

              {/* Payoff timeline */}
              {payoffData.payoffOrder.length > 1 && (
                <div className="p-4 rounded-[22px] bg-card border border-border/50">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3">Payoff Order ({strategy})</p>
                  <div className="relative pl-6 space-y-3">
                    {/* vertical line */}
                    <span aria-hidden className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />
                    {payoffData.payoffOrder.map((o, i) => (
                      <div key={o.id} className="relative flex items-center justify-between">
                        <span aria-hidden className="absolute -left-[22px] w-[18px] h-[18px] rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="text-xs text-foreground font-medium truncate">{o.name}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">~{o.payoffMonth} mo</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strategy comparison */}
              {comparison && (
                <div className="p-4 rounded-[22px] bg-secondary/40 border border-border/50">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Strategy Comparison</p>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-foreground capitalize">{strategy}</p>
                      <p className="text-[10px] text-muted-foreground">{payoffData.months} mo • {formatCurrency(payoffData.totalInterestPaid)} interest</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                    <div className="text-right">
                      <p className="text-xs font-bold text-muted-foreground capitalize">{comparison.otherStrategy}</p>
                      <p className="text-[10px] text-muted-foreground">{comparison.otherMonths} mo • {formatCurrency(comparison.otherInterest)} interest</p>
                    </div>
                  </div>
                  {comparison.interestSaved > 0 && (
                    <p className={cn('text-[10px] font-bold mt-2.5 px-2.5 py-1.5 rounded-lg', comparison.currentIsBetter ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
                      {comparison.currentIsBetter ? '✓ Your choice saves' : '→ Switching would save'} {formatCurrency(comparison.interestSaved)} in interest ({comparison.monthsSaved} months faster)
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          ) : activeDebts.length === 0 ? (
            <div className="p-5 rounded-[22px] bg-emerald-500/10 border border-emerald-500/20 text-center">
              <Check className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">All debts paid off. You&apos;re debt-free! 🎉</p>
            </div>
          ) : (
            <div className="p-5 rounded-[22px] bg-secondary/30 border border-border/40 text-center">
              <Calculator className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Fill in balance and minimum payment for your debts to see the payoff plan.</p>
            </div>
          )}
        </div>
      )}

      {/* Payment modal */}
      <AnimatePresence>
        {payingDebt && (
          <PaymentModal debt={payingDebt} onClose={() => setPayingDebt(null)} />
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Delete Debt?"
        message={`Remove "${deleteConfirm.name}" and its payment history? This can't be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false })}
      />
    </div>
  )
}

/* ---------- small helpers ---------- */

function ProgressRing({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="relative flex-shrink-0 w-[68px] h-[68px]">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
        <motion.circle
          cx="34" cy="34" r={r} fill="none" stroke="white" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * pct) / 100 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-extrabold leading-none">{Math.round(pct)}%</span>
        <span className="text-[8px] font-semibold text-white/70 uppercase">paid</span>
      </div>
    </div>
  )
}

function MiniRing({ value, paid, children }: { value: number; paid: boolean; children: React.ReactNode }) {
  const pct = Math.min(100, Math.max(0, value))
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <div className="relative flex-shrink-0 w-11 h-11">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" className="stroke-secondary" strokeWidth="3" />
        <circle
          cx="22" cy="22" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
          className={paid ? 'stroke-emerald-500' : 'stroke-primary'}
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
        />
      </svg>
      <div className={cn('absolute inset-0 flex items-center justify-center rounded-full m-[6px]', paid ? 'bg-emerald-500/10' : 'bg-rose-500/10')}>
        {children}
      </div>
    </div>
  )
}

function HeroStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 backdrop-blur-sm px-3 py-2.5">
      <Icon className="w-3.5 h-3.5 text-white/70 mb-1" />
      <p className="text-[9px] font-semibold uppercase tracking-wide text-white/60 leading-none">{label}</p>
      <p className="text-sm font-bold mt-1 leading-none">{value}</p>
    </div>
  )
}

function StrategyCard({ active, onClick, icon: Icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ElementType; title: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-left p-3.5 rounded-[18px] border transition-all',
        active ? 'bg-primary/10 border-primary/40 shadow-sm' : 'bg-card border-border/50 hover:border-primary/20'
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center', active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className={cn('text-xs font-bold', active ? 'text-foreground' : 'text-muted-foreground')}>{title}</span>
        {active && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2 leading-snug">{desc}</p>
    </button>
  )
}

function IconBtn({ onClick, label, danger, children }: { onClick: () => void; label: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground transition-colors',
        danger ? 'hover:text-destructive hover:bg-destructive/10' : 'hover:text-foreground hover:bg-secondary'
      )}
    >
      {children}
    </button>
  )
}

function LabeledNumber({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[9px] text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full h-8 px-2 rounded-lg bg-secondary border border-border/50 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
      />
    </div>
  )
}

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="p-3.5 rounded-[18px] bg-card border border-border/50">
      <p className="text-[9px] text-muted-foreground font-bold uppercase">{label}</p>
      <p className={cn('text-base font-bold mt-0.5', valueClass || 'text-foreground')}>{value}</p>
    </div>
  )
}

function PaymentModal({ debt, onClose }: { debt: DebtRecord; onClose: () => void }) {
  const { showToast } = useToast()
  const [amount, setAmount] = useState(debt.minimumPayment ? debt.minimumPayment.toString() : '')
  const [accountId, setAccountId] = useState(debt.accountId || '')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  const interestPreview = DebtService.monthlyInterest(debt.balance, debt.interestRate)

  const handlePay = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { showToast('Enter a valid amount'); return }
    setSaving(true)
    try {
      await DebtService.logPayment(debt.id, amt, { accountId: accountId || undefined, date })
      showToast(`Logged ${formatCurrency(amt)} payment on ${debt.name}`, 'success')
      onClose()
    } catch {
      showToast('Could not log payment')
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-card border border-border/60 rounded-3xl p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Log payment</h3>
            <p className="text-[11px] text-muted-foreground">{debt.name} • {formatCurrency(debt.balance)} left</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Amount</label>
          <input
            type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
            className="mt-1.5 w-full h-11 px-3 rounded-xl bg-secondary border border-border/50 text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
          />
          {interestPreview > 0.5 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              ~{formatCurrency(interestPreview)} of this month&apos;s payment goes to interest; the rest reduces the balance.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Pay from account</label>
          <AccountSelect value={accountId} onChange={setAccountId} placeholder="Counter only (no account)" className="mt-1.5" />
          <p className="text-[10px] text-muted-foreground mt-1">Pick an account to move real money and record it in your ledger.</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Date</label>
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 w-full h-11 px-3 rounded-xl bg-secondary border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={handlePay} disabled={saving} className="flex-1">
            {saving ? 'Saving...' : 'Log payment'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
