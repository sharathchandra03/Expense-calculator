'use client'

import React, { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Asset, Lending, generateUUID, syncAssetToAccount, syncAccountToAsset } from '@/db/schema'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, TrendingUp, Handshake, Shield, Sparkles, CheckCircle, ChevronRight, Calculator, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

export function AssetsTracker() {
  const [subTab, setSubTab] = useState<'assets' | 'lending'>('assets')
  const [mounted, setMounted] = useState(false)
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [newValuation, setNewValuation] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  // Dexie Queries
  const assets = useLiveQuery(() => db.assets.toArray()) || []
  const lending = useLiveQuery(() => db.lending.toArray()) || []
  const accounts = useLiveQuery(() => db.accounts.toArray()) || []

  // Sums
  const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0)
  
  const totalLent = lending
    .filter(l => l.type === 'lent' && l.status === 'active')
    .reduce((sum, l) => sum + l.amount, 0)

  const totalBorrowed = lending
    .filter(l => l.type === 'borrowed' && l.status === 'active')
    .reduce((sum, l) => sum + l.amount, 0)

  const netPosition = totalAssets + totalLent - totalBorrowed

  // Recharts Data Aggregator (historical net asset valuations over time)
  // Let's gather the dates and sum values of assets on those dates
  const getChartData = () => {
    const dates = new Set<string>()
    assets.forEach((a) => {
      a.valuationHistory.forEach((v) => dates.add(v.date))
    })

    const sortedDates = Array.from(dates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())

    return sortedDates.map((dateStr) => {
      let total = 0
      assets.forEach((a) => {
        // Find the valuation on or closest before this date
        const match = a.valuationHistory.find((v) => v.date === dateStr)
        if (match) {
          total += match.value
        } else {
          // Fallback to previous closest valuation or initial balance
          const pastHistory = a.valuationHistory
            .filter((v) => new Date(v.date) < new Date(dateStr))
            .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())
          total += pastHistory[0] ? pastHistory[0].value : a.balance
        }
      })

      // Convert date format for clean labels
      const d = new Date(dateStr + 'T00:00:00')
      const formattedDate = d.toLocaleString('en-US', { month: 'short', day: 'numeric' })

      return {
        date: formattedDate,
        amount: total,
      }
    })
  }

  // Update Asset Valuation
  const handleUpdateValuation = async (asset: Asset) => {
    if (!newValuation || isNaN(Number(newValuation))) return
    const val = parseFloat(newValuation)
    const todayStr = new Date().toISOString().split('T')[0]

    try {
      await db.transaction('rw', [db.assets, db.systemLogs], async () => {
        const updatedHistory = [...asset.valuationHistory]
        const existingIndex = updatedHistory.findIndex((v) => v.date === todayStr)

        if (existingIndex >= 0) {
          updatedHistory[existingIndex].value = val
        } else {
          updatedHistory.push({ date: todayStr, value: val })
        }

        await db.assets.update(asset.id, {
          balance: val,
          valuationHistory: updatedHistory,
        })

        await syncAssetToAccount(asset.name, val)

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'asset',
          description: `Updated valuation for "${asset.name}" to ${formatCurrency(val)}`,
        })
      })

      setEditingAssetId(null)
      setNewValuation('')
    } catch (err) {
      console.error('Failed to update asset value:', err)
    }
  }

  // Calculate accrued interest for lending entries
  // Accrues since createdAt up to today
  const calculateAccruedInterest = (item: Lending) => {
    if (item.interestType === 'none' || item.interestRate === 0) return 0

    const dateStart = new Date(item.createdAt)
    const dateEnd = new Date()
    const diffTime = Math.abs(dateEnd.getTime() - dateStart.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    const yearsElapsed = diffDays / 365.25

    if (item.interestType === 'simple') {
      return item.amount * (item.interestRate / 100) * yearsElapsed
    } else if (item.interestType === 'compound') {
      // Monthly compounding
      const monthsElapsed = diffDays / 30.43
      return item.amount * (Math.pow(1 + (item.interestRate / 100) / 12, monthsElapsed) - 1)
    }
    return 0
  }

  // Handle Debt Settlement (Mark as paid)
  const handleSettleDebt = async (item: Lending) => {
    try {
      const cashAccount = accounts.find(a => a.type === 'cash') || accounts[0]
      const accrued = calculateAccruedInterest(item)
      const totalAmount = item.amount + accrued
      
      // If we lent money, we receive it back (+Cash). If we borrowed, we pay it back (-Cash).
      const delta = item.type === 'lent' ? totalAmount : -totalAmount

      await db.transaction('rw', [db.lending, db.accounts, db.systemLogs], async () => {
        await db.lending.update(item.id, {
          status: 'paid',
        })

        if (cashAccount) {
          const newBal = cashAccount.balance + delta
          await db.accounts.update(cashAccount.id, {
            balance: newBal,
          })
          await syncAccountToAsset(cashAccount.name, newBal)
        }

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'lending',
          description: `Settled debt ledger: Received repayment of ${formatCurrency(totalAmount)} from ${item.contactName} (including interest)`,
          amount: delta
        })
      })
    } catch (err) {
      console.error('Failed to settle debt:', err)
    }
  }

  // Delete lending entry
  const handleDeleteLend = async (id: string) => {
    try {
      await db.transaction('rw', [db.lending, db.systemLogs], async () => {
        await db.lending.delete(id)
        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'system',
          description: `Removed lending record from ledger.`
        })
      })
    } catch (err) {
      console.error('Failed to delete lending entry:', err)
    }
  }

  return (
    <div className="flex flex-col space-y-5 pb-28">
      {/* Module Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Assets & Lending</h1>
        <p className="text-xs text-muted-foreground">Manage your properties, investments, and loan ledger.</p>
      </div>

      {/* Switch Sub-tabs */}
      <div className="flex p-1 bg-secondary rounded-2xl w-full max-w-xs mx-auto">
        <button
          onClick={() => setSubTab('assets')}
          className={cn(
            "flex-1 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-center transition-all",
            subTab === 'assets'
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Assets & Equity
        </button>
        <button
          onClick={() => setSubTab('lending')}
          className={cn(
            "flex-1 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-center transition-all",
            subTab === 'lending'
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Lending Ledger
        </button>
      </div>

      {subTab === 'assets' ? (
        <div className="space-y-5">
          {/* Valuation History Line Chart */}
          {mounted && getChartData().length > 1 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <Card>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <CardDescription className="text-[10px] tracking-wider uppercase font-semibold text-muted-foreground">
                      Valuation History
                    </CardDescription>
                    <CardTitle className="text-sm font-semibold mt-1">Portfolio Valuation Trend</CardTitle>
                  </div>
                  <TrendingUp className="h-4.5 w-4.5 text-primary" />
                </div>

                <div className="h-44 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getChartData()} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <XAxis 
                        dataKey="date" 
                        stroke="#888888" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false} 
                      />
                      <YAxis 
                        stroke="#888888" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => `$${value}`} 
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(15, 15, 17, 0.9)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '12px',
                          fontSize: '11px',
                          color: '#fff'
                        }}
                        formatter={(value) => [`$${value}`, 'Valuation']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="amount" 
                        stroke="var(--primary)" 
                        strokeWidth={2.5} 
                        dot={{ r: 3 }} 
                        activeDot={{ r: 6 }} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Aggregated Totals */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Asset Equity</p>
              <h4 className="text-base font-bold text-foreground mt-0.5">{formatCurrency(totalAssets)}</h4>
            </Card>
            <Card>
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Net Position</p>
              <h4 className="text-base font-bold text-foreground mt-0.5">{formatCurrency(netPosition)}</h4>
            </Card>
          </div>

          {/* Assets Inventory List */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
              Registered Assets
            </h3>

            {assets.length > 0 ? (
              assets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex flex-col p-4 rounded-2xl bg-card border border-border/50 shadow-sm space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-primary">
                        <Shield className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">{asset.name}</p>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{asset.type}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-bold text-foreground">{formatCurrency(asset.balance)}</p>
                      <button
                        onClick={() => {
                          setEditingAssetId(editingAssetId === asset.id ? null : asset.id)
                          setNewValuation(asset.balance.toString())
                        }}
                        className="text-[10px] text-primary font-semibold hover:underline mt-0.5"
                      >
                        Adjust Value
                      </button>
                    </div>
                  </div>

                  {editingAssetId === asset.id && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-center space-x-2 pt-2 border-t border-border/30"
                    >
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="New balance"
                        value={newValuation}
                        onChange={(e) => setNewValuation(e.target.value)}
                        className="h-9 text-xs rounded-xl"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleUpdateValuation(asset)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingAssetId(null)}
                      >
                        Cancel
                      </Button>
                    </motion.div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 bg-secondary/20 rounded-3xl border border-dashed border-border/60">
                <Shield className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-xs font-semibold text-muted-foreground">No assets added</p>
                <p className="text-[10px] text-muted-foreground/80 mt-1">Tap the central + button to log a property.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Lending & Interest Ledger */
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Lent Out</p>
              <h4 className="text-base font-bold text-emerald-500 mt-0.5">{formatCurrency(totalLent)}</h4>
            </Card>
            <Card>
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Borrowed</p>
              <h4 className="text-base font-bold text-rose-500 mt-0.5">{formatCurrency(totalBorrowed)}</h4>
            </Card>
          </div>

          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
              Active Lending Records
            </h3>

            {lending.filter(l => l.status === 'active').length > 0 ? (
              lending
                .filter(l => l.status === 'active')
                .map((item) => {
                  const accrued = calculateAccruedInterest(item)
                  const totalExpected = item.amount + accrued
                  
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col p-4 rounded-2xl bg-card border border-border/50 shadow-sm space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-3">
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center",
                            item.type === 'lent' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                          )}>
                            <Handshake className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <p className="text-xs font-bold text-foreground">{item.contactName}</p>
                              <span className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider",
                                item.type === 'lent' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                              )}>
                                {item.type === 'lent' ? 'Lent' : 'Borrowed'}
                              </span>
                            </div>
                            <p className="text-[9px] text-muted-foreground">
                              Opened {item.createdAt.split('-')[2]} {new Date(item.createdAt).toLocaleString('en-US', {month: 'short'})}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-bold text-foreground">{formatCurrency(item.amount)}</p>
                          {item.interestType !== 'none' && (
                            <p className="text-[9px] text-muted-foreground">
                              Rate: {item.interestRate}% ({item.interestType})
                            </p>
                          )}
                        </div>
                      </div>

                      {item.interestType !== 'none' && (
                        <div className="flex justify-between items-center bg-secondary/40 p-2.5 rounded-xl border border-border/30 text-[10px]">
                          <div className="flex items-center text-muted-foreground font-medium">
                            <Calculator className="h-3.5 w-3.5 mr-1" />
                            <span>Accrued Interest:</span>
                          </div>
                          <span className="font-bold text-foreground">{formatCurrency(accrued)}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-xs pt-1">
                        <div className="text-[10px] text-muted-foreground/80 font-medium truncate max-w-[60%]">
                          {item.description || 'No description provided'}
                        </div>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => handleSettleDebt(item)}
                            className="inline-flex items-center space-x-1 px-3 py-1 rounded-xl bg-primary text-primary-foreground font-semibold text-[10px] hover:opacity-90 transition-opacity"
                          >
                            <CheckCircle className="h-3 w-3" />
                            <span>Settle</span>
                          </button>
                          <button
                            onClick={() => handleDeleteLend(item.id)}
                            className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
            ) : (
              <div className="text-center py-8 bg-secondary/20 rounded-3xl border border-dashed border-border/60">
                <Handshake className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-xs font-semibold text-muted-foreground">No active debts or lending logs</p>
                <p className="text-[10px] text-muted-foreground/80 mt-1">Tap the central + button to record a loan entry.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
