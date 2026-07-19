'use client'

import React, { useState, useCallback } from 'react'
import { db, generateUUID, syncAccountToAsset } from '@/db/schema'
import { useLiveQuery } from 'dexie-react-hooks'
import { formatCurrency, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, Check, AlertCircle, X, ArrowRight, Download, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

interface ParsedRow {
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
  category: string
  isDuplicate: boolean
}

/**
 * Phase 15: CSV / Bank Statement Import
 * Upload CSV → map columns → preview → import
 * Supports common Indian bank formats
 */
export function CSVImport() {
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [rawData, setRawData] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<{ date: number; description: number; amount: number; type: number; category: number }>({ date: 0, description: 1, amount: 2, type: -1, category: -1 })
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [importCount, setImportCount] = useState(0)
  const [importing, setImporting] = useState(false)

  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []
  const existingTx = useLiveQuery(() => db.transactions.toArray()) ?? []
  const safeAccounts = Array.isArray(accounts) ? accounts : []
  const safeExisting = Array.isArray(existingTx) ? existingTx : []

  // Handle file upload - supports CSV and Excel (.xlsx, .xls)
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')

    if (isExcel) {
      // Parse Excel file
      const reader = new FileReader()
      reader.onload = (evt) => {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][]

        if (jsonData.length < 2) return

        const headerRow = jsonData[0].map(h => String(h || ''))
        const dataRows = jsonData.slice(1).map(row => (row || []).map(cell => String(cell || '')))
        setHeaders(headerRow)
        setRawData(dataRows)
        autoDetectMapping(headerRow)
        setStep('map')
      }
      reader.readAsArrayBuffer(file)
    } else {
      // Parse CSV file
      const reader = new FileReader()
      reader.onload = (evt) => {
        const text = evt.target?.result as string
        const lines = text.split('\n').filter(l => l.trim())
        if (lines.length < 2) return

        const parseCSVLine = (line: string): string[] => {
          const result: string[] = []
          let current = ''
          let inQuotes = false
          for (const char of line) {
            if (char === '"') { inQuotes = !inQuotes; continue }
            if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
            current += char
          }
          result.push(current.trim())
          return result
        }

        const parsed = lines.map(l => parseCSVLine(l))
        setHeaders(parsed[0])
        setRawData(parsed.slice(1))
        autoDetectMapping(parsed[0])
        setStep('map')
      }
      reader.readAsText(file)
    }
  }, [])

  // Auto-detect column mapping from headers
  const autoDetectMapping = (headerRow: string[]) => {
    const h = headerRow.map(col => col.toLowerCase())
    const isExpenseAppFormat = h.some(c => c.includes('income/expense')) || (h.includes('note') && h.includes('inr'))

    if (isExpenseAppFormat) {
      const dateIdx = h.findIndex(c => c === 'date')
      const noteIdx = h.findIndex(c => c === 'note')
      const amtIdx = h.findIndex(c => c === 'inr' || c === 'amount')
      const typeIdx = h.findIndex(c => c.includes('income/expense'))
      const catIdx = h.findIndex(c => c === 'category')
      setMapping({ date: dateIdx >= 0 ? dateIdx : 0, description: noteIdx >= 0 ? noteIdx : 1, amount: amtIdx >= 0 ? amtIdx : 5, type: typeIdx >= 0 ? typeIdx : -1, category: catIdx >= 0 ? catIdx : -1 })
    } else {
      const dateIdx = h.findIndex(c => c.includes('date') || c.includes('txn') || c.includes('value'))
      const descIdx = h.findIndex(c => c.includes('desc') || c.includes('narration') || c.includes('particular') || c.includes('remark') || c.includes('note'))
      const amtIdx = h.findIndex(c => c.includes('amount') || c.includes('debit') || c.includes('withdrawal') || c.includes('inr'))
      const typeIdx = h.findIndex(c => c.includes('type') || c.includes('cr/dr') || c.includes('credit') || c.includes('income/expense'))
      const catIdx = h.findIndex(c => c.includes('category'))
      setMapping({ date: dateIdx >= 0 ? dateIdx : 0, description: descIdx >= 0 ? descIdx : 1, amount: amtIdx >= 0 ? amtIdx : 2, type: typeIdx, category: catIdx >= 0 ? catIdx : -1 })
    }
  }

  // Export transactions as CSV
  const handleExportCSV = useCallback(async () => {
    const allTx = await db.transactions.toArray()
    const accounts = await db.accounts.toArray()
    const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Account']
    const rows = allTx.map(tx => {
      const acc = accounts.find(a => a.id === tx.accountId)
      return [tx.date, tx.type, tx.category, tx.description, tx.amount.toString(), acc?.name || '']
    })
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => c.includes(',') ? `"${c}"` : c).join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PennyFlow_Export_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  // Export transactions as Excel
  const handleExportExcel = useCallback(async () => {
    const allTx = await db.transactions.toArray()
    const accounts = await db.accounts.toArray()
    const data = allTx.map(tx => {
      const acc = accounts.find(a => a.id === tx.accountId)
      return { Date: tx.date, Type: tx.type, Category: tx.category, Description: tx.description, Amount: tx.amount, Account: acc?.name || '' }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
    XLSX.writeFile(wb, `PennyFlow_Export_${new Date().toISOString().split('T')[0]}.xlsx`)
  }, [])

  // Parse rows with mapping
  const handleParsePreview = useCallback(() => {
    const rows: ParsedRow[] = rawData.map(row => {
      const dateRaw = row[mapping.date] || ''
      const desc = row[mapping.description] || ''
      const amtRaw = row[mapping.amount] || '0'

      // Parse date (try multiple formats)
      let date = ''
      const dateClean = dateRaw.replace(/['"]/g, '').trim()
      
      // Try DD/MM/YYYY HH:MM:SS format (expense app exports)
      const dtParts = dateClean.split(' ')
      const datePart = dtParts[0]
      const slashParts = datePart.split('/')
      if (slashParts.length === 3 && slashParts[2].length === 4) {
        const [day, month, year] = slashParts
        date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      }
      
      if (!date) {
        const d = new Date(dateClean)
        if (!isNaN(d.getTime())) {
          date = d.toISOString().split('T')[0]
        } else {
          // Try DD/MM/YYYY or DD-MM-YYYY
          const parts = dateClean.split(/[\/\-.]/)
          if (parts.length === 3) {
            const [day, month, year] = parts
            const yearFull = year.length === 2 ? `20${year}` : year
            const parsed = new Date(`${yearFull}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
            if (!isNaN(parsed.getTime())) date = parsed.toISOString().split('T')[0]
          }
        }
      }

      // Parse amount
      const amount = Math.abs(parseFloat(amtRaw.replace(/[₹,$,\s]/g, '')) || 0)

      // Determine type
      let type: 'expense' | 'income' = 'expense'
      if (mapping.type >= 0) {
        const typeVal = (row[mapping.type] || '').toLowerCase()
        if (typeVal.includes('cr') || typeVal.includes('credit') || typeVal === 'income') type = 'income'
        if (typeVal === 'expense' || typeVal.includes('dr') || typeVal.includes('debit')) type = 'expense'
      } else if (amtRaw.startsWith('+') || amtRaw.includes('CR')) {
        type = 'income'
      }

      // Auto-categorize — use CSV category if mapped, otherwise detect from description
      let category = 'Other'
      if (mapping.category >= 0 && row[mapping.category]) {
        // Clean emoji prefix from category (e.g., "🍜 Food" → "Food")
        category = row[mapping.category].replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim() || 'Other'
      } else {
        category = autoDetectCategory(desc)
      }

      // Duplicate detection
      const isDuplicate = safeExisting.some(tx =>
        tx.date === date && tx.amount === amount && tx.description.toLowerCase() === desc.toLowerCase()
      )

      return { date, description: desc, amount, type, category, isDuplicate }
    }).filter(r => r.date && r.amount > 0)

    setParsedRows(rows)
    setStep('preview')
  }, [rawData, mapping, safeExisting])

  // Import to DB
  const handleImport = useCallback(async () => {
    setImporting(true)
    const toImport = parsedRows.filter(r => !r.isDuplicate)
    let defaultAccount = safeAccounts.find(a => a.type === 'bank') || safeAccounts[0]

    try {
      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        // Create a default account if none exists
        if (!defaultAccount) {
          const newAccId = generateUUID()
          await db.accounts.add({
            id: newAccId,
            name: 'Imported Account',
            type: 'bank',
            balance: 0,
          })
          defaultAccount = { id: newAccId, name: 'Imported Account', type: 'bank', balance: 0 } as any
        }

        for (const row of toImport) {
          await db.transactions.add({
            id: generateUUID(),
            date: row.date,
            type: row.type,
            category: row.category,
            amount: row.amount,
            accountId: defaultAccount?.id || '',
            description: row.description,
            isRecurring: false,
          })
        }

        // Update account balance with net change
        if (defaultAccount) {
          const netChange = toImport.reduce((sum, r) => sum + (r.type === 'income' ? r.amount : -r.amount), 0)
          const currentBalance = (await db.accounts.get(defaultAccount.id))?.balance || 0
          const newBalance = currentBalance + netChange
          await db.accounts.update(defaultAccount.id, { balance: newBalance })
          await syncAccountToAsset(defaultAccount.name, newBalance)
        }

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'system',
          description: `Imported ${toImport.length} transactions from CSV`,
        })
      })

      setImportCount(toImport.length)
      setStep('done')
    } catch (err) {
      console.error('CSV import failed:', err)
    } finally {
      setImporting(false)
    }
  }, [parsedRows, safeAccounts])

  const reset = () => {
    setStep('upload')
    setRawData([])
    setHeaders([])
    setParsedRows([])
    setImportCount(0)
  }

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Import & Export</h1>
        <p className="text-xs text-muted-foreground">Import transactions from CSV or Excel, or export your data</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {['Upload', 'Map', 'Preview', 'Done'].map((label, i) => {
          const stepIdx = ['upload', 'map', 'preview', 'done'].indexOf(step)
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold",
                i <= stepIdx ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              )}>
                {i < stepIdx ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className={cn("text-[10px] font-medium", i <= stepIdx ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              {i < 3 && <ArrowRight className="w-3 h-3 text-muted-foreground/40" />}
            </div>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        {step === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <label className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-border/60 bg-secondary/20 hover:bg-secondary/30 cursor-pointer transition-colors">
              <Upload className="w-8 h-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-semibold text-foreground">Drop CSV or Excel file to import</p>
              <p className="text-[10px] text-muted-foreground mt-1">Supports .csv, .xlsx, .xls files</p>
              <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
            </label>

            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Supported Formats</p>
              <p className="text-[10px] text-muted-foreground">• Excel files (.xlsx, .xls)</p>
              <p className="text-[10px] text-muted-foreground">• CSV files (.csv) from expense apps or bank statements</p>
              <p className="text-[10px] text-muted-foreground">• Any file with Date, Description, Amount columns</p>
            </div>

            {/* Export section */}
            <div className="pt-2 border-t border-border/30">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Export Your Data</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleExportCSV} className="flex items-center justify-center gap-2 h-10 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors text-[12px] font-semibold text-foreground">
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <button onClick={handleExportExcel} className="flex items-center justify-center gap-2 h-10 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors text-[12px] font-semibold text-foreground">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export Excel
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'map' && (
          <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <p className="text-xs font-semibold text-foreground">Map your CSV columns ({rawData.length} rows detected)</p>

            <div className="space-y-3">
              {(['date', 'description', 'amount'] as const).map(field => (
                <div key={field} className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground capitalize w-24">{field}</span>
                  <select
                    value={mapping[field]}
                    onChange={(e) => setMapping({ ...mapping, [field]: parseInt(e.target.value) })}
                    className="flex-1 h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground focus:outline-none"
                  >
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview first 3 rows */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-1">
              <p className="text-[9px] font-bold text-muted-foreground uppercase">Sample Data</p>
              {rawData.slice(0, 3).map((row, i) => (
                <p key={i} className="text-[10px] text-muted-foreground truncate">
                  {row[mapping.date]} | {row[mapping.description]} | {row[mapping.amount]}
                </p>
              ))}
            </div>

            <button onClick={handleParsePreview} className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90">
              Parse & Preview
            </button>
          </motion.div>
        )}

        {step === 'preview' && (
          <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">{parsedRows.length} transactions parsed</p>
              <p className="text-[10px] text-muted-foreground">
                {parsedRows.filter(r => r.isDuplicate).length} duplicates skipped
              </p>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-xl border border-border/30 p-2">
              {parsedRows.slice(0, 20).map((row, i) => (
                <div key={i} className={cn(
                  "flex items-center justify-between p-2 rounded-lg text-[10px]",
                  row.isDuplicate ? "bg-destructive/5 opacity-50 line-through" : "bg-secondary/30"
                )}>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground truncate block">{row.description}</span>
                    <span className="text-muted-foreground">{row.date} • {row.category}</span>
                  </div>
                  <span className={cn("font-bold ml-2", row.type === 'income' ? "text-emerald-500" : "text-foreground")}>
                    {row.type === 'income' ? '+' : '-'}{formatCurrency(row.amount)}
                  </span>
                </div>
              ))}
              {parsedRows.length > 20 && <p className="text-[10px] text-muted-foreground text-center py-2">...and {parsedRows.length - 20} more</p>}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep('map')} className="flex-1 h-10 rounded-xl bg-secondary text-foreground text-sm font-bold">Back</button>
              <button onClick={handleImport} disabled={importing} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40">
                {importing ? 'Importing...' : `Import ${parsedRows.filter(r => !r.isDuplicate).length} Records`}
              </button>
            </div>
          </motion.div>
        )}

        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-8 space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-foreground">Import Complete</p>
            <p className="text-xs text-muted-foreground">{importCount} transactions added to your ledger</p>
            <button onClick={reset} className="px-4 py-2 rounded-xl bg-secondary text-sm font-semibold text-foreground">Import More</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Auto-categorize based on description keywords
function autoDetectCategory(desc: string): string {
  const d = desc.toLowerCase()
  if (d.includes('salary') || d.includes('payroll')) return 'Salary'
  if (d.includes('swiggy') || d.includes('zomato') || d.includes('food') || d.includes('restaurant') || d.includes('cafe')) return 'Food'
  if (d.includes('uber') || d.includes('ola') || d.includes('rapido') || d.includes('petrol') || d.includes('fuel') || d.includes('metro')) return 'Transport'
  if (d.includes('amazon') || d.includes('flipkart') || d.includes('myntra') || d.includes('shopping')) return 'Shopping'
  if (d.includes('netflix') || d.includes('spotify') || d.includes('hotstar') || d.includes('prime')) return 'Subscriptions'
  if (d.includes('electric') || d.includes('water') || d.includes('gas') || d.includes('broadband') || d.includes('wifi')) return 'Utilities'
  if (d.includes('rent') || d.includes('landlord')) return 'Rent'
  if (d.includes('hospital') || d.includes('doctor') || d.includes('pharmacy') || d.includes('medical')) return 'Healthcare'
  if (d.includes('school') || d.includes('college') || d.includes('course') || d.includes('tuition')) return 'Education'
  if (d.includes('interest') || d.includes('dividend') || d.includes('mutual fund')) return 'Investment'
  return 'Other'
}
