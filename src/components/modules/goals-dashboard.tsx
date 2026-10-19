'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Goal } from '@/db/schema'
import { Input } from '@/components/ui/input'
import { formatCurrency, getCurrencySymbol, cn } from '@/lib/utils'
import { Plus, Target, Trash2, X, Edit2, History, Zap, TrendingUp, AlertTriangle, Check } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { motion, AnimatePresence } from 'framer-motion'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useUndo } from '@/components/ui/undo-toast'
import { useToast } from '@/components/ui/toast-notification'
import { Button } from '@/components/ui/button'
import { AccountSelect } from '@/components/ui/account-select'
import { GoalService, GoalPacing } from '@/services/GoalService'

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  low: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
}

const STATUS_BADGE: Record<GoalPacing['status'], { label: string; cls: string; icon: React.ElementType } | null> = {
  achieved: { label: 'Achieved', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', icon: Check },
  on_track: { label: 'On track', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', icon: TrendingUp },
  behind: { label: 'Behind', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', icon: AlertTriangle },
  at_risk: { label: 'At risk', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400', icon: AlertTriangle },
  no_date: null,
}

/** Round quick-add amounts to currency-appropriate "nice" steps. */
function quickSteps(currency: string): { label: string; value: number }[] {
  if (currency === 'JPY' || currency === 'KRW') {
    return [{ label: '+1K', value: 1000 }, { label: '+5K', value: 5000 }, { label: '+10K', value: 10000 }]
  }
  if (currency === 'INR') {
    return [{ label: '+500', value: 500 }, { label: '+1K', value: 1000 }, { label: '+5K', value: 5000 }]
  }
  return [{ label: '+50', value: 50 }, { label: '+100', value: 100 }, { label: '+500', value: 500 }]
}

export function GoalsDashboard() {
  const [isAdding, setIsAdding] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [customAmountId, setCustomAmountId] = useState<string | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    title: '', targetAmount: 0, targetDate: '', category: 'General',
    fundingAccountId: '', priority: 'medium' as Goal['priority'],
    autoSave: false, autoSaveAmount: '', autoSaveDay: '1',
  })

  const { showUndo } = useUndo()
  const { showToast } = useToast()
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: string; title?: string }>({ open: false })

  const goals = useLiveQuery(() => db.goals.toArray()) ?? []
  const safeGoals = useMemo(() => (Array.isArray(goals) ? goals : []), [goals])
  const sortedGoals = useMemo(() => GoalService.sortByPriority(safeGoals), [safeGoals])
  const summary = useMemo(() => GoalService.summarize(safeGoals), [safeGoals])

  const currency = typeof window !== 'undefined' ? (localStorage.getItem('finance-os-currency') || 'INR') : 'INR'
  const steps = quickSteps(currency)

  const handleSave = async () => {
    if (!formData.title || formData.targetAmount <= 0) {
      showToast('Enter a title and target amount')
      return
    }
    try {
      await GoalService.create({
        title: formData.title,
        targetAmount: formData.targetAmount,
        targetDate: formData.targetDate,
        category: formData.category,
        priority: formData.priority,
        fundingAccountId: formData.fundingAccountId || undefined,
        autoSave: formData.autoSave,
        autoSaveAmount: formData.autoSave ? (parseFloat(formData.autoSaveAmount) || undefined) : undefined,
        autoSaveDay: formData.autoSave ? (parseInt(formData.autoSaveDay, 10) || 1) : undefined,
      })
      setFormData({ title: '', targetAmount: 0, targetDate: '', category: 'General', fundingAccountId: '', priority: 'medium', autoSave: false, autoSaveAmount: '', autoSaveDay: '1' })
      setIsAdding(false)
    } catch (err) {
      console.error('Error saving goal:', err)
      showToast('Could not save goal')
    }
  }

  const handleContribute = async (goal: Goal, amount: number) => {
    const remaining = goal.targetAmount - goal.currentAmount
    await GoalService.contribute(goal.id, Math.min(remaining, amount))
  }

  const handleCustomAmountAdd = async (goal: Goal) => {
    const amount = parseFloat(customAmount)
    if (!amount || amount <= 0) { showToast('Enter a valid amount'); return }
    await handleContribute(goal, amount)
    setCustomAmount('')
    setCustomAmountId(null)
  }

  const handleWithdraw = async (goal: Goal, amount: number) => {
    await GoalService.withdraw(goal.id, Math.min(goal.currentAmount, amount))
  }

  const handleDelete = (goal: Goal) => setDeleteConfirm({ open: true, id: goal.id, title: goal.title })

  const handleConfirmDelete = async () => {
    const id = deleteConfirm.id
    if (!id) return
    const goal = safeGoals.find(g => g.id === id)
    await GoalService.delete(id)
    if (goal) showUndo(`"${goal.title}" deleted`, async () => { await db.goals.add(goal) })
    setDeleteConfirm({ open: false })
  }

  return (
    <div className="flex flex-col space-y-5 pb-8">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Savings Goals</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {summary.active} active • {summary.achieved} achieved
            {summary.monthlyCommitment > 0 ? ` • ${formatCurrency(summary.monthlyCommitment)}/mo auto` : ''}
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity"
            aria-label="New goal"
          >
            <Plus className="w-5 h-5" strokeWidth={2.4} />
          </button>
        )}
      </div>

      {/* ===== Overall summary ===== */}
      <div className="relative rounded-[1.6rem] bg-card border border-border/70 p-5 shadow-card overflow-hidden">
        <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total saved</p>
            <p className="text-[26px] font-bold tracking-tight text-foreground mt-1 tabular-nums truncate">{formatCurrency(summary.totalSaved)}</p>
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Target</p>
            <p className="text-[26px] font-bold tracking-tight text-foreground mt-1 tabular-nums truncate">{formatCurrency(summary.totalTarget)}</p>
          </div>
        </div>
        <div className="relative mt-5">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[12px] font-semibold text-muted-foreground">Overall progress</span>
            <span className="text-[13px] font-extrabold text-foreground">{Math.round(summary.overallProgress)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, summary.overallProgress)}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
        </div>
      </div>

      {/* ===== Add goal form ===== */}
      <AnimatePresence>
        {isAdding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-[1.6rem] bg-card border border-border/70 p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[16px] font-bold text-foreground">New goal</p>
                <button onClick={() => setIsAdding(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/70 transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <Input placeholder="Goal title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
              <Input type="number" placeholder="Target amount" value={formData.targetAmount || ''} onChange={(e) => setFormData({ ...formData, targetAmount: parseFloat(e.target.value) || 0 })} />
              <DatePicker value={formData.targetDate} onChange={(d) => setFormData({ ...formData, targetDate: d })} />
              <Input placeholder="Category (e.g. Travel, Emergency)" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Priority</label>
                <div className="flex gap-2 mt-1.5">
                  {(['low', 'medium', 'high'] as const).map(p => (
                    <button key={p} onClick={() => setFormData({ ...formData, priority: p })}
                      className={cn('flex-1 py-2.5 rounded-xl text-[13px] font-bold capitalize transition-all',
                        formData.priority === p ? PRIORITY_STYLES[p] + ' ring-1 ring-current/30' : 'bg-secondary/60 text-muted-foreground hover:text-foreground')}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Funding account (optional)</label>
                <AccountSelect value={formData.fundingAccountId} onChange={(v) => setFormData({ ...formData, fundingAccountId: v })} placeholder="Don't track (counter only)" className="mt-1.5" />
                <p className="text-[11px] text-muted-foreground mt-1.5">If set, contributions move real money out of this account and withdrawals return it.</p>
              </div>

              <div className="rounded-2xl bg-secondary/50 border border-border/60 p-3.5 space-y-2">
                <label className="flex items-center justify-between">
                  <span className="text-[13px] font-bold flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-primary" /> Auto-save monthly</span>
                  <input type="checkbox" checked={formData.autoSave} onChange={(e) => setFormData({ ...formData, autoSave: e.target.checked })} className="w-4 h-4 accent-primary" />
                </label>
                {formData.autoSave && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Amount / month</label>
                      <Input type="number" placeholder="0" value={formData.autoSaveAmount} onChange={(e) => setFormData({ ...formData, autoSaveAmount: e.target.value })} className="h-9 text-[13px]" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Day (1-28)</label>
                      <Input type="number" placeholder="1" value={formData.autoSaveDay} onChange={(e) => setFormData({ ...formData, autoSaveDay: e.target.value })} className="h-9 text-[13px]" />
                    </div>
                    {!formData.fundingAccountId && (
                      <p className="col-span-2 text-[10px] text-amber-500">Auto-save needs a funding account to move money.</p>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={handleSave}
                className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-[15px] flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                <Check className="w-4 h-4" strokeWidth={2.6} /> Save goal
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Goals list ===== */}
      <div className="space-y-3">
        {sortedGoals.length > 0 ? (
          sortedGoals.map(goal => {
            const pacing = GoalService.getPacing(goal)
            const remaining = pacing.remaining
            const badge = STATUS_BADGE[pacing.status]
            const milestones = goal.milestones && goal.milestones.length > 0 ? goal.milestones : GoalService.buildMilestones(goal.targetAmount)
            const achieved = remaining <= 0
            return (
              <motion.div key={goal.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.6rem] bg-card border border-border/70 p-5 shadow-card">
                {/* Head */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ring-1 ring-black/5 dark:ring-white/5', achieved ? 'bg-emerald-500/10' : 'bg-primary/10')}>
                      <Target className={cn('w-5 h-5', achieved ? 'text-emerald-500' : 'text-primary')} strokeWidth={2.2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[16px] font-bold text-foreground truncate">{goal.title}</p>
                        <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full', PRIORITY_STYLES[goal.priority || 'medium'])}>
                          {goal.priority || 'medium'}
                        </span>
                        {goal.autoSave && goal.autoSaveAmount ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-0.5">
                            <Zap className="w-2.5 h-2.5" /> Auto
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-0.5">{goal.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {(goal.contributions?.length ?? 0) > 0 && (
                      <button onClick={() => setHistoryId(historyId === goal.id ? null : goal.id)} className="p-2 hover:bg-secondary/60 rounded-xl transition-colors" aria-label="History">
                        <History className="w-4 h-4 text-muted-foreground" />
                      </button>
                    )}
                    <button onClick={() => setEditingGoalId(goal.id)} className="p-2 hover:bg-secondary/60 rounded-xl transition-colors" aria-label="Edit goal">
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(goal)} className="p-2 hover:bg-destructive/10 rounded-xl transition-colors" aria-label="Delete goal">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {/* Amounts */}
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <span className="text-[20px] font-extrabold text-foreground tabular-nums">{formatCurrency(goal.currentAmount)}</span>
                    <span className="text-[13px] text-muted-foreground"> / {formatCurrency(goal.targetAmount)}</span>
                  </div>
                  <span className="text-[14px] font-extrabold text-foreground">{Math.round(pacing.progress)}%</span>
                </div>

                {/* Progress with milestone ticks */}
                <div className="relative w-full h-2.5 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className={cn('h-full rounded-full', achieved ? 'bg-emerald-500' : 'bg-primary')}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, pacing.progress)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                  {milestones.map((m, i) => {
                    const pct = goal.targetAmount > 0 ? (m.amount / goal.targetAmount) * 100 : 0
                    if (pct >= 100) return null
                    return (
                      <span
                        key={i}
                        className={cn('absolute top-0 bottom-0 w-0.5', m.completed ? 'bg-primary-foreground/60' : 'bg-foreground/15')}
                        style={{ left: `${pct}%` }}
                      />
                    )
                  })}
                </div>

                {/* Pacing line */}
                {!pacing.isAchieved && (pacing.requiredPerMonth || badge) && (
                  <div className="flex items-center justify-between mt-3">
                    {pacing.requiredPerMonth ? (
                      <p className="text-[12px] text-muted-foreground">
                        Save <span className="font-bold text-foreground">{formatCurrency(pacing.requiredPerMonth)}/mo</span>
                        {pacing.monthsLeft ? ` for ${pacing.monthsLeft} mo` : ''}
                      </p>
                    ) : <span />}
                    {badge && (
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1', badge.cls)}>
                        <badge.icon className="w-3 h-3" /> {badge.label}
                      </span>
                    )}
                  </div>
                )}

                {/* Contribute actions */}
                <div className="flex gap-2 mt-4">
                  {remaining > 0 ? (
                    <>
                      {steps.map(s => (
                        <button
                          key={s.value}
                          onClick={() => handleContribute(goal, s.value)}
                          className="flex-1 h-9 rounded-xl bg-primary/10 text-primary text-[13px] font-bold hover:bg-primary/20 transition-colors"
                        >
                          {s.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setCustomAmountId(customAmountId === goal.id ? null : goal.id)}
                        className="flex-1 h-9 rounded-xl bg-secondary text-foreground text-[13px] font-bold hover:bg-secondary/70 transition-colors"
                      >
                        Custom
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-500" strokeWidth={2.6} />
                      <p className="text-[13px] text-emerald-500 font-bold">Goal achieved!</p>
                    </div>
                  )}
                </div>

                {/* Custom amount input */}
                {customAmountId === goal.id && remaining > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex gap-2 mt-2.5 pt-2.5 border-t border-border/40">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">{getCurrencySymbol(currency)}</span>
                      <Input type="number" placeholder="Amount" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} className="h-9 text-[13px] pl-7" />
                    </div>
                    <Button size="sm" onClick={() => handleCustomAmountAdd(goal)}>Add</Button>
                  </motion.div>
                )}

                {/* Withdraw */}
                {goal.currentAmount > 0 && remaining > 0 && (
                  <div className="flex gap-2 mt-2">
                    {steps.slice(0, 2).map(s => (
                      <button
                        key={s.value}
                        onClick={() => handleWithdraw(goal, s.value)}
                        className="flex-1 h-8 rounded-xl bg-rose-500/10 text-rose-500 text-[12px] font-bold hover:bg-rose-500/20 transition-colors"
                      >
                        {s.label.replace('+', '-')}
                      </button>
                    ))}
                  </div>
                )}

                {/* Contribution history */}
                <AnimatePresence>
                  {historyId === goal.id && (goal.contributions?.length ?? 0) > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                        {[...(goal.contributions || [])].reverse().slice(0, 8).map((c) => (
                          <div key={c.id} className="flex items-center justify-between text-[12px]">
                            <span className="text-muted-foreground">
                              {new Date(c.date).toLocaleDateString()}{c.auto ? ' · auto' : ''}
                            </span>
                            <span className={cn('font-bold', c.amount >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                              {c.amount >= 0 ? '+' : ''}{formatCurrency(c.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {goal.targetDate && (
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Target: {new Date(goal.targetDate).toLocaleDateString()}
                    {pacing.projectedCompletion && !pacing.isAchieved && (
                      <> • Projected: {pacing.projectedCompletion.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</>
                    )}
                  </p>
                )}
              </motion.div>
            )
          })
        ) : (
          <div className="rounded-[1.6rem] bg-secondary/20 border border-dashed border-border/60 py-12 text-center">
            <Target className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-[14px] font-bold text-foreground">No goals yet</p>
            <p className="text-[12px] text-muted-foreground mt-1">Create a goal to start saving with purpose.</p>
          </div>
        )}
      </div>

      {/* Edit Goal Modal */}
      <AnimatePresence>
        {editingGoalId && (
          <EditGoalForm goalId={editingGoalId} goals={safeGoals} onClose={() => setEditingGoalId(null)} />
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Delete Goal?"
        message={`Are you sure you want to delete "${deleteConfirm.title}"? You can undo this action.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ open: false })}
      />
    </div>
  )
}

function EditGoalForm({ goalId, goals, onClose }: { goalId: string; goals: Goal[]; onClose: () => void }) {
  const goal = goals.find(g => g.id === goalId)
  const { showToast } = useToast()
  const [data, setData] = useState({
    title: goal?.title || '',
    targetAmount: goal?.targetAmount?.toString() || '',
    targetDate: goal?.targetDate || '',
    category: goal?.category || 'General',
    priority: (goal?.priority || 'medium') as 'low' | 'medium' | 'high',
    fundingAccountId: goal?.fundingAccountId || '',
    autoSave: goal?.autoSave ?? false,
    autoSaveAmount: goal?.autoSaveAmount?.toString() || '',
    autoSaveDay: goal?.autoSaveDay?.toString() || '1',
  })

  if (!goal) return null

  const handleSave = async () => {
    if (!data.title || !data.targetAmount) { showToast('Please fill in title and target amount'); return }
    const targetAmt = parseFloat(data.targetAmount) || 0
    if (targetAmt <= 0) { showToast('Target amount must be greater than 0'); return }

    try {
      const milestones = GoalService.updateMilestones(
        GoalService.buildMilestones(targetAmt),
        goal.currentAmount,
        targetAmt
      )
      await db.goals.update(goalId, {
        title: data.title,
        targetAmount: targetAmt,
        targetDate: data.targetDate,
        category: data.category,
        priority: data.priority,
        fundingAccountId: data.fundingAccountId || undefined,
        autoSave: data.autoSave,
        autoSaveAmount: data.autoSave ? (parseFloat(data.autoSaveAmount) || undefined) : undefined,
        autoSaveDay: data.autoSave ? (parseInt(data.autoSaveDay, 10) || 1) : undefined,
        milestones,
        status: goal.currentAmount >= targetAmt ? 'achieved' : 'active',
      })
      onClose()
    } catch {
      showToast('Failed to update goal')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-card border border-border/60 rounded-[1.8rem] p-5 shadow-2xl space-y-4 my-8"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-foreground">Edit goal</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/70 transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Goal name</label>
          <Input placeholder="e.g. Emergency Fund" value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })} className="mt-1.5 text-sm" />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Target amount</label>
          <Input type="number" placeholder="Target amount" value={data.targetAmount} onChange={(e) => setData({ ...data, targetAmount: e.target.value })} className="mt-1.5 text-sm" />
          <p className="text-[11px] text-muted-foreground mt-1.5">Saved amount changes only via contributions, so your ledger stays accurate.</p>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Category</label>
          <Input placeholder="e.g. Travel, Emergency" value={data.category} onChange={(e) => setData({ ...data, category: e.target.value })} className="mt-1.5 text-sm" />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Target date</label>
          <DatePicker value={data.targetDate} onChange={(d) => setData({ ...data, targetDate: d })} className="mt-1.5" />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Priority</label>
          <div className="flex gap-2 mt-1.5">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button key={p} onClick={() => setData({ ...data, priority: p })}
                className={cn('flex-1 py-2.5 rounded-xl text-[13px] font-bold capitalize transition-all',
                  data.priority === p ? PRIORITY_STYLES[p] + ' ring-1 ring-current/30' : 'bg-secondary/60 text-muted-foreground hover:text-foreground')}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Funding account</label>
          <AccountSelect value={data.fundingAccountId} onChange={(v) => setData({ ...data, fundingAccountId: v })} placeholder="Don't track (counter only)" className="mt-1.5" />
        </div>

        <div className="rounded-2xl bg-secondary/40 border border-border/60 p-3.5 space-y-2">
          <label className="flex items-center justify-between">
            <span className="text-[13px] font-bold flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-primary" /> Auto-save monthly</span>
            <input type="checkbox" checked={data.autoSave} onChange={(e) => setData({ ...data, autoSave: e.target.checked })} className="w-4 h-4 accent-primary" />
          </label>
          {data.autoSave && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[10px] text-muted-foreground">Amount / month</label>
                <Input type="number" placeholder="0" value={data.autoSaveAmount} onChange={(e) => setData({ ...data, autoSaveAmount: e.target.value })} className="h-9 text-[13px]" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Day (1-28)</label>
                <Input type="number" placeholder="1" value={data.autoSaveDay} onChange={(e) => setData({ ...data, autoSaveDay: e.target.value })} className="h-9 text-[13px]" />
              </div>
              {!data.fundingAccountId && (
                <p className="col-span-2 text-[10px] text-amber-500">Auto-save needs a funding account to move money.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} className="flex-1 text-sm">Save changes</Button>
          <Button variant="outline" onClick={onClose} className="flex-1 text-sm">Cancel</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
