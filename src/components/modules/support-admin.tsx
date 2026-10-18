'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck, ArrowLeft, RefreshCw, Bug, AlertTriangle, Lightbulb,
  HelpCircle, MessageSquare, ImageIcon, Lock, Inbox, ChevronRight, Mail, User, Clock,
} from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { isOperatorEmail } from '@/lib/admin-config'
import { useToast } from '@/components/ui/toast-notification'
import { EmptyState } from '@/components/ui/empty-state'
import {
  adminListTickets, adminUpdateTicketStatus, adminSignAttachment, AdminTicket,
} from '@/services/SupportService'
import { cn } from '@/lib/utils'

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  bug: { label: 'Bug', icon: Bug, color: 'text-red-500', bg: 'bg-red-500/10' },
  issue: { label: 'Issue', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  feature_request: { label: 'Feature', icon: Lightbulb, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  question: { label: 'Question', icon: HelpCircle, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  feedback: { label: 'Feedback', icon: MessageSquare, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
}

const STATUS_OPTIONS = ['open', 'in_review', 'investigating', 'resolved', 'closed']

function statusColor(status: string) {
  switch (status) {
    case 'open': return 'bg-blue-500/10 text-blue-500'
    case 'in_review': return 'bg-amber-500/10 text-amber-500'
    case 'investigating': return 'bg-purple-500/10 text-purple-500'
    case 'resolved': return 'bg-emerald-500/10 text-emerald-500'
    case 'closed': return 'bg-gray-500/10 text-gray-500'
    default: return 'bg-gray-500/10 text-gray-500'
  }
}

export function SupportAdmin() {
  const { user, loading: authLoading } = useAuth()
  const { showToast } = useToast()

  const [tickets, setTickets] = useState<AdminTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminTicket | null>(null)
  const [filter, setFilter] = useState<string>('all')

  const isOperator = isOperatorEmail(user?.email)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await adminListTickets()
      setTickets(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOperator) load()
    else setLoading(false)
  }, [isOperator, load])

  // Not signed in as an operator → locked screen (client-side; server also enforces)
  if (!authLoading && !isOperator) {
    return (
      <div className="max-w-2xl mx-auto pb-6">
        <EmptyState
          icon={Lock}
          title="Operator access only"
          description={user?.email
            ? `${user.email} isn't an operator account. Add it to the allowlist to view submitted tickets.`
            : 'Sign in with your operator account to review support tickets.'}
          color="destructive"
        />
      </div>
    )
  }

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
  const counts = tickets.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Support Inbox</h1>
            <p className="text-[11px] text-muted-foreground">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''} total</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/70 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={cn('w-4 h-4 text-foreground', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {['all', ...STATUS_OPTIONS].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold capitalize transition-colors',
              filter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            {s.replace('_', ' ')}{s !== 'all' && counts[s] ? ` ${counts[s]}` : ''}
          </button>
        ))}
      </div>

      {/* States */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin" />
          <p className="text-xs text-muted-foreground">Loading tickets…</p>
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load tickets"
          description={error}
          color="destructive"
          action={{ label: 'Try again', onClick: load }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filter === 'all' ? 'No tickets yet' : `No ${filter.replace('_', ' ')} tickets`}
          description="Submissions from users will appear here."
          color="secondary"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const meta = CATEGORY_META[t.category] || CATEGORY_META.question
            const Icon = meta.icon
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="w-full text-left p-4 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-hover transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', meta.bg)}>
                      <Icon className={cn('w-4.5 h-4.5', meta.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{t.subject}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {t.user_email || t.guest_id || 'Unknown'} · {t.id}
                      </p>
                    </div>
                  </div>
                  <span className={cn('text-[9px] px-2 py-0.5 rounded-full font-bold uppercase flex-shrink-0', statusColor(t.status))}>
                    {t.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2 pl-12">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()}
                  </span>
                  <div className="flex items-center gap-2">
                    {t.attachments?.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <ImageIcon className="w-3 h-3" />{t.attachments.length}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Detail drawer */}
      <AnimatePresence>
        {selected && (
          <TicketDetail
            ticket={selected}
            onClose={() => setSelected(null)}
            onStatusChange={async (status) => {
              try {
                await adminUpdateTicketStatus(selected.id, status)
                setTickets(prev => prev.map(t => t.id === selected.id ? { ...t, status } : t))
                setSelected(prev => prev ? { ...prev, status } : prev)
                showToast(`Marked ${status.replace('_', ' ')}`)
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Update failed')
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================================================
// DETAIL DRAWER
// ============================================================================

function TicketDetail({ ticket, onClose, onStatusChange }: {
  ticket: AdminTicket
  onClose: () => void
  onStatusChange: (status: string) => void
}) {
  const meta = CATEGORY_META[ticket.category] || CATEGORY_META.question
  const Icon = meta.icon
  const [signed, setSigned] = useState<Record<string, string | null>>({})

  // Refresh signed URLs for each attachment (stored ones may have expired).
  useEffect(() => {
    let active = true
    ;(async () => {
      const out: Record<string, string | null> = {}
      for (const a of ticket.attachments || []) {
        if (a.path) out[a.path] = await adminSignAttachment(a.path)
        else if (a.url) out[a.name] = a.url
      }
      if (active) setSigned(out)
    })()
    return () => { active = false }
  }, [ticket])

  const d = ticket.diagnostics || {}
  const field = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return null
    return (
      <div className="py-2 border-b border-border/40 last:border-0">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-[13px] text-foreground whitespace-pre-wrap mt-0.5">{String(value)}</p>
      </div>
    )
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[88%] rounded-t-3xl bg-background border-t border-border overflow-y-auto"
      >
        <div className="sticky top-0 bg-background/95 backdrop-blur px-5 py-4 border-b border-border/50 flex items-center gap-3">
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', meta.bg)}>
            <Icon className={cn('w-4 h-4', meta.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{ticket.subject}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{ticket.id}</p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Submitter */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-[11px] text-foreground">
              {ticket.user_email ? <Mail className="w-3 h-3" /> : <User className="w-3 h-3" />}
              {ticket.user_email || ticket.guest_id || 'Unknown'}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />{new Date(ticket.created_at).toLocaleString()}
            </span>
          </div>

          {/* Status changer */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => onStatusChange(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[11px] font-semibold capitalize transition-colors',
                    ticket.status === s ? statusColor(s) + ' ring-1 ring-current' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  )}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Fields */}
          <div className="rounded-2xl border border-border bg-card px-4">
            {field('Description', ticket.description)}
            {field('Steps to reproduce', ticket.steps_to_reproduce)}
            {field('Expected behaviour', ticket.expected_behaviour)}
            {field('Actual behaviour', ticket.actual_behaviour)}
            {field('Problem to solve', ticket.problem_to_solve)}
            {field('Suggestion', ticket.suggestion)}
            {field('Rating', ticket.rating ? `${ticket.rating} / 5` : null)}
            {field('Priority', ticket.priority)}
          </div>

          {/* Screenshots */}
          {ticket.attachments?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
                Screenshots ({ticket.attachments.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {ticket.attachments.map((a, i) => {
                  const url = a.path ? signed[a.path] : (signed[a.name] ?? a.url)
                  return url ? (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="block aspect-square rounded-xl overflow-hidden border border-border/50 bg-secondary">
                      <img src={url} alt={a.name} className="w-full h-full object-cover" />
                    </a>
                  ) : (
                    <div key={i} className="aspect-square rounded-xl border border-border/50 bg-secondary flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Diagnostics */}
          <div className="rounded-2xl border border-border bg-card px-4">
            {field('Device', [d['os'], d['osVersion'], d['deviceType'], d['platform']].filter(Boolean).join(' · '))}
            {field('Screen', d['screenSize'])}
            {field('App version', d['appVersion'])}
            {field('Language / Timezone', [d['language'], d['timezone']].filter(Boolean).join(' · '))}
          </div>
        </div>
      </motion.div>
    </>
  )
}
