'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Budget, generateUUID } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CategorySelect } from '@/components/ui/category-select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus, Edit2, Trash2, AlertCircle, TrendingUp, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { BudgetManagementService } from '@/services/BudgetManagementService'

export function BudgetManager() {
  const [isAddingBudget, setIsAddingBudget] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    category: string
    limit: number
    period: 'weekly' | 'monthly' | 'yearly'
    alertThreshold: number
  }>({
    name: '',
    category: '',
    limit: 0,
    period: 'monthly',
    alertThreshold: 80,
  })

  // Database queries
  const allBudgets = useLiveQuery(() => db.budgets.toArray()) ?? []
  const allTransactions = useLiveQuery(() => db.transactions.toArray()) ?? []

  const safeBudgets = Array.isArray(allBudgets) ? allBudgets : []
  const safeTransactions = Array.isArray(allTransactions) ? allTransactions : []

  // Get budget statuses
  const budgetStatuses = React.useMemo(() => {
    return BudgetManagementService.getAllBudgetStatuses(safeBudgets, safeTransactions)
  }, [safeBudgets, safeTransactions])

  const alerts = budgetStatuses.filter(b => b.status === 'warning' || b.status === 'exceeded')

  const handleSave = async () => {
    if (!formData.name || !formData.category || formData.limit <= 0) {
      alert('Please fill all required fields')
      return
    }

    try {
      if (editingId) {
        await db.budgets.update(editingId, {
          name: formData.name,
          category: formData.category,
          limit: formData.limit,
          period: formData.period,
          alertThreshold: formData.alertThreshold,
        })
      } else {
        await db.budgets.add({
          id: generateUUID(),
          name: formData.name,
          category: formData.category,
          limit: formData.limit,
          period: formData.period,
          spent: 0,
          startDate: new Date().toISOString().split('T')[0],
          alertThreshold: formData.alertThreshold,
          isActive: true,
        })
      }

      setFormData({
        name: '',
        category: '',
        limit: 0,
        period: 'monthly',
        alertThreshold: 80,
      })
      setEditingId(null)
      setIsAddingBudget(false)
    } catch (err) {
      console.error('Error saving budget:', err)
    }
  }

  const handleEdit = (budget: Budget) => {
    setFormData({
      name: budget.name,
      category: budget.category,
      limit: budget.limit,
      period: budget.period,
      alertThreshold: budget.alertThreshold,
    })
    setEditingId(budget.id)
    setIsAddingBudget(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this budget?')) {
      await db.budgets.delete(id)
    }
  }

  const handleCancel = () => {
    setIsAddingBudget(false)
    setEditingId(null)
    setFormData({
      name: '',
      category: '',
      limit: 0,
      period: 'monthly',
      alertThreshold: 80,
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'under': return 'text-emerald-500'
      case 'warning': return 'text-amber-500'
      case 'exceeded': return 'text-red-500'
      default: return 'text-foreground'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'under': return 'bg-emerald-500/10'
      case 'warning': return 'bg-amber-500/10'
      case 'exceeded': return 'bg-red-500/10'
      default: return 'bg-secondary/50'
    }
  }

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Budget Management</h1>
        <p className="text-xs text-muted-foreground">Set and track spending limits by category.</p>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(alert => (
            <div
              key={alert.budgetId}
              className={cn(
                'p-4 rounded-2xl border-l-4',
                alert.status === 'warning'
                  ? 'bg-amber-500/10 border-amber-500'
                  : 'bg-red-500/10 border-red-500'
              )}
            >
              <div className="flex items-start gap-3">
                <AlertCircle className={cn(
                  'w-5 h-5 flex-shrink-0 mt-0.5',
                  alert.status === 'warning' ? 'text-amber-500' : 'text-red-500'
                )} />
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">{alert.budgetName}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {alert.status === 'exceeded'
                      ? `Exceeded by ${formatCurrency(alert.spent - alert.limit)}`
                      : `${alert.percentUsed}% of budget used`}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Form */}
      <AnimatePresence>
        {isAddingBudget && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-secondary/50 border border-border/50 rounded-3xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm">{editingId ? 'Edit Budget' : 'Add New Budget'}</h3>
              <button
                onClick={handleCancel}
                className="p-2 hover:bg-secondary rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Budget Name</label>
              <Input
                placeholder="e.g., Monthly Food"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Category</label>
                <CategorySelect
                  type="expense"
                  value={formData.category}
                  onChange={(val) => setFormData({ ...formData, category: val })}
                  placeholder="Select Category"
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Limit</label>
                <Input
                  type="number"
                  placeholder="5000"
                  value={formData.limit || ''}
                  onChange={(e) => setFormData({ ...formData, limit: parseFloat(e.target.value) || 0 })}
                  className="mt-2"
                  step="100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Period</label>
                <Select
                  value={formData.period}
                  onChange={(e) => setFormData({ ...formData, period: e.target.value as any })}
                  className="mt-2"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Alert %</label>
                <Input
                  type="number"
                  value={formData.alertThreshold}
                  onChange={(e) => setFormData({ ...formData, alertThreshold: parseInt(e.target.value) || 80 })}
                  className="mt-2"
                  min="0"
                  max="100"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                className="flex-1 h-10 rounded-full bg-foreground text-background font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
              >
                Save Budget
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 h-10 rounded-full border border-border/50 font-semibold text-xs uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Budgets List */}
      <div className="space-y-3">
        {budgetStatuses.length > 0 ? (
          budgetStatuses.map(status => (
            <motion.div
              key={status.budgetId}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'p-4 rounded-2xl border',
                getStatusBg(status.status),
                'border-border/50'
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-sm">{status.budgetName}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {status.category} • {status.daysLeftInPeriod} days left
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(safeBudgets.find(b => b.id === status.budgetId)!)}
                    className="p-2 hover:bg-secondary/50 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => handleDelete(status.budgetId)}
                    className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{formatCurrency(status.spent)} of {formatCurrency(status.limit)}</span>
                  <span className={cn('font-semibold', getStatusColor(status.status))}>
                    {status.percentUsed}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-secondary/50 overflow-hidden">
                  <motion.div
                    className={cn(
                      'h-full transition-all',
                      status.status === 'under' ? 'bg-emerald-500' :
                      status.status === 'warning' ? 'bg-amber-500' :
                      'bg-red-500'
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, status.percentUsed)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                {status.status !== 'under' && (
                  <p className="text-[10px] text-muted-foreground">
                    📊 Avg: {formatCurrency(status.averageDailySpend)}/day
                  </p>
                )}
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-10 bg-secondary/20 rounded-3xl border border-dashed border-border/50">
            <TrendingUp className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs font-bold text-muted-foreground">No budgets yet</p>
            <p className="text-[10px] text-muted-foreground/75 mt-1">Create your first budget to get started</p>
          </div>
        )}
      </div>

      {!isAddingBudget && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsAddingBudget(true)}
          className="w-full h-11 rounded-full bg-foreground text-background font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md"
        >
          <Plus className="w-4 h-4" />
          Add New Budget
        </motion.button>
      )}
    </div>
  )
}
