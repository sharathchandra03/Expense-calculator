'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, generateUUID } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus, TrendingUp, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { InvestmentTrackingService } from '@/services/InvestmentTrackingService'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useUndo } from '@/components/ui/undo-toast'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'

export function InvestmentTracker() {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '', type: 'stock' as const, quantity: 0, buyPrice: 0, currentPrice: 0
  })
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: string; name?: string }>({ open: false })
  const { showUndo } = useUndo()

  const investments = useLiveQuery(() => db.investments.toArray()) ?? []
  const safeInvestments = Array.isArray(investments) ? investments : []
  const analysis = React.useMemo(() => InvestmentTrackingService.analyzePortfolio(safeInvestments), [safeInvestments])

  const handleSave = async () => {
    if (!formData.name || formData.quantity <= 0) return
    
    const currentValue = formData.quantity * formData.currentPrice
    try {
      if (editingId) {
        await db.investments.update(editingId, { ...formData, currentValue })
      } else {
        await db.investments.add({
          id: generateUUID(),
          ...formData,
          currentValue,
          purchaseDate: new Date().toISOString().split('T')[0],
          accountId: 'default',
        })
      }
      setFormData({ name: '', type: 'stock', quantity: 0, buyPrice: 0, currentPrice: 0 })
      setEditingId(null)
      setIsAdding(false)
    } catch (err) {
      console.error('Error saving investment:', err)
    }
  }

  const handleDelete = async (id: string) => {
    const inv = safeInvestments.find(i => i.id === id)
    setDeleteConfirm({ open: true, id, name: inv?.name || 'this investment' })
  }

  const handleConfirmDelete = async () => {
    const id = deleteConfirm.id
    if (!id) return
    const inv = safeInvestments.find(i => i.id === id)
    await db.investments.delete(id)
    if (inv) {
      showUndo(`"${inv.name}" deleted`, async () => {
        await db.investments.add(inv)
      })
    }
    setDeleteConfirm({ open: false })
  }

  return (
    <div className="flex flex-col space-y-5 pb-6">
      <PageHeader title="Investment Portfolio" subtitle="Track your holdings, allocation and gains." />

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-purple-500/10">
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total Value</p>
            <p className="text-lg font-bold mt-2">{formatCurrency(analysis.totalCurrentValue)}</p>
          </CardContent>
        </Card>
        <Card className={analysis.totalGainLoss >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}>
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Gain/Loss</p>
            <p className={`text-lg font-bold mt-2 ${analysis.totalGainLoss >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {analysis.totalGainLoss >= 0 ? '+' : ''}{formatCurrency(analysis.totalGainLoss)}
            </p>
          </CardContent>
        </Card>
      </div>

      {safeInvestments.length === 0 ? (
        !isAdding && (
          <EmptyState
            icon={TrendingUp}
            title="No investments yet"
            description="Track stocks, crypto, funds and more to see your portfolio value and gains over time."
            color="primary"
            action={{ label: 'Add Investment', onClick: () => setIsAdding(true) }}
          />
        )
      ) : (
        <>
          {/* Allocations */}
          {analysis.allocations.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold">Asset Allocation</h3>
              {analysis.allocations.map((alloc, idx) => (
                <div key={idx} className="p-3 rounded-2xl bg-card border border-border/50">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-semibold capitalize">{alloc.type}</p>
                    <p className="text-xs text-muted-foreground">{alloc.percentage.toFixed(1)}%</p>
                  </div>
                  <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${alloc.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Investments List */}
          <div className="space-y-2">
            {safeInvestments.map(inv => {
              const gl = InvestmentTrackingService.calculateGainLoss(inv)
              return (
                <motion.div key={inv.id} className="p-3 rounded-2xl bg-card border border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{inv.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{inv.symbol ? `${inv.symbol} • ` : ''}{inv.quantity} units</p>
                      <p className="text-xs mt-1">{formatCurrency(inv.currentValue)}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className={`text-xs font-bold ${gl.isProfit ? 'text-emerald-500' : 'text-red-500'}`}>
                        {gl.gainLossPercentage >= 0 ? '+' : ''}{gl.gainLossPercentage}%
                      </p>
                      <button onClick={() => handleDelete(inv.id)} className="mt-1 text-muted-foreground hover:text-destructive transition-colors" aria-label={`Delete ${inv.name}`}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </>
      )}

      {!isAdding && safeInvestments.length > 0 && (
        <Button onClick={() => setIsAdding(true)} size="pill" className="w-full">
          <Plus className="w-4 h-4" /> Add Investment
        </Button>
      )}

      {isAdding && (
        <motion.div className="bg-secondary/50 p-4 rounded-3xl space-y-3">
          <Input placeholder="Name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
          <Input type="number" placeholder="Quantity" value={formData.quantity || ''} onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value) || 0})} />
          <Input type="number" placeholder="Buy Price" value={formData.buyPrice || ''} onChange={(e) => setFormData({...formData, buyPrice: parseFloat(e.target.value) || 0})} />
          <Input type="number" placeholder="Current Price" value={formData.currentPrice || ''} onChange={(e) => setFormData({...formData, currentPrice: parseFloat(e.target.value) || 0})} />
          <Select value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value as any})}>
            <option value="stock">Stock</option>
            <option value="crypto">Crypto</option>
            <option value="mutual_fund">Mutual Fund</option>
            <option value="etf">ETF</option>
          </Select>
          <div className="flex gap-2">
            <Button onClick={handleSave} className="flex-1">Save</Button>
            <Button variant="outline" onClick={() => setIsAdding(false)} className="flex-1">Cancel</Button>
          </div>
        </motion.div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Delete Investment?"
        message={`Are you sure you want to delete "${deleteConfirm.name}"? You can undo this action.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ open: false })}
      />
    </div>
  )
}
