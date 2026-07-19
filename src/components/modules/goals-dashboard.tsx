'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Goal, generateUUID } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { Plus, Target, Zap, Trash2, X, Check, Flag } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useUndo } from '@/components/ui/undo-toast'

export function GoalsDashboard() {
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState({
    title: '', targetAmount: 0, targetDate: '', category: 'General'
  })
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: string; title?: string }>({ open: false })
  const { showUndo } = useUndo()

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
                  <button onClick={() => handleDelete(goal.id)} className="p-2 hover:bg-destructive/10 rounded-lg">
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </button>
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
                    </>
                  )}
                  {remaining <= 0 && (
                    <div className="w-full h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <p className="text-xs text-emerald-500 font-semibold">✓ Goal Achieved!</p>
                    </div>
                  )}
                </div>

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
