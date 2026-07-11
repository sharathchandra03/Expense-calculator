'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ExpenseTemplate, generateUUID, syncAccountToAsset } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Sparkles, X, Plus, Trash2, Edit2, Check, Zap } from 'lucide-react'
import { NLPParserService, ParsedTransaction } from '@/services/NLPParserService'
import { SmartDefaultsService } from '@/services/SmartDefaultsService'
import { useUndo } from '@/components/ui/undo-toast'

/**
 * Phase 0.2 + 0.7: Smart Quick-Add with Templates and NLP
 * - Template pills for 1-tap logging
 * - Natural language text input ("food 200 cash")
 * - Voice input (browser Speech API)
 * - Long-press to edit/delete templates
 */
// Phase 17: Starter Pack — suggested templates for new users
const STARTER_TEMPLATES = [
  { name: 'Coffee', amount: 200, category: 'Food' },
  { name: 'Auto/Cab', amount: 150, category: 'Transport' },
  { name: 'Groceries', amount: 500, category: 'Food' },
  { name: 'Petrol', amount: 1000, category: 'Transport' },
  { name: 'Rent', amount: 15000, category: 'Rent' },
  { name: 'Netflix', amount: 649, category: 'Subscriptions' },
]

export function SmartQuickAdd() {
  const [textInput, setTextInput] = useState('')
  const [parsed, setParsed] = useState<ParsedTransaction | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ExpenseTemplate | null>(null)
  const [longPressId, setLongPressId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const recognitionRef = useRef<any>(null)
  const { showUndo } = useUndo()

  // DB queries
  const templates = useLiveQuery(() => db.templates.toArray()) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []

  const safeTemplates = (Array.isArray(templates) ? templates : [])
    .sort((a, b) => b.usageCount - a.usageCount)
  const safeAccounts = Array.isArray(accounts) ? accounts : []

  // Parse text input in real-time
  useEffect(() => {
    if (textInput.trim()) {
      const result = NLPParserService.parse(textInput)
      setParsed(result)
    } else {
      setParsed(null)
    }
  }, [textInput])

  // Get default account
  const getDefaultAccount = useCallback(() => {
    const lastId = SmartDefaultsService.getLastUsedAccount()
    if (lastId) {
      const found = safeAccounts.find(a => a.id === lastId)
      if (found) return found
    }
    return safeAccounts.find(a => a.type === 'bank') || safeAccounts.find(a => a.type === 'cash') || safeAccounts[0]
  }, [safeAccounts])

  // Resolve account from hint or default
  const resolveAccount = useCallback((hint: string | null) => {
    if (hint) {
      const match = safeAccounts.find(a => a.type === hint || a.name.toLowerCase().includes(hint))
      if (match) return match
    }
    return getDefaultAccount()
  }, [safeAccounts, getDefaultAccount])

  // === TEMPLATE: Single-tap to log expense ===
  const handleTemplateTap = useCallback(async (template: ExpenseTemplate) => {
    if (longPressId) return // Don't trigger tap if long-press active

    const account = resolveAccount(null)
    if (!account) return

    const todayStr = new Date().toISOString().split('T')[0]
    const txId = generateUUID()

    try {
      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.templates, db.systemLogs], async () => {
        await db.transactions.add({
          id: txId,
          date: todayStr,
          type: template.type,
          category: template.category,
          amount: template.amount,
          accountId: account.id,
          description: template.name,
          isRecurring: false,
        })

        // Deduct/add balance
        const delta = template.type === 'expense' ? -template.amount : template.amount
        const newBalance = account.balance + delta
        await db.accounts.update(account.id, { balance: newBalance })
        await syncAccountToAsset(account.name, newBalance)

        // Increment usage
        await db.templates.update(template.id, { usageCount: template.usageCount + 1 })

        // Remember account
        SmartDefaultsService.setLastUsedAccount(account.id)

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'transaction',
          description: `Template: ${template.name} (${formatCurrency(template.amount)})`,
          amount: delta,
        })
      })

      // Show undo
      showUndo(`${template.name} ${formatCurrency(template.amount)} logged`, async () => {
        await db.transaction('rw', [db.transactions, db.accounts, db.assets], async () => {
          await db.transactions.delete(txId)
          const acc = await db.accounts.get(account.id)
          if (acc) {
            const revert = template.type === 'expense' ? acc.balance + template.amount : acc.balance - template.amount
            await db.accounts.update(account.id, { balance: revert })
            await syncAccountToAsset(account.name, revert)
          }
        })
      })
    } catch (err) {
      console.error('Template transaction failed:', err)
    }
  }, [longPressId, resolveAccount, showUndo])

  // === TEMPLATE: Long-press to edit/delete ===
  const handleLongPressStart = useCallback((templateId: string) => {
    longPressTimer.current = setTimeout(() => {
      setLongPressId(templateId)
    }, 500)
  }, [])

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleDeleteTemplate = useCallback(async (id: string) => {
    await db.templates.delete(id)
    setLongPressId(null)
  }, [])

  // === NLP: Save parsed transaction ===
  const handleNLPSave = useCallback(async () => {
    if (!parsed || !NLPParserService.isComplete(parsed)) return

    setSaving(true)
    const account = resolveAccount(parsed.accountHint)
    if (!account) { setSaving(false); return }

    const todayStr = new Date().toISOString().split('T')[0]
    const txId = generateUUID()
    const amount = parsed.amount!

    try {
      await db.transaction('rw', [db.transactions, db.accounts, db.assets, db.systemLogs], async () => {
        await db.transactions.add({
          id: txId,
          date: todayStr,
          type: parsed.type,
          category: parsed.category!,
          amount,
          accountId: account.id,
          description: parsed.category!,
          isRecurring: false,
        })

        const delta = parsed.type === 'expense' ? -amount : amount
        const newBalance = account.balance + delta
        await db.accounts.update(account.id, { balance: newBalance })
        await syncAccountToAsset(account.name, newBalance)

        SmartDefaultsService.setLastUsedAccount(account.id)

        await db.systemLogs.add({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          type: 'transaction',
          description: `Quick-add: ${parsed.category} ${formatCurrency(amount)}`,
          amount: delta,
        })
      })

      showUndo(`${parsed.category} ${formatCurrency(amount)} logged`, async () => {
        await db.transaction('rw', [db.transactions, db.accounts, db.assets], async () => {
          await db.transactions.delete(txId)
          const acc = await db.accounts.get(account.id)
          if (acc) {
            const revert = parsed.type === 'expense' ? acc.balance + amount : acc.balance - amount
            await db.accounts.update(account.id, { balance: revert })
            await syncAccountToAsset(account.name, revert)
          }
        })
      })

      setTextInput('')
      setParsed(null)
    } catch (err) {
      console.error('NLP save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [parsed, resolveAccount, showUndo])

  // === VOICE: Speech Recognition ===
  const toggleVoice = useCallback(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-IN'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setTextInput(transcript)
      setIsListening(false)
    }

    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening])

  // === TEMPLATE EDITOR: Create/Edit ===
  const handleSaveTemplate = useCallback(async (data: { name: string; amount: number; category: string }) => {
    const account = getDefaultAccount()
    if (editingTemplate) {
      await db.templates.update(editingTemplate.id, { ...data, accountId: account?.id || '' })
    } else {
      await db.templates.add({
        id: generateUUID(),
        ...data,
        accountId: account?.id || '',
        type: 'expense',
        createdAt: new Date().toISOString(),
        usageCount: 0,
      })
    }
    setShowTemplateEditor(false)
    setEditingTemplate(null)
  }, [editingTemplate, getDefaultAccount])

  const hasSpeechAPI = typeof window !== 'undefined' && 
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  return (
    <div className="space-y-3">
      {/* NLP Text Input (Phase 0.7) */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              ref={inputRef}
              type="text"
              placeholder='Type "food 200" or "salary 50000"'
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && parsed && NLPParserService.isComplete(parsed)) {
                  handleNLPSave()
                }
              }}
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/50 transition-all"
            />
          </div>
          {hasSpeechAPI && (
            <button
              onClick={toggleVoice}
              className={cn(
                "h-10 w-10 flex items-center justify-center rounded-xl border transition-all",
                isListening
                  ? "bg-red-500/10 border-red-500/40 text-red-500 animate-pulse"
                  : "bg-secondary border-border/50 text-muted-foreground hover:text-foreground"
              )}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Parsed preview */}
        <AnimatePresence>
          {parsed && textInput.trim() && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-2 flex items-center justify-between p-2.5 rounded-xl bg-primary/5 border border-primary/20"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">
                  {NLPParserService.getSummary(parsed)}
                </span>
              </div>
              {NLPParserService.isComplete(parsed) && (
                <button
                  onClick={handleNLPSave}
                  disabled={saving}
                  className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {saving ? '...' : 'Confirm'}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Template Pills (Phase 0.2) */}
      {safeTemplates.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Templates</p>
            <button
              onClick={() => { setShowTemplateEditor(true); setEditingTemplate(null) }}
              className="text-[10px] text-primary font-semibold flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {safeTemplates.map(template => (
              <motion.button
                key={template.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleTemplateTap(template)}
                onPointerDown={() => handleLongPressStart(template.id)}
                onPointerUp={handleLongPressEnd}
                onPointerLeave={handleLongPressEnd}
                className={cn(
                  "relative px-3 py-2 rounded-xl border text-xs font-semibold transition-all",
                  longPressId === template.id
                    ? "bg-destructive/10 border-destructive/30"
                    : "bg-secondary/60 border-border/50 hover:bg-secondary active:bg-primary/10"
                )}
              >
                <span className="text-foreground">{template.name}</span>
                <span className="ml-1.5 text-muted-foreground">{formatCurrency(template.amount)}</span>

                {/* Long-press action bar */}
                <AnimatePresence>
                  {longPressId === template.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 rounded-lg bg-card border border-border shadow-xl"
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingTemplate(template); setShowTemplateEditor(true); setLongPressId(null) }}
                        className="p-1.5 rounded-md hover:bg-secondary"
                      >
                        <Edit2 className="w-3 h-3 text-foreground" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(template.id) }}
                        className="p-1.5 rounded-md hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setLongPressId(null) }}
                        className="p-1.5 rounded-md hover:bg-secondary"
                      >
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state: prompt to create templates with starter suggestions */}
      {safeTemplates.length === 0 && (
        <div className="space-y-2">
          <button
            onClick={() => { setShowTemplateEditor(true); setEditingTemplate(null) }}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border/60 bg-secondary/20 hover:bg-secondary/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">Create your first template</span>
          </button>

          {/* Phase 17: Starter Pack Suggestions */}
          <div className="space-y-1.5">
            <p className="text-[9px] font-bold text-muted-foreground/60 uppercase">Suggested starter templates</p>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_TEMPLATES.map(starter => (
                <button
                  key={starter.name}
                  onClick={async () => {
                    const account = getDefaultAccount()
                    await db.templates.add({
                      id: generateUUID(),
                      name: starter.name,
                      amount: starter.amount,
                      category: starter.category,
                      accountId: account?.id || '',
                      type: 'expense',
                      createdAt: new Date().toISOString(),
                      usageCount: 0,
                    })
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-secondary/60 border border-border/40 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                >
                  + {starter.name} ₹{starter.amount}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Template Editor Modal */}
      <AnimatePresence>
        {showTemplateEditor && (
          <TemplateEditor
            template={editingTemplate}
            onSave={handleSaveTemplate}
            onClose={() => { setShowTemplateEditor(false); setEditingTemplate(null) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// === Template Editor Inline Form ===
function TemplateEditor({ template, onSave, onClose }: {
  template: ExpenseTemplate | null
  onSave: (data: { name: string; amount: number; category: string }) => void
  onClose: () => void
}) {
  const [name, setName] = useState(template?.name || '')
  const [amount, setAmount] = useState(template?.amount?.toString() || '')
  const [category, setCategory] = useState(template?.category || 'Food')

  const categories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Utilities', 'Rent', 'Healthcare', 'Subscriptions', 'Other']

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
        <div className="flex justify-between items-center">
          <p className="text-xs font-bold text-foreground">{template ? 'Edit Template' : 'New Template'}</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Name (e.g. Coffee)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 h-9 px-3 rounded-xl bg-secondary border border-border/50 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60"
          />
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
            <input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 h-9 pl-7 pr-2 rounded-xl bg-secondary border border-border/50 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all",
                category === cat
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "bg-secondary text-muted-foreground border border-border/30 hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            if (!name || !amount || Number(amount) <= 0) return
            onSave({ name, amount: parseFloat(amount), category })
          }}
          disabled={!name || !amount || Number(amount) <= 0}
          className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          <Check className="w-3.5 h-3.5 inline mr-1.5" />
          {template ? 'Update Template' : 'Save Template'}
        </button>
      </div>
    </motion.div>
  )
}
