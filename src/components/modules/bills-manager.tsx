'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Bill } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CategorySelect } from '@/components/ui/category-select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus, Edit2, Trash2, CheckCircle2, Calendar, Tag, AlertCircle, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

export function BillsManager() {
  const [isAddingBill, setIsAddingBill] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'unpaid' | 'paid'>('all')

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    amount: 0,
    dueDate: new Date().toISOString().split('T')[0],
    category: 'Utilities',
    isPaid: false,
    isRecurring: false,
  })

  // Dexie Queries
  const allBills = useLiveQuery(() => db.bills.toArray()) ?? []
  const safeBills = Array.isArray(allBills) ? allBills : []

  // Filter & Search
  const filteredBills = safeBills
    .filter(bill => {
      const matchSearch = bill.title.toLowerCase().includes(search.toLowerCase())
      const matchStatus = filterStatus === 'all' || 
                         (filterStatus === 'paid' ? bill.isPaid : !bill.isPaid)
      return matchSearch && matchStatus
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

  const unpaidBills = safeBills.filter(b => !b.isPaid)
  const totalUnpaid = unpaidBills.reduce((sum, b) => sum + b.amount, 0)

  // Handle Add/Update
  const handleSave = async () => {
    if (!formData.title || formData.amount <= 0) {
      alert('Please fill all required fields')
      return
    }

    try {
      if (editingId) {
        // Update existing bill
        await db.bills.update(editingId, {
          title: formData.title,
          amount: formData.amount,
          dueDate: formData.dueDate,
          category: formData.category,
          isPaid: formData.isPaid,
          isRecurring: formData.isRecurring,
        })
      } else {
        // Add new bill
        await db.bills.add({
          id: Math.random().toString(36).substring(2),
          title: formData.title,
          amount: formData.amount,
          dueDate: formData.dueDate,
          category: formData.category,
          isPaid: formData.isPaid,
          isRecurring: formData.isRecurring,
        })
      }

      // Reset form
      setFormData({
        title: '',
        amount: 0,
        dueDate: new Date().toISOString().split('T')[0],
        category: 'Utilities',
        isPaid: false,
        isRecurring: false,
      })
      setEditingId(null)
      setIsAddingBill(false)
    } catch (err) {
      console.error('Error saving bill:', err)
    }
  }

  // Handle Edit
  const handleEdit = (bill: Bill) => {
    setFormData({
      title: bill.title,
      amount: bill.amount,
      dueDate: bill.dueDate,
      category: bill.category,
      isPaid: bill.isPaid,
      isRecurring: bill.isRecurring,
    })
    setEditingId(bill.id)
    setIsAddingBill(true)
  }

  // Handle Delete
  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this bill?')) {
      try {
        await db.bills.delete(id)
      } catch (err) {
        console.error('Error deleting bill:', err)
      }
    }
  }

  // Handle Toggle Paid
  const handleTogglePaid = async (bill: Bill) => {
    try {
      await db.bills.update(bill.id, { isPaid: !bill.isPaid })
    } catch (err) {
      console.error('Error updating bill:', err)
    }
  }

  // Handle Cancel
  const handleCancel = () => {
    setIsAddingBill(false)
    setEditingId(null)
    setFormData({
      title: '',
      amount: 0,
      dueDate: new Date().toISOString().split('T')[0],
      category: 'Utilities',
      isPaid: false,
      isRecurring: false,
    })
  }

  const getCategoryIcon = (category: string) => {
    const icons: { [key: string]: string } = {
      'Utilities': '💡',
      'Subscription': '📱',
      'Insurance': '🛡️',
      'Rent': '🏠',
      'Healthcare': '🏥',
      'Transport': '🚗',
      'Other': '📋',
    }
    return icons[category] || '📋'
  }

  return (
    <div className="flex flex-col space-y-5 pb-28">
      {/* Module Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Bills & Obligations</h1>
        <p className="text-xs text-muted-foreground">Manage recurring and one-time payments.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-card to-secondary/20">
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Unpaid Bills</p>
            <p className="text-lg font-bold text-foreground mt-2">{unpaidBills.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-950/20 to-red-900/10 border-red-500/30">
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total Due</p>
            <p className="text-lg font-bold text-red-500 mt-2">{formatCurrency(totalUnpaid)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Input
            type="text"
            placeholder="Search bills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {(['all', 'unpaid', 'paid'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold uppercase transition-all',
                filterStatus === status
                  ? 'bg-foreground text-background'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              )}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Add/Edit Form */}
      <AnimatePresence>
        {isAddingBill && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-secondary/50 border border-border/50 rounded-3xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm">{editingId ? 'Edit Bill' : 'Add New Bill'}</h3>
              <button
                onClick={handleCancel}
                className="p-2 hover:bg-secondary rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Bill Title</label>
              <Input
                placeholder="e.g., Netflix Subscription"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Amount</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  className="mt-2"
                  step="0.01"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Due Date</label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="mt-2"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Category</label>
              <CategorySelect
                type="bill"
                value={formData.category}
                onChange={(val) => setFormData({ ...formData, category: val })}
                placeholder="Select Category"
              />
            </div>

            <div className="flex items-center gap-3 bg-card/50 p-3 rounded-2xl border border-border/50">
              <input
                type="checkbox"
                checked={formData.isRecurring}
                onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
                id="recurring"
                className="w-4 h-4 rounded cursor-pointer"
              />
              <label htmlFor="recurring" className="text-xs font-medium text-foreground cursor-pointer">
                This is a recurring bill
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                className="flex-1 h-10 rounded-full bg-foreground text-background font-semibold text-xs uppercase tracking-wider hover:opacity-90 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
              >
                Save Bill
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 h-10 rounded-full border border-border/50 bg-transparent font-semibold text-xs uppercase tracking-wider hover:bg-secondary/50 active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bills List */}
      <div className="space-y-3">
        {filteredBills.length > 0 ? (
          filteredBills.map((bill) => (
            <motion.div
              key={bill.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cn(
                'p-4 rounded-2xl border transition-all group',
                bill.isPaid
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : 'bg-card border-border/50 hover:border-primary/30'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="text-2xl">{getCategoryIcon(bill.category)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm font-bold truncate',
                      bill.isPaid && 'line-through text-muted-foreground'
                    )}>
                      {bill.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{bill.category}</span>
                      {bill.isRecurring && (
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          Recurring
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(bill.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <p className={cn(
                    'text-sm font-bold',
                    bill.isPaid ? 'text-emerald-500' : 'text-foreground'
                  )}>
                    {formatCurrency(bill.amount)}
                  </p>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleTogglePaid(bill)}
                      className={cn(
                        'p-2 rounded-lg transition-colors',
                        bill.isPaid
                          ? 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20'
                          : 'text-muted-foreground hover:bg-secondary'
                      )}
                      title={bill.isPaid ? 'Mark as unpaid' : 'Mark as paid'}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(bill)}
                      className="p-2 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
                      title="Edit bill"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(bill.id)}
                      className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Delete bill"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-10 bg-secondary/20 rounded-3xl border border-dashed border-border/50">
            <AlertCircle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs font-bold text-muted-foreground">No bills found</p>
            <p className="text-[10px] text-muted-foreground/75 mt-1">Add your first bill or adjust filters</p>
          </div>
        )}
      </div>

      {/* Add Bill Button */}
      {!isAddingBill && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsAddingBill(true)}
          className="w-full h-11 rounded-full bg-foreground text-background font-bold text-sm uppercase tracking-wider hover:opacity-90 active:scale-[0.97] transition-all flex items-center justify-center gap-2 shadow-md"
        >
          <Plus className="w-4 h-4" />
          Add New Bill
        </motion.button>
      )}
    </div>
  )
}
