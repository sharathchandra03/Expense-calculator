'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Transaction } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Download, Calendar, TrendingUp, BarChart3, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { ReportingService } from '@/services/ReportingService'

export function FinancialReports() {
  const [reportType, setReportType] = useState('month')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

  const allTransactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const safeTransactions = Array.isArray(allTransactions) ? allTransactions : []

  const report = React.useMemo(() => {
    return ReportingService.generateReport(
      safeTransactions,
      startDate,
      endDate,
      reportType as any
    )
  }, [safeTransactions, startDate, endDate, reportType])

  const handleExportCSV = () => {
    const csv = ReportingService.generateCSV(report)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financial-report-${startDate}-to-${endDate}.csv`
    a.click()
  }

  const handleExportJSON = () => {
    const json = JSON.stringify(report, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financial-report-${startDate}-to-${endDate}.json`
    a.click()
  }

  return (
    <div className="flex flex-col space-y-5 pb-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Financial Reports</h1>
        <p className="text-xs text-muted-foreground">Generate and analyze financial summaries.</p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase">End Date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-2"
            />
          </div>
        </div>

        <Select
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
        >
          <option value="month">Monthly</option>
          <option value="quarter">Quarterly</option>
          <option value="year">Yearly</option>
          <option value="custom">Custom</option>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-emerald-950/20 to-emerald-900/10 border-emerald-500/30">
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Income</p>
            <p className="text-lg font-bold text-emerald-500 mt-2">{formatCurrency(report.totalIncome)}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-950/20 to-red-900/10 border-red-500/30">
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Expenses</p>
            <p className="text-lg font-bold text-red-500 mt-2">{formatCurrency(report.totalExpense)}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-950/20 to-blue-900/10 border-blue-500/30">
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Net Savings</p>
            <p className={cn('text-lg font-bold mt-2', report.netSavings > 0 ? 'text-emerald-500' : 'text-red-500')}>
              {formatCurrency(report.netSavings)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-950/20 to-purple-900/10 border-purple-500/30">
          <CardContent className="pt-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase">Savings Rate</p>
            <p className="text-lg font-bold text-purple-500 mt-2">{report.savingsRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Categories Breakdown */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold">Expense Categories</h3>
        <div className="space-y-2">
          {report.expenseByCategory.slice(0, 5).map((cat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="p-3 rounded-2xl bg-card border border-border/50"
            >
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-semibold">{cat.category}</p>
                <p className="text-xs text-muted-foreground">{cat.percentage.toFixed(1)}%</p>
              </div>
              <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${cat.percentage}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{formatCurrency(cat.amount)}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Top Transactions */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold">Top Expenses</h3>
        <div className="space-y-2">
          {report.topExpenses.map((tx, idx) => (
            <div
              key={idx}
              className="p-3 rounded-2xl bg-card border border-border/50 flex justify-between items-center"
            >
              <div>
                <p className="text-xs font-semibold">{tx.description}</p>
                <p className="text-[10px] text-muted-foreground">{tx.category} • {tx.date}</p>
              </div>
              <p className="text-xs font-bold">{formatCurrency(tx.amount)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Export Section */}
      <div className="space-y-2 pt-4 border-t border-border/50">
        <p className="text-xs font-semibold text-muted-foreground uppercase">Export Report</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleExportCSV}
            className="h-10 rounded-full bg-primary/10 text-primary font-semibold text-xs uppercase flex items-center justify-center gap-2 hover:bg-primary/20 transition-colors"
          >
            <Download className="w-4 h-4" />
            CSV Export
          </button>
          <button
            onClick={handleExportJSON}
            className="h-10 rounded-full bg-primary/10 text-primary font-semibold text-xs uppercase flex items-center justify-center gap-2 hover:bg-primary/20 transition-colors"
          >
            <Download className="w-4 h-4" />
            JSON Export
          </button>
        </div>
      </div>
    </div>
  )
}
