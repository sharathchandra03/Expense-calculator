'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Goal } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
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
import { PageHeader } from '@/components/ui/page-header'
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
  // JPY/KRW/INR use larger whole-number steps; most others are smaller.
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
    <div className="flex flex-col space-y-5 pb-6">
      <PageHeader
        title="Savings Goals"
        subtitle={`${summary.active} active • ${summary.achieved} achieved${summary.monthlyCommitment > 0 ? ` • ${formatCurrency(summary.monthlyCommitment)}/mo auto-saving` : ''}`}
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-secondary/50">
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Total Target</p>
            <p className="text-lg font-bold mt-1">{formatCurrency(summary.totalTarget)}</p>
          </CardContent>
        </Card>
        <Card className="bg-secondary/50">
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Total Saved</p>
            <p className="text-lg font-bold mt-1">{formatCurrency(summary.totalSaved)}</p>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden mt-2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, summary.overallProgress)}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Goals List */}
      <div className="space-y-3">
        {sortedGoals.length > 0 ? (
          sortedGoals.map(goal => {
            const pacing = GoalService.getPacing(goal)
            const remaining = pacing.remaining
            const badge = STATUS_BADGE[pacing.status]
            const milestones = goal.milestones && goal.milestones.length > 0 ? goal.milestones : GoalService.buildMilestones(goal.targetAmount)
            return (
              <motion.div key={goal.id} layout className="p-4 rounded-2xl bg-card border border-border/50">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold truncate">{goal.title}</p>
                      <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full', PRIORITY_STYLES[goal.priority || 'medium'])}>
                        {goal.priority || 'medium'}
                      </span>
                      {goal.autoSave && goal.autoSaveAmount ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" /> Auto
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{goal.category}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(goal.contributions?.length ?? 0) > 0 && (
                      <button onClick={() => setHistoryId(historyId === goal.id ? null : goal.id)} className="p-2 hover:bg-secondary/60 rounded-lg transition-colors" aria-label="History">
                        <History className="w-4 h-4 text-muted-foreground" />
                      </button>
                    )}
                    <button onClick={() => setEditingGoalId(goal.id)} className="p-2 hover:bg-secondary/60 rounded-lg transition-colors" aria-label="Edit goal">
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(goal)} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors" aria-label="Delete goal">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span>{formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}</span>
                    <span className="font-semibold">{Math.round(pacing.progress)}%</span>
                  </div>
                  <div className="relative w-full h-2.5 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, pacing.progress)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                    {/* Milestone ticks */}
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
                </div>

                {/* Pacing line */}
                {!pacing.isAchieved && (pacing.requiredPerMonth || badge) && (
                  <div className="flex items-center justify-between mt-2">
                    {pacing.requiredPerMonth ? (
                      <p className="text-[10px] text-muted-foreground">
                        Save <span className="font-semibold text-foreground">{formatCurrency(pacing.requiredPerMonth)}/mo</span>
                        {pacing.monthsLeft ? ` for ${pacing.monthsLeft} mo` : ''}
                      </p>
                    ) : <span />}
                    {badge && (
                      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5', badge.cls)}>
                        <badge.icon className="w-2.5 h-2.5" /> {badge.label}
                      </span>
                    )}
                  </div>
                )}

                {/* Contribute actions */}
                <div className="flex gap-2 mt-3">
                  {remaining > 0 ? (
                    <>
                      {steps.map(s => (
                        <button
                          key={s.value}
                          onClick={() => handleContribute(goal, s.value)}
                          className="flex-1 h-8 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20"
                        >
                          {s.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setCustomAmountId(customAmountId === goal.id ? null : goal.id)}
                        className="flex-1 h-8 rounded-lg bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/80"
                      >
                        Custom
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <p className="text-xs text-emerald-500 font-semibold">✓ Goal Achieved!</p>
                    </div>
                  )}
                </div>

                {/* Custom amount input */}
                {customAmountId === goal.id && remaining > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex gap-2 mt-2 pt-2 border-t border-border/30">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{getCurrencySymbol(currency)}</span>
                      <Input type="number" placeholder="Amount" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} className="h-8 text-xs pl-6" />
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
                        className="flex-1 h-7 rounded-lg bg-rose-500/10 text-rose-500 text-[10px] font-semibold hover:bg-rose-500/20"
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
                      <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5">
                        {[...(goal.contributions || [])].reverse().slice(0, 8).map((c) => (
                          <div key={c.id} className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">
                              {new Date(c.date).toLocaleDateString()}{c.auto ? ' · auto' : ''}
                            </span>
                            <span className={cn('font-semibold', c.amount >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                              {c.amount >= 0 ? '+' : ''}{formatCurrency(c.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {goal.targetDate && (
                  <p className="text-[10px] text-muted-foreground mt-2">
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
          <div className="text-center py-10 bg-secondary/20 rounded-3xl border border-dashed border-border/50">
            <Target className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs font-bold text-muted-foreground">No goals yet</p>
            <p className="text-[10px] text-muted-foreground mt-1">Create a goal to start saving with purpose.</p>
          </div>
        )}
      </div>

      {!isAdding && (
        <Button onClick={() => setIsAdding(true)} size="pill" className="w-full">
          <Plus className="w-4 h-4" /> New Goal
        </Button>
      )}

      {/* Add goal form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="bg-secondary/50 p-4 rounded-3xl space-y-3">
              <Input placeholder="Goal Title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
              <Input type="number" placeholder="Target Amount" value={formData.targetAmount || ''} onChange={(e) => setFormData({ ...formData, targetAmount: parseFloat(e.target.value) || 0 })} />
              <DatePicker value={formData.targetDate} onChange={(d) => setFormData({ ...formData, targetDate: d })} />
              <Input placeholder="Category (e.g., Travel, Emergency)" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />

              {/* Priority */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Priority</label>
                <div className="flex gap-2 mt-1">
                  {(['low', 'medium', 'high'] as const).map(p => (
                    <button key={p} onClick={() => setFormData({ ...formData, priority: p })}
                      className={cn('flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all',
                        formData.priority === p ? PRIORITY_STYLES[p] + ' ring-1 ring-current/30' : 'bg-card text-muted-foreground hover:text-foreground')}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Funding account */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Funding Account (optional)</label>
                <AccountSelect value={formData.fundingAccountId} onChange={(v) => setFormData({ ...formData, fundingAccountId: v })} placeholder="Don't track (counter only)" className="mt-1" />
                <p className="text-[10px] text-muted-foreground mt-1">If set, contributions move real money out of this account and withdrawals return it.</p>
              </div>

              {/* Auto-save */}
              <div className="rounded-2xl bg-card border border-border/50 p-3 space-y-2">
                <label className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-primary" /> Auto-save monthly</span>
                  <input type="checkbox" checked={formData.autoSave} onChange={(e) => setFormData({ ...formData, autoSave: e.target.checked })} className="w-4 h-4 accent-primary" />
                </label>
                {formData.autoSave && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[9px] text-muted-foreground">Amount / month</label>
                      <Input type="number" placeholder="0" value={formData.autoSaveAmount} onChange={(e) => setFormData({ ...formData, autoSaveAmount: e.target.value })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">Day (1-28)</label>
                      <Input type="number" placeholder="1" value={formData.autoSaveDay} onChange={(e) => setFormData({ ...formData, autoSaveDay: e.target.value })} className="h-8 text-xs" />
                    </div>
                    {!formData.fundingAccountId && (
                      <p className="col-span-2 text-[9px] text-amber-500">Auto-save needs a funding account to move money.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} className="flex-1">Save</Button>
                <Button variant="outline" onClick={() => setIsAdding(false)} className="flex-1">Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
      // Rebuild milestones against the (possibly new) target, preserving completion.
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
        className="w-full max-w-sm bg-card border border-border/60 rounded-3xl p-5 shadow-2xl space-y-4 my-8"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Edit Goal</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Goal Name</label>
          <Input placeholder="e.g., Emergency Fund" value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })} className="mt-1.5 text-sm" />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Target Amount</label>
          <Input type="number" placeholder="Target amount" value={data.targetAmount} onChange={(e) => setData({ ...data, targetAmount: e.target.value })} className="mt-1.5 text-sm" />
          <p className="text-[10px] text-muted-foreground mt-1">Saved amount changes only via contributions, so your ledger stays accurate.</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Category</label>
          <Input placeholder="e.g., Travel, Emergency" value={data.category} onChange={(e) => setData({ ...data, category: e.target.value })} className="mt-1.5 text-sm" />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Target Date</label>
          <DatePicker value={data.targetDate} onChange={(d) => setData({ ...data, targetDate: d })} className="mt-1.5" />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Priority</label>
          <div className="flex gap-2 mt-1.5">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button key={p} onClick={() => setData({ ...data, priority: p })}
                className={cn('flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all',
                  data.priority === p ? PRIORITY_STYLES[p] + ' ring-1 ring-current/30' : 'bg-secondary text-muted-foreground hover:text-foreground')}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Funding Account</label>
          <AccountSelect value={data.fundingAccountId} onChange={(v) => setData({ ...data, fundingAccountId: v })} placeholder="Don't track (counter only)" className="mt-1.5" />
        </div>

        {/* Auto-save */}
        <div className="rounded-2xl bg-secondary/40 border border-border/50 p-3 space-y-2">
          <label className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-primary" /> Auto-save monthly</span>
            <input type="checkbox" checked={data.autoSave} onChange={(e) => setData({ ...data, autoSave: e.target.checked })} className="w-4 h-4 accent-primary" />
          </label>
          {data.autoSave && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[9px] text-muted-foreground">Amount / month</label>
                <Input type="number" placeholder="0" value={data.autoSaveAmount} onChange={(e) => setData({ ...data, autoSaveAmount: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[9px] text-muted-foreground">Day (1-28)</label>
                <Input type="number" placeholder="1" value={data.autoSaveDay} onChange={(e) => setData({ ...data, autoSaveDay: e.target.value })} className="h-8 text-xs" />
              </div>
              {!data.fundingAccountId && (
                <p className="col-span-2 text-[9px] text-amber-500">Auto-save needs a funding account to move money.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} className="flex-1 text-sm">Save Changes</Button>
          <Button variant="outline" onClick={onClose} className="flex-1 text-sm">Cancel</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
