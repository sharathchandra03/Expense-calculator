'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, SupportTicketCategory, SupportTicketAttachment } from '@/db/schema'
import { cn } from '@/lib/utils'
import {
  submitSupportTicket, SubmitTicketData, syncPendingTickets,
  validateAttachment, readFileAsAttachment, formatFileSize, getUserTickets
} from '@/services/SupportService'
import { useToast } from '@/components/ui/toast-notification'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Bug, AlertTriangle, Lightbulb, HelpCircle, MessageSquare,
  BookOpen, Headphones, ArrowLeft, Paperclip, X, Image as ImageIcon,
  CheckCircle2, Copy, Star, Upload, Trash2, Clock, ChevronRight
} from 'lucide-react'

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type ViewState = 'dashboard' | 'form' | 'success' | 'history'

interface CategoryOption {
  id: SupportTicketCategory
  label: string
  description: string
  icon: React.ElementType
  color: string
  bg: string
}

const CATEGORIES: CategoryOption[] = [
  { id: 'bug', label: 'Report a Bug', description: 'Something broken or not working', icon: Bug, color: 'text-red-500', bg: 'bg-red-500/10' },
  { id: 'issue', label: 'Report an Issue', description: 'Performance or usability problems', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: 'feature_request', label: 'Feature Request', description: 'Suggest a new feature or improvement', icon: Lightbulb, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  { id: 'question', label: 'Ask a Question', description: 'Need help with something?', icon: HelpCircle, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'feedback', label: 'General Feedback', description: 'Share your thoughts with us', icon: MessageSquare, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
]

const PLACEHOLDER_CARDS = [
  { label: 'FAQ', description: 'Common questions answered', icon: BookOpen, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { label: 'Contact Support', description: 'Reach our support team', icon: Headphones, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
]

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function HelpSupport() {
  const [view, setView] = useState<ViewState>('dashboard')
  const [selectedCategory, setSelectedCategory] = useState<SupportTicketCategory | null>(null)
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null)
  const { showToast } = useToast()

  // Sync pending tickets when coming online
  useEffect(() => {
    const handleOnline = async () => {
      const synced = await syncPendingTickets()
      if (synced > 0) {
        showToast(`${synced} pending ticket${synced > 1 ? 's' : ''} synced successfully`)
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [showToast])

  const handleCategorySelect = (category: SupportTicketCategory) => {
    setSelectedCategory(category)
    setView('form')
  }

  const handleSubmitSuccess = (ticketId: string) => {
    setSubmittedTicketId(ticketId)
    setView('success')
  }

  const handleBack = () => {
    if (view === 'form') setView('dashboard')
    else if (view === 'success' || view === 'history') {
      setView('dashboard')
      setSelectedCategory(null)
      setSubmittedTicketId(null)
    }
  }

  const handleNewTicket = () => {
    setView('dashboard')
    setSelectedCategory(null)
    setSubmittedTicketId(null)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-6">
      <AnimatePresence mode="wait">
        {view === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <SupportDashboard
              onCategorySelect={handleCategorySelect}
              onViewHistory={() => setView('history')}
            />
          </motion.div>
        )}
        {view === 'form' && selectedCategory && (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <ReportForm
              category={selectedCategory}
              onBack={handleBack}
              onSuccess={handleSubmitSuccess}
            />
          </motion.div>
        )}
        {view === 'success' && submittedTicketId && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <SuccessView
              ticketId={submittedTicketId}
              onNewTicket={handleNewTicket}
              onViewHistory={() => setView('history')}
            />
          </motion.div>
        )}
        {view === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <TicketHistory onBack={handleBack} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================================================
// DASHBOARD VIEW
// ============================================================================

function SupportDashboard({ onCategorySelect, onViewHistory }: {
  onCategorySelect: (cat: SupportTicketCategory) => void
  onViewHistory: () => void
}) {
  const tickets = useLiveQuery(() => db.supportTickets.count()) ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Help & Support</h1>
        <p className="text-xs text-muted-foreground mt-1">
          How can we help you today?
        </p>
      </div>

      {/* Quick Stats */}
      {tickets > 0 && (
        <button
          onClick={onViewHistory}
          className="w-full flex items-center justify-between p-4 rounded-2xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Your Tickets</p>
              <p className="text-[10px] text-muted-foreground">{tickets} ticket{tickets !== 1 ? 's' : ''} submitted</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      )}

      {/* Category Cards */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
          What do you need help with?
        </h3>
        <div className="grid gap-3">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            return (
              <button
                key={cat.id}
                onClick={() => onCategorySelect(cat.id)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all text-left group"
              >
                <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', cat.bg)}>
                  <Icon className={cn('w-5 h-5', cat.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {cat.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{cat.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Placeholder Cards */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">
          Resources
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {PLACEHOLDER_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.label}
                className="flex flex-col items-center text-center p-4 rounded-2xl bg-secondary/30 border border-border/30 opacity-60"
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-2', card.bg)}>
                  <Icon className={cn('w-5 h-5', card.color)} />
                </div>
                <p className="text-xs font-semibold text-foreground">{card.label}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Coming soon</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// REPORT FORM
// ============================================================================

function ReportForm({ category, onBack, onSuccess }: {
  category: SupportTicketCategory
  onBack: () => void
  onSuccess: (ticketId: string) => void
}) {
  const { showToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attachments, setAttachments] = useState<SupportTicketAttachment[]>([])
  const [rating, setRating] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    stepsToReproduce: '',
    expectedBehaviour: '',
    actualBehaviour: '',
    problemToSolve: '',
    suggestion: '',
  })

  const categoryInfo = CATEGORIES.find(c => c.id === category)!

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Attachment handling
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const validation = validateAttachment(file)
      if (!validation.valid) {
        showToast(validation.error || 'Invalid file')
        continue
      }
      if (attachments.length >= 5) {
        showToast('Maximum 5 attachments allowed')
        break
      }
      try {
        const attachment = await readFileAsAttachment(file)
        setAttachments(prev => [...prev, attachment])
      } catch {
        showToast('Failed to read file')
      }
    }
    e.target.value = ''
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  // Form validation
  const validateForm = (): boolean => {
    if (!formData.subject.trim()) {
      showToast('Please enter a subject')
      return false
    }
    if (!formData.description.trim() && category !== 'feedback') {
      showToast('Please enter a description')
      return false
    }
    if (category === 'bug') {
      if (!formData.stepsToReproduce.trim()) {
        showToast('Please describe the steps to reproduce')
        return false
      }
    }
    return true
  }

  // Submit handler
  const handleSubmit = async () => {
    if (!validateForm()) return
    setIsSubmitting(true)

    try {
      const ticketData: SubmitTicketData = {
        category,
        subject: formData.subject.trim(),
        description: formData.description.trim(),
        attachments,
      }

      if (category === 'bug') {
        ticketData.stepsToReproduce = formData.stepsToReproduce.trim()
        ticketData.expectedBehaviour = formData.expectedBehaviour.trim()
        ticketData.actualBehaviour = formData.actualBehaviour.trim()
      }
      if (category === 'feature_request') {
        ticketData.problemToSolve = formData.problemToSolve.trim()
        ticketData.suggestion = formData.suggestion.trim()
      }
      if (category === 'feedback') {
        ticketData.rating = rating || undefined
      }

      const ticket = await submitSupportTicket(ticketData)
      onSuccess(ticket.id)
    } catch (err) {
      showToast('Failed to submit. Your report has been saved locally.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const Icon = categoryInfo.icon

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', categoryInfo.bg)}>
            <Icon className={cn('w-4.5 h-4.5', categoryInfo.color)} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{categoryInfo.label}</h2>
            <p className="text-[10px] text-muted-foreground">{categoryInfo.description}</p>
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
        {/* Subject - all categories */}
        <FormField label="Subject" required>
          <Input
            placeholder="Brief summary of your report"
            value={formData.subject}
            onChange={(e) => updateField('subject', e.target.value)}
            className="text-sm"
          />
        </FormField>

        {/* Description - all categories */}
        <FormField label={category === 'feedback' ? 'Your Feedback' : 'Description'} required={category !== 'feedback'}>
          <textarea
            placeholder={
              category === 'bug' ? 'Describe what happened...'
              : category === 'feature_request' ? 'Describe the feature you want...'
              : category === 'question' ? 'What do you need help with?'
              : category === 'feedback' ? 'Share your thoughts...'
              : 'Describe the issue...'
            }
            value={formData.description}
            onChange={(e) => updateField('description', e.target.value)}
            rows={4}
            className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
          />
        </FormField>

        {/* Bug-specific fields */}
        {category === 'bug' && (
          <>
            <FormField label="Steps to Reproduce" required>
              <textarea
                placeholder="1. Open the app&#10;2. Go to...&#10;3. Tap on..."
                value={formData.stepsToReproduce}
                onChange={(e) => updateField('stepsToReproduce', e.target.value)}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
              />
            </FormField>
            <FormField label="Expected Behaviour">
              <Input
                placeholder="What should have happened?"
                value={formData.expectedBehaviour}
                onChange={(e) => updateField('expectedBehaviour', e.target.value)}
                className="text-sm"
              />
            </FormField>
            <FormField label="Actual Behaviour">
              <Input
                placeholder="What actually happened?"
                value={formData.actualBehaviour}
                onChange={(e) => updateField('actualBehaviour', e.target.value)}
                className="text-sm"
              />
            </FormField>
          </>
        )}

        {/* Feature request fields */}
        {category === 'feature_request' && (
          <>
            <FormField label="Problem you're trying to solve">
              <textarea
                placeholder="What challenge are you facing?"
                value={formData.problemToSolve}
                onChange={(e) => updateField('problemToSolve', e.target.value)}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
              />
            </FormField>
            <FormField label="Your Suggestion">
              <textarea
                placeholder="How would you like this to work?"
                value={formData.suggestion}
                onChange={(e) => updateField('suggestion', e.target.value)}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
              />
            </FormField>
          </>
        )}

        {/* Feedback rating */}
        {category === 'feedback' && (
          <FormField label="Rating (optional)">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(rating === star ? 0 : star)}
                  className="p-1.5 transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      'w-7 h-7 transition-colors',
                      star <= rating
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-muted-foreground/30'
                    )}
                  />
                </button>
              ))}
            </div>
          </FormField>
        )}

        {/* Attachments */}
        <FormField label="Attachments (optional)">
          <div className="space-y-3">
            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="relative group w-20 h-20 rounded-xl overflow-hidden border border-border/50 bg-secondary/30"
                  >
                    {att.thumbnail ? (
                      <img src={att.thumbnail} alt={att.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                      </div>
                    )}
                    <button
                      onClick={() => removeAttachment(att.id)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5">
                      <p className="text-[8px] text-white truncate">{formatFileSize(att.size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= 5}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed transition-colors',
                attachments.length >= 5
                  ? 'border-border/30 text-muted-foreground/40 cursor-not-allowed'
                  : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary'
              )}
            >
              <Paperclip className="w-4 h-4" />
              <span className="text-xs font-semibold">
                {attachments.length >= 5 ? 'Max attachments reached' : 'Add Screenshot or Image'}
              </span>
            </button>
            <p className="text-[10px] text-muted-foreground/60 text-center">
              Max 5 files, 5MB each. Images only.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </FormField>

        {/* Offline notice */}
        {typeof navigator !== 'undefined' && !navigator.onLine && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              You're offline. Your report will be saved and submitted when you're back online.
            </p>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full h-12 rounded-full text-sm font-bold uppercase tracking-wider"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
            />
            Submitting...
          </span>
        ) : (
          'Submit Report'
        )}
      </Button>

      {/* Auto-diagnostics notice */}
      <p className="text-[10px] text-muted-foreground/50 text-center leading-relaxed">
        Device info (OS, screen size, app version) is automatically included to help us resolve your issue faster.
        No personal data is collected.
      </p>
    </div>
  )
}

// ============================================================================
// SUCCESS VIEW
// ============================================================================

function SuccessView({ ticketId, onNewTicket, onViewHistory }: {
  ticketId: string
  onNewTicket: () => void
  onViewHistory: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ticketId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement('textarea')
      textArea.value = ticketId
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex flex-col items-center text-center py-8 space-y-6">
      {/* Success Animation */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.1 }}
        className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.4, type: 'spring', damping: 12 }}
        >
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </motion.div>
      </motion.div>

      {/* Message */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="space-y-2"
      >
        <h2 className="text-xl font-bold text-foreground">Thank you!</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Your report has been submitted successfully. We'll review it and get back to you.
        </p>
      </motion.div>

      {/* Ticket ID */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="w-full max-w-xs"
      >
        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">
          Your Ticket ID
        </p>
        <div className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-secondary/50 border border-border/50">
          <p className="text-lg font-mono font-bold text-foreground tracking-wider">{ticketId}</p>
          <button
            onClick={handleCopy}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            {copied ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
        {copied && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[10px] text-emerald-500 mt-1 font-semibold"
          >
            Copied to clipboard!
          </motion.p>
        )}
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="flex flex-col gap-3 w-full max-w-xs pt-4"
      >
        <Button onClick={onNewTicket} className="w-full h-11 rounded-full text-sm font-bold">
          Submit Another Report
        </Button>
        <button
          onClick={onViewHistory}
          className="w-full h-11 rounded-full border border-border font-semibold text-sm text-foreground hover:bg-secondary/50 transition-colors"
        >
          View All Tickets
        </button>
      </motion.div>
    </div>
  )
}

// ============================================================================
// TICKET HISTORY VIEW
// ============================================================================

function TicketHistory({ onBack }: { onBack: () => void }) {
  const tickets = useLiveQuery(() =>
    db.supportTickets.orderBy('createdAt').reverse().toArray()
  ) ?? []

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-500/10 text-blue-500'
      case 'in_review': return 'bg-amber-500/10 text-amber-500'
      case 'investigating': return 'bg-purple-500/10 text-purple-500'
      case 'resolved': return 'bg-emerald-500/10 text-emerald-500'
      case 'closed': return 'bg-gray-500/10 text-gray-500'
      default: return 'bg-gray-500/10 text-gray-500'
    }
  }

  const getCategoryIcon = (cat: SupportTicketCategory) => {
    const found = CATEGORIES.find(c => c.id === cat)
    return found ? found.icon : HelpCircle
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-secondary transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-foreground">Ticket History</h2>
          <p className="text-[10px] text-muted-foreground">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Tickets List */}
      {tickets.length > 0 ? (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const CatIcon = getCategoryIcon(ticket.category)
            const catInfo = CATEGORIES.find(c => c.id === ticket.category)
            return (
              <div
                key={ticket.id}
                className="p-4 rounded-2xl bg-card border border-border/50 space-y-2.5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', catInfo?.bg || 'bg-secondary')}>
                      <CatIcon className={cn('w-4 h-4', catInfo?.color || 'text-muted-foreground')} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">{ticket.subject}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{ticket.id}</p>
                    </div>
                  </div>
                  <span className={cn(
                    'text-[9px] px-2 py-0.5 rounded-full font-bold uppercase',
                    getStatusColor(ticket.status)
                  )}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                  <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  {ticket.syncStatus === 'pending' && (
                    <span className="flex items-center gap-1 text-amber-500">
                      <Clock className="w-3 h-3" /> Pending sync
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-secondary/20 rounded-3xl border border-dashed border-border/50">
          <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs font-semibold text-muted-foreground">No tickets yet</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">Your submitted reports will appear here</p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SHARED UI COMPONENTS
// ============================================================================

function FormField({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}
