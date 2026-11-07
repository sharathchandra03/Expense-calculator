'use client'
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, Banknote, CheckCircle2, ChevronRight, Landmark, LineChart, Lock, PieChart, RefreshCw,
  ShieldCheck, Trash2, X,
} from 'lucide-react'
import { db, type FinancialConnection, type LinkedAccount } from '@/db/schema'
import { useAuth } from '@/providers/AuthProvider'
import { ApiError, FinancialConnectionService, PENDING_FLAG } from '@/services/FinancialConnectionService'
import { deriveConnectionState, STATE_LABEL, STATE_TONE } from '@/lib/fin/state'
import type { ProviderInfo } from '@/lib/fin/types'
import { cn } from '@/lib/utils'
import { Amount } from '@/components/ui/amount'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast-notification'
import { FinReviewQueue } from '@/components/modules/fin-review-queue'

const TONE_CLASS = {
  neutral: 'bg-secondary text-muted-foreground',
  info: 'bg-sky-500/15 text-sky-400',
  good: 'bg-emerald-500/15 text-emerald-500',
  warn: 'bg-amber-500/15 text-amber-500',
  bad: 'bg-red-500/15 text-red-500',
} as const

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
const fmtDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

function useSyncing() {
  return useSyncExternalStore(
    (cb) => FinancialConnectionService.subscribe(cb),
    () => [...FinancialConnectionService.syncing()].sort().join(','),
    () => '',
  )
}

function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9000] bg-black/60" onClick={onClose} />
          <div className="pointer-events-none fixed inset-0 z-[9001] flex items-end justify-center sm:items-center sm:p-4">
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              role="dialog" aria-modal="true" aria-label={title}
              className="pointer-events-auto flex max-h-[90vh] w-full flex-col rounded-t-3xl bg-card sm:max-w-md sm:rounded-3xl"
            >
              <div className="flex items-center justify-between px-5 pb-3 pt-5">
                <h3 className="text-[18px] font-bold text-foreground">{title}</h3>
                <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-6">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

const primaryBtn = 'flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#7c6ffd] to-[#5b3df5] text-[15px] font-bold text-white transition active:scale-[0.99] disabled:opacity-50'
const ghostBtn = 'flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-secondary/50 text-[14px] font-semibold text-foreground transition active:scale-[0.99] disabled:opacity-50'

export function ConnectAccounts() {
  const { user, isConfigured } = useAuth()
  const { showToast } = useToast()
  const syncingKey = useSyncing()
  const syncingIds = useMemo(() => new Set(syncingKey ? syncingKey.split(',') : []), [syncingKey])

  const connections = useLiveQuery(() => db.financialConnections.orderBy('id').toArray(), [], [] as FinancialConnection[])
  const linked = useLiveQuery(() => db.linkedAccounts.toArray(), [], [] as LinkedAccount[])
  const history = useLiveQuery(() => db.syncHistory.orderBy('startedAt').reverse().limit(5).toArray(), [])

  const [connectOpen, setConnectOpen] = useState(false)
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [providerId, setProviderId] = useState('')
  const [mobile, setMobile] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [starting, setStarting] = useState(false)
  const [sandboxConsentId, setSandboxConsentId] = useState<string | null>(null)
  const [manageId, setManageId] = useState<string | null>(null)
  const [disconnectId, setDisconnectId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const needsSignIn = isConfigured && !user

  // Returning from a provider's consent page, or opening the screen: ask the server where things stand.
  useEffect(() => {
    if (needsSignIn) return
    let cancelled = false
    ;(async () => {
      try {
        await FinancialConnectionService.refresh()
        const pending = await db.financialConnections.where('status').equals('awaiting_consent').toArray()
        for (const c of pending) if (!cancelled) await FinancialConnectionService.checkStatus(c.id).catch(() => undefined)
        localStorage.removeItem(PENDING_FLAG)
        await FinancialConnectionService.syncDueConnections()
      } catch {
        /* offline / not configured: the local mirror is still shown */
      }
    })()
    return () => { cancelled = true }
  }, [needsSignIn])

  const openConnect = useCallback(async () => {
    setConnectOpen(true)
    setProviderError(null)
    try {
      const res = await FinancialConnectionService.providers()
      setProviders(res.providers)
      const firstReady = res.providers.find((p) => p.availability.ready && p.fiTypes.includes('DEPOSIT'))
      setProviderId((cur) => cur || firstReady?.id || '')
    } catch (e) {
      setProviderError(e instanceof ApiError ? e.message : 'Could not load providers.')
    }
  }, [])

  const selected = providers?.find((p) => p.id === providerId)
  const needsMobile = !!selected && !selected.simulated
  const mobileValid = !needsMobile || /^\d{10}$/.test(mobile)

  const start = async () => {
    if (!selected) return
    setStarting(true)
    try {
      const res = await FinancialConnectionService.startConnection({
        provider: selected.id,
        fiTypes: ['DEPOSIT'],
        mobile: needsMobile ? mobile : undefined,
      })
      setConnectOpen(false)
      setAgreed(false)
      if (selected.simulated) {
        setSandboxConsentId(res.consent.id)
      } else {
        localStorage.setItem(PENDING_FLAG, '1')
        window.location.href = res.consentUrl // provider's official consent UI
      }
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not start the connection.')
    } finally {
      setStarting(false)
    }
  }

  const decideSandbox = async (decision: 'approve' | 'reject') => {
    const id = sandboxConsentId
    if (!id) return
    setBusy(true)
    try {
      const c = await FinancialConnectionService.decideSandbox(id, decision)
      setSandboxConsentId(null)
      if (c.status === 'active') {
        showToast('Consent approved. Importing sandbox data…', 'info')
        const r = await FinancialConnectionService.sync(id)
        showToast(`Imported ${r.inserted} sandbox transactions.`, 'success')
      } else {
        showToast('Consent declined.', 'info')
      }
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const syncNow = async (id: string) => {
    try {
      const r = await FinancialConnectionService.sync(id)
      showToast(r.inserted > 0 ? `${r.inserted} new transaction${r.inserted > 1 ? 's' : ''} imported.` : 'Already up to date.', 'success')
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Sync failed.')
    }
  }

  const disconnect = async (deleteData: boolean) => {
    const id = disconnectId
    if (!id) return
    setBusy(true)
    try {
      await FinancialConnectionService.disconnect(id, deleteData)
      showToast(deleteData ? 'Disconnected. Imported data was deleted from this device.' : 'Disconnected. Your history is kept.', 'success')
      setDisconnectId(null)
      setManageId(null)
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not disconnect.')
    } finally {
      setBusy(false)
    }
  }

  const accountsBy = useMemo(() => {
    const m = new Map<string, LinkedAccount[]>()
    for (const l of linked ?? []) m.set(l.consentId, [...(m.get(l.consentId) ?? []), l])
    return m
  }, [linked])

  const manage = connections?.find((c) => c.id === manageId)
  const disconnectTarget = connections?.find((c) => c.id === disconnectId)
  const sandboxConn = connections?.find((c) => c.id === sandboxConsentId)
  const anySandbox = (connections ?? []).some((c) => c.simulated && c.status !== 'revoked')

  const tiles = [
    { label: 'Connect Bank Account', sub: 'Savings & current accounts', icon: Banknote, onClick: openConnect, enabled: true },
    { label: 'Connect Mutual Funds', sub: 'Coming soon', icon: PieChart, enabled: false },
    { label: 'Connect Demat Account', sub: 'Coming soon', icon: LineChart, enabled: false },
    { label: 'View Connected Accounts', sub: `${connections?.length ?? 0} connection${(connections?.length ?? 0) === 1 ? '' : 's'}`, icon: Landmark, onClick: () => document.getElementById('fin-connected')?.scrollIntoView({ behavior: 'smooth' }), enabled: true },
  ]

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title="Connect Financial Accounts" subtitle="Import transactions automatically, with your consent" />

      {anySandbox && (
        <div role="note" className="flex items-start gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3 text-[12px] text-violet-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
          <span>Sandbox mode. Data from the sandbox provider is generated for testing and is not from a real bank.</span>
        </div>
      )}

      {needsSignIn && (
        <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-[13px] text-amber-500">
          Sign in to PennyFlow first. Financial connections are tied to your account so they stay private to you.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            disabled={!t.enabled || (needsSignIn && t.label === 'Connect Bank Account')}
            onClick={t.onClick}
            className="flex min-h-[112px] flex-col items-start justify-between rounded-3xl border border-border/70 bg-card p-4 text-left shadow-card transition active:scale-[0.99] disabled:opacity-50"
          >
            <t.icon className="h-6 w-6 text-primary" aria-hidden />
            <span>
              <span className="block text-[14px] font-bold leading-tight text-foreground">{t.label}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{t.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <p className="flex items-start gap-2 text-[12px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" aria-hidden />
        <span>PennyFlow never asks for your bank password, UPI PIN, net-banking login or OTP, and never moves money. You approve access on your Account Aggregator&apos;s screen and can revoke it any time.</span>
      </p>

      <section id="fin-connected" aria-labelledby="fin-connected-title" className="space-y-3">
        <h2 id="fin-connected-title" className="text-[15px] font-bold text-foreground">Connected accounts</h2>
        {(connections?.length ?? 0) === 0 && (
          <Card className="p-5 text-center text-[13px] text-muted-foreground">No accounts connected yet. Manual entry keeps working as before.</Card>
        )}
        {(connections ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => {
          const state = deriveConnectionState({ status: c.status, lastSyncState: c.lastSyncState, syncingNow: syncingIds.has(c.id) })
          const accts = accountsBy.get(c.id) ?? []
          return (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-foreground">
                    {c.simulated ? 'Sandbox connection' : `${c.provider.charAt(0).toUpperCase()}${c.provider.slice(1)} connection`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Last sync: {fmt(c.lastSyncAt)}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {c.simulated && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-400">SANDBOX</span>}
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', TONE_CLASS[STATE_TONE[state]])}>{STATE_LABEL[state]}</span>
                </div>
              </div>

              {state === 'sync_failed' && c.lastError && (
                <p role="alert" className="mt-2 rounded-xl bg-red-500/10 p-2 text-[12px] text-red-400">Last sync failed. You can retry; nothing was lost.</p>
              )}
              {state === 'consent_expired' && (
                <p role="alert" className="mt-2 rounded-xl bg-amber-500/10 p-2 text-[12px] text-amber-500">This consent has expired, so syncing stopped. Connect again to resume. Your imported history stays.</p>
              )}
              {state === 'awaiting_consent' && (
                <p className="mt-2 rounded-xl bg-amber-500/10 p-2 text-[12px] text-amber-500">Waiting for you to approve access with your Account Aggregator. No data has been imported.</p>
              )}

              {accts.length > 0 && (
                <ul className="mt-3 divide-y divide-border/40">
                  {accts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-foreground">{a.institutionName}</p>
                        <p className="text-[11px] text-muted-foreground">{a.accountType.charAt(0) + a.accountType.slice(1).toLowerCase()} · {a.maskedNumber}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {a.balance !== undefined && <Amount value={a.balance} size="md" />}
                        <p className="text-[10px] text-muted-foreground">{a.balanceAsOf ? `as of ${fmtDay(a.balanceAsOf)}` : ''}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 grid grid-cols-3 gap-2">
                {c.status === 'awaiting_consent' ? (
                  <>
                    <button className={ghostBtn} onClick={() => (c.simulated ? setSandboxConsentId(c.id) : FinancialConnectionService.checkStatus(c.id).catch(() => showToast('Could not check status.')))}>
                      {c.simulated ? 'Open consent' : 'Check status'}
                    </button>
                    <button className={ghostBtn} onClick={() => setManageId(c.id)}>Details</button>
                    <button className={cn(ghostBtn, 'text-red-400')} onClick={() => setDisconnectId(c.id)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className={ghostBtn} disabled={c.status !== 'active' || state === 'syncing'} onClick={() => syncNow(c.id)}>
                      <RefreshCw className={cn('h-4 w-4', state === 'syncing' && 'animate-spin')} aria-hidden /> Sync
                    </button>
                    <button className={ghostBtn} onClick={() => setManageId(c.id)}>Consent</button>
                    <button className={cn(ghostBtn, 'text-red-400')} onClick={() => setDisconnectId(c.id)}>
                      {c.status === 'active' ? 'Disconnect' : 'Remove'}
                    </button>
                  </>
                )}
              </div>
            </Card>
          )
        })}
      </section>

      <FinReviewQueue />

      {history && history.length > 0 && (
        <section aria-labelledby="fin-history-title" className="space-y-2">
          <h2 id="fin-history-title" className="text-[15px] font-bold text-foreground">Recent syncs</h2>
          <Card className="divide-y divide-border/40">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12px]">
                <span className="text-muted-foreground">{fmt(h.startedAt)}</span>
                <span className={h.state === 'success' ? 'text-emerald-500' : 'text-red-400'}>
                  {h.state === 'success' ? `${h.inserted} new · ${h.skipped} already had` : 'Failed'}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* ---- Connect bank sheet ---- */}
      <Sheet open={connectOpen} title="Connect bank account" onClose={() => setConnectOpen(false)}>
        <div className="space-y-4">
          <div className="rounded-2xl bg-secondary/60 p-4 text-[13px] text-foreground">
            <p className="mb-2 font-bold">What PennyFlow will ask to access</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Account type, bank name and masked account number</li>
              <li>Current balance and the date of that balance</li>
              <li>Up to 12 months of transactions (amount, date, mode, narration, reference)</li>
            </ul>
            <p className="mt-3 text-muted-foreground">Used only to track your spending and net worth. Access lasts up to 6 months. You can revoke it here or at your Account Aggregator at any time.</p>
          </div>

          {providerError && <p role="alert" className="text-[13px] text-red-400">{providerError}</p>}
          {!providers && !providerError && <p className="text-[13px] text-muted-foreground">Loading providers…</p>}

          {providers && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-[12px] font-semibold text-muted-foreground">Account Aggregator</legend>
              {providers.filter((p) => p.fiTypes.includes('DEPOSIT')).map((p) => (
                <label key={p.id} className={cn('flex items-start gap-3 rounded-2xl border p-3', providerId === p.id ? 'border-primary bg-primary/5' : 'border-border', !p.availability.ready && 'opacity-60')}>
                  <input type="radio" name="provider" className="mt-1" disabled={!p.availability.ready} checked={providerId === p.id} onChange={() => setProviderId(p.id)} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-foreground">{p.displayName}</span>
                    <span className="block text-[11px] text-muted-foreground">{p.availability.ready ? (p.simulated ? 'Test data only. No real bank is contacted.' : 'Official consent screen opens next.') : p.availability.reason}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {needsMobile && (
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">Mobile number registered with your bank</span>
              <input inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-[16px]" placeholder="10-digit number" />
            </label>
          )}

          <label className="flex items-start gap-3 text-[13px] text-foreground">
            <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I understand I will approve access on my Account Aggregator&apos;s screen, and PennyFlow never sees my bank credentials.</span>
          </label>

          <button className={primaryBtn} disabled={!selected || !agreed || !mobileValid || starting} onClick={start}>
            <Lock className="h-4 w-4" aria-hidden /> {starting ? 'Starting…' : 'Continue to consent'}
          </button>
        </div>
      </Sheet>

      {/* ---- Sandbox consent screen (stand-in for an AA's UI) ---- */}
      <Sheet open={!!sandboxConsentId} title="Sandbox consent" onClose={() => !busy && setSandboxConsentId(null)}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3 text-[12px] text-violet-300">
            This screen only simulates an Account Aggregator&apos;s consent page for testing. No real bank or account is involved.
          </div>
          <dl className="space-y-1.5 text-[13px]">
            <div className="flex justify-between"><dt className="text-muted-foreground">Requested by</dt><dd className="font-semibold">PennyFlow</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Data</dt><dd className="font-semibold">Deposit account details & transactions</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">From</dt><dd className="font-semibold">{fmtDay(sandboxConn?.dataFrom)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Valid until</dt><dd className="font-semibold">{fmtDay(sandboxConn?.validTo)}</dd></div>
          </dl>
          <button className={primaryBtn} disabled={busy} onClick={() => decideSandbox('approve')}><CheckCircle2 className="h-4 w-4" aria-hidden /> Approve</button>
          <button className={ghostBtn} disabled={busy} onClick={() => decideSandbox('reject')}>Decline</button>
        </div>
      </Sheet>

      {/* ---- Manage consent ---- */}
      <Sheet open={!!manage} title="Manage consent" onClose={() => setManageId(null)}>
        {manage && (
          <div className="space-y-4">
            <dl className="space-y-2 text-[13px]">
              {[
                ['Status', STATE_LABEL[deriveConnectionState({ status: manage.status, lastSyncState: manage.lastSyncState })]],
                ['Provider', manage.simulated ? 'Sandbox (simulated)' : manage.provider],
                ['Data shared', manage.fiTypes.join(', ')],
                ['History from', fmtDay(manage.dataFrom)],
                ['Valid until', fmtDay(manage.validTo)],
                ['Created', fmt(manage.createdAt)],
                ['Last sync', fmt(manage.lastSyncAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
              ))}
            </dl>
            <button className={cn(ghostBtn, 'text-red-400')} onClick={() => { setDisconnectId(manage.id) }}>
              <Trash2 className="h-4 w-4" aria-hidden /> {manage.status === 'active' ? 'Revoke consent & disconnect' : 'Remove connection'}
            </button>
          </div>
        )}
      </Sheet>

      {/* ---- Disconnect ---- */}
      <Sheet open={!!disconnectTarget} title={disconnectTarget?.status === 'active' || disconnectTarget?.status === 'awaiting_consent' ? 'Disconnect' : 'Remove connection'} onClose={() => !busy && setDisconnectId(null)}>
        <div className="space-y-3">
          <p className="text-[13px] text-muted-foreground">
            {disconnectTarget?.status === 'active' || disconnectTarget?.status === 'awaiting_consent'
              ? 'PennyFlow will revoke access with your provider and stop syncing. Nothing is shown as disconnected until the provider confirms.'
              : 'This connection is no longer active.'}
          </p>
          {disconnectTarget?.status !== 'awaiting_consent' && (
            <button className={ghostBtn} disabled={busy} onClick={() => disconnect(false)}>
              {disconnectTarget?.status === 'active' ? 'Disconnect and keep my history' : 'Keep history'}
            </button>
          )}
          <button className={cn(ghostBtn, 'border-red-500/40 text-red-400')} disabled={busy} onClick={() => disconnect(true)}>
            <Trash2 className="h-4 w-4" aria-hidden /> {disconnectTarget?.status === 'awaiting_consent' ? 'Cancel this request' : 'Disconnect and delete imported data'}
          </button>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><ChevronRight className="h-3 w-3" aria-hidden /> Deleting removes imported transactions, linked accounts and the consent record. Entries you added by hand are never deleted.</p>
        </div>
      </Sheet>
    </div>
  )
}
