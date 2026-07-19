'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Goal, generateUUID } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCurrency, cn } from '@/lib/utils'
import { Plus, Target, Zap, Trash2, X, Check, Flag, Edit2, Minus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useUndo } from '@/components/ui/undo-toast'
import { useToast } from '@/components/ui/toast-notification'
import { Button } from '@/components/ui/button'

export function GoalsDashboard() {
  const [isAdding, setIsAdding] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [customAmountId, setCustomAmountId] = useState<string | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [formData, setFormData] = useState({
    title: '', targetAmount: 0, targetDate: '', category: 'General'
  })
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: string; title?: string }>({ open: false })
  const { showUndo } = useUndo()
  const { showToast } = useToast()

  const goals = useLiveQuery(() => db.goals.toArray()) ?? []
  const safeGoals = Array.isArray(goals) ? goals : []

  const handleSave = async () => {
    if (!formData.title || formData.targetAmount <= 0) return
    try {
      await db.goals.add({
        id: generateUUID(),
        ...formData,
        currentAmount: 0,
        priority: 'medium',
        autoSave: false,
      })
      setFormData({ title: '', targetAmount: 0, targetDate: '', category: 'General' })
      setIsAdding(false)
    } catch (err) {
      console.error('Error saving goal:', err)
    }
  }

  const handleUpdateProgress = async (id: string, increment: number) => {
    const goal = safeGoals.find(g => g.id === id)
    if (goal) {
      const newAmount = Math.min(goal.targetAmount, goal.currentAmount + increment)
      await db.goals.update(id, { currentAmount: newAmount })
    }
  }

  const handleCustomAmountAdd = async (id: string) => {
    const amount = parseFloat(customAmount)
    if (!amount || amount <= 0) {
      showToast('Enter a valid amount')
      return
    }
    const goal = safeGoals.find(g => g.id === id)
    if (goal) {
      const newAmount = Math.min(goal.targetAmount, goal.currentAmount + amount)
      await db.goals.update(id, { currentAmount: newAmount })
      setCustomAmount('')
      setCustomAmountId(null)
    }
  }

  const handleWithdraw = async (id: string, amount: number) => {
    const goal = safeGoals.find(g => g.id === id)
    if (goal) {
      const newAmount = Math.max(0, goal.currentAmount - amount)
      await db.goals.update(id, { currentAmount: newAmount })
    }
  }

  const handleDelete = async (id: string) => {
    const goal = safeGoals.find(g => g.id === id)
    setDeleteConfirm({ open: true, id, title: goal?.title || 'this goal' })
  }

  const handleConfirmDelete = async () => {
    const id = deleteConfirm.id
    if (!id) return
    const goal = safeGoals.find(g => g.id === id)
    await db.goals.delete(id)
    if (goal) {
      showUndo(`"${goal.title}" deleted`, async () => {
        await db.goals.add(goal)
      })
    }
    setDeleteConfirm({ open: false })
  }

  return (
    <div className="flex flex-col space-y-5 pb-6">
      <h1 className="text-xl font-bold">Savings Goals</h1>

      {/* Summary */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">Active Goals: {safeGoals.length}</p>
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-secondary/50">
            <CardContent className="pt-4">
              <p className="text-[10px] font-semibold uppercase">Total Target</p>
              <p className="text-lg font-bold mt-2">{formatCurrency(safeGoals.reduce((s, g) => s + g.targetAmount, 0))}</p>
            </CardContent>
          </Card>
          <Card className="bg-secondary/50">
            <CardContent className="pt-4">
              <p className="text-[10px] font-semibold uppercase">Total Saved</p>
              <p className="text-lg font-bold mt-2">{formatCurrency(safeGoals.reduce((s, g) => s + g.currentAmount, 0))}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Goals List */}
      <div className="space-y-3">
        {safeGoals.length > 0 ? (
          safeGoals.map(goal => {
            const progress = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0
            const remaining = goal.targetAmount - goal.currentAmount
            return (
              <motion.div
                key={goal.id}
                layout
                className="p-4 rounded-2xl bg-card border border-border/50"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="text-sm font-bold">{goal.title}</p>
                    <p className="text-xs text-muted-foreground">{goal.category}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingGoalId(goal.id)}
                      className="p-2 hover:bg-secondary/60 rounded-lg transition-colors"
                      aria-label="Edit goal"
                    >
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(goal.id)} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span>{formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}</span>
                    <span className="font-semibold">{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      className="h-full bg-primary transition-all"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, progress)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  {remaining > 0 && (
                    <>
                      <button
                        onClick={() => handleUpdateProgress(goal.id, Math.min(remaining, 1000))}
                        className="flex-1 h-8 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20"
                      >
                        +1K
                      </button>
                      <button
                        onClick={() => handleUpdateProgress(goal.id, Math.min(remaining, 5000))}
                        className="flex-1 h-8 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20"
                      >
                        +5K
                      </button>
                      <button
                        onClick={() => setCustomAmountId(customAmountId === goal.id ? null : goal.id)}
                        className="flex-1 h-8 rounded-lg bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/80"
                      >
                        Custom
                      </button>
                    </>
                  )}
                  {remaining <= 0 && (
                    <div className="w-full h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <p className="text-xs text-emerald-500 font-semibold">✓ Goal Achieved!</p>
                    </div>
                  )}
                </div>

                {/* Custom amount input */}
                {customAmountId === goal.id && remaining > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex gap-2 mt-2 pt-2 border-t border-border/30"
                  >
                    <Input
                      type="number"
                      placeholder="Enter amount"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="h-8 text-xs flex-1"
                    />
                    <button
                      onClick={() => handleCustomAmountAdd(goal.id)}
                      className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
                    >
                      Add
                    </button>
                  </motion.div>
                )}

                {/* Withdraw option when there's saved amount */}
                {goal.currentAmount > 0 && remaining > 0 && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleWithdraw(goal.id, Math.min(goal.currentAmount, 1000))}
                      className="flex-1 h-7 rounded-lg bg-rose-500/10 text-rose-500 text-[10px] font-semibold hover:bg-rose-500/20"
                    >
                      -1K
                    </button>
                    <button
                      onClick={() => handleWithdraw(goal.id, Math.min(goal.currentAmount, 5000))}
                      className="flex-1 h-7 rounded-lg bg-rose-500/10 text-rose-500 text-[10px] font-semibold hover:bg-rose-500/20"
                    >
                      -5K
                    </button>
                  </div>
                )}

                {goal.targetDate && (
                  <p className="text-[10px] text-muted-foreground mt-2">Target: {new Date(goal.targetDate).toLocaleDateString()}</p>
                )}
              </motion.div>
            )
          })
        ) : (
          <div className="text-center py-10 bg-secondary/20 rounded-3xl border border-dashed border-border/50">
            <Target className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs font-bold text-muted-foreground">No goals yet</p>
          </div>
        )}
      </div>

      {!isAdding && (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full h-11 rounded-full bg-foreground text-background font-bold uppercase flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Goal
        </button>
      )}

      {isAdding && (
        <motion.div className="bg-secondary/50 p-4 rounded-3xl space-y-3">
          <Input placeholder="Goal Title" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
          <Input type="number" placeholder="Target Amount" value={formData.targetAmount || ''} onChange={(e) => setFormData({...formData, targetAmount: parseFloat(e.target.value) || 0})} />
          <Input type="date" value={formData.targetDate} onChange={(e) => setFormData({...formData, targetDate: e.target.value})} />
          <Input placeholder="Category (e.g., Travel, Emergency)" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} />
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex-1 h-10 rounded-full bg-foreground text-background font-semibold text-xs uppercase flex items-center justify-center gap-1">
              Save
            </button>
            <button onClick={() => setIsAdding(false)} className="flex-1 h-10 rounded-full border font-semibold text-xs uppercase">
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {/* Edit Goal Modal */}
      <AnimatePresence>
        {editingGoalId && (
          <EditGoalForm
            goalId={editingGoalId}
            goals={safeGoals}
            onClose={() => setEditingGoalId(null)}
          />
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
    currentAmount: goal?.currentAmount?.toString() || '0',
    targetDate: goal?.targetDate || '',
    category: goal?.category || 'General',
    priority: (goal?.priority || 'medium') as 'low' | 'medium' | 'high',
  })

  if (!goal) return null

  const handleSave = async () => {
    if (!data.title || !data.targetAmount) {
      showToast('Please fill in title and target amount')
      return
    }

    const targetAmt = parseFloat(data.targetAmount) || 0
    const currentAmt = parseFloat(data.currentAmount) || 0

    if (targetAmt <= 0) {
      showToast('Target amount must be greater than 0')
      return
    }

    try {
      await db.goals.update(goalId, {
        title: data.title,
        targetAmount: targetAmt,
        currentAmount: Math.min(currentAmt, targetAmt),
        targetDate: data.targetDate,
        category: data.category,
        priority: data.priority,
      })
      onClose()
    } catch {
      showToast('Failed to update goal')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-card border border-border/60 rounded-3xl p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Edit Goal</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Goal Name</label>
          <Input
            placeholder="e.g., Emergency Fund"
            value={data.title}
            onChange={(e) => setData({ ...data, title: e.target.value })}
            className="mt-1.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Target</label>
            <Input
              type="number"
              placeholder="Target amount"
              value={data.targetAmount}
              onChange={(e) => setData({ ...data, targetAmount: e.target.value })}
              className="mt-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Saved</label>
            <Input
              type="number"
              placeholder="Current saved"
              value={data.currentAmount}
              onChange={(e) => setData({ ...data, currentAmount: e.target.value })}
              className="mt-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Category</label>
          <Input
            placeholder="e.g., Travel, Emergency, Investment"
            value={data.category}
            onChange={(e) => setData({ ...data, category: e.target.value })}
            className="mt-1.5 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Target Date</label>
          <Input
            type="date"
            value={data.targetDate}
            onChange={(e) => setData({ ...data, targetDate: e.target.value })}
            className="mt-1.5 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase">Priority</label>
          <div className="flex gap-2 mt-1.5">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setData({ ...data, priority: p })}
                className={cn(
                  'flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all',
                  data.priority === p
                    ? p === 'high'
                      ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/30'
                      : p === 'medium'
                        ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} className="flex-1 text-sm">
            Save Changes
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1 text-sm">
            Cancel
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
