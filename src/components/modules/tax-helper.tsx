'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { FileText, ChevronLeft, ChevronRight, IndianRupee, Shield, Heart, BookOpen, Home } from 'lucide-react'

// Indian tax sections and their category mappings
const TAX_SECTIONS: Record<string, { section: string; description: string; limit: number; categories: string[] }> = {
  '80C': {
    section: '80C',
    description: 'Investments & Savings',
    limit: 150000,
    categories: ['investment', 'insurance', 'ppf', 'elss', 'nps'],
  },
  '80D': {
    section: '80D',
    description: 'Medical Insurance & Health',
    limit: 75000,
    categories: ['healthcare', 'medical', 'insurance', 'health', 'hospital', 'medicine'],
  },
  '80G': {
    section: '80G',
    description: 'Donations & Charity',
    limit: 0, // No upper limit (100% or 50% deduction)
    categories: ['donation', 'charity', 'ngo'],
  },
  '80E': {
    section: '80E',
    description: 'Education Loan Interest',
    limit: 0, // No limit
    categories: ['education'],
  },
  'HRA': {
    section: 'HRA',
    description: 'House Rent Allowance',
    limit: 0,
    categories: ['rent'],
  },
}

export function TaxHelper() {
  const [fyOffset, setFyOffset] = useState(0) // 0 = current FY

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const safeTx = Array.isArray(transactions) ? transactions : []

  // Calculate current Financial Year (April to March)
  const fyData = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth() // 0-indexed
    const currentYear = now.getFullYear()

    // FY starts in April: if month >= 3 (April), FY is currentYear-nextYear, else lastYear-currentYear
    let fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1
    fyStartYear += fyOffset

    const fyStart = new Date(fyStartYear, 3, 1) // April 1
    const fyEnd = new Date(fyStartYear + 1, 2, 31) // March 31

    const fyLabel = `FY ${fyStartYear}-${(fyStartYear + 1).toString().slice(2)}`

    return { fyStart, fyEnd, fyLabel, fyStartYear }
  }, [fyOffset])

  // Filter transactions within the financial year
  const fyTransactions = useMemo(() => {
    return safeTx.filter(tx => {
      if (tx.type !== 'expense') return false
      const d = new Date(tx.date)
      return d >= fyData.fyStart && d <= fyData.fyEnd
    })
  }, [safeTx, fyData])

  // Calculate tax deductions per section
  const sectionTotals = useMemo(() => {
    return Object.entries(TAX_SECTIONS).map(([key, section]) => {
      const matchingTx = fyTransactions.filter(tx =>
        section.categories.some(cat => tx.category.toLowerCase().includes(cat))
      )
      const total = matchingTx.reduce((sum, tx) => sum + tx.amount, 0)
      const deductible = section.limit > 0 ? Math.min(total, section.limit) : total

      return {
        ...section,
        key,
        total,
        deductible,
        transactionCount: matchingTx.length,
        utilized: section.limit > 0 ? Math.min(100, (total / section.limit) * 100) : 0,
      }
    }).filter(s => s.total > 0 || s.limit > 0)
  }, [fyTransactions])

  const totalDeductible = sectionTotals.reduce((sum, s) => sum + s.deductible, 0)
  const totalExpenses = fyTransactions.reduce((sum, tx) => sum + tx.amount, 0)

  const isCurrent = fyOffset === 0

  const getSectionIcon = (key: string) => {
    switch (key) {
      case '80C': return Shield
      case '80D': return Heart
      case '80G': return BookOpen
      case 'HRA': return Home
      default: return FileText
    }
  }

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Tax Helper</h1>
        <p className="text-xs text-muted-foreground">Track tax-deductible expenses (India)</p>
      </div>

      {/* FY Navigation */}
      <div className="flex items-center justify-between p-2 rounded-2xl bg-secondary/50 border border-border/30">
        <button onClick={() => setFyOffset(fyOffset - 1)} className="p-2 rounded-xl hover:bg-secondary">
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <p className="text-sm font-bold text-foreground">{fyData.fyLabel}</p>
        <button onClick={() => setFyOffset(fyOffset + 1)} disabled={isCurrent} className="p-2 rounded-xl hover:bg-secondary disabled:opacity-30">
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Summary */}
      <motion.div
        key={fyOffset}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20"
      >
        <div className="flex items-center gap-2 mb-2">
          <IndianRupee className="w-5 h-5 text-emerald-500" />
          <p className="text-xs font-bold text-muted-foreground uppercase">Total Deductions Claimed</p>
        </div>
        <p className="text-2xl font-bold text-foreground">{formatCurrency(totalDeductible)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          From {fyTransactions.length} expense transactions totaling {formatCurrency(totalExpenses)}
        </p>
      </motion.div>

      {/* Section-wise Breakdown */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Section-wise Deductions</p>

        {sectionTotals.length > 0 ? sectionTotals.map((section, i) => {
          const Icon = getSectionIcon(section.key)
          return (
            <motion.div
              key={section.key}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-4 rounded-2xl bg-card border border-border/50 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">Section {section.section}</p>
                    <p className="text-[10px] text-muted-foreground">{section.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{formatCurrency(section.deductible)}</p>
                  {section.limit > 0 && (
                    <p className="text-[9px] text-muted-foreground">of {formatCurrency(section.limit)} limit</p>
                  )}
                </div>
              </div>

              {section.limit > 0 && (
                <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", section.utilized >= 100 ? "bg-emerald-500" : "bg-primary/60")}
                    style={{ width: `${section.utilized}%` }}
                  />
                </div>
              )}

              <p className="text-[9px] text-muted-foreground">
                {section.transactionCount} transaction{section.transactionCount !== 1 ? 's' : ''} matched
              </p>
            </motion.div>
          )
        }) : (
          <div className="text-center py-8 rounded-2xl bg-secondary/20 border border-dashed border-border/50">
            <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">No deductible expenses found</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              Expenses in Healthcare, Education, Rent, and Donations are auto-detected
            </p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Tax deductions are auto-detected based on expense categories. Categories like Healthcare, Medical, Rent, Education, and Donations are automatically matched to relevant tax sections. This is for reference only — consult a CA for final filing.
        </p>
      </div>
    </div>
  )
}
