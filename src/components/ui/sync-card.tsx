'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { SyncService } from '@/services/SyncService'
import { Cloud, CloudOff, LogOut, Check, AlertTriangle, RefreshCw, Download, UploadCloud } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function SyncCard({ compact = false }: { compact?: boolean }) {
  const { user, loading, isConfigured, reachable, signInWithGoogle, signOut, checkReachability } = useAuth()
  const [visible, setVisible] = useState(true)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [signInError, setSignInError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [busy, setBusy] = useState<null | 'backup' | 'restore'>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)

  const handleBackupNow = async () => {
    if (!user) return
    setBusy('backup')
    setActionMsg(null)
    const res = await SyncService.pushToCloud(user.id)
    setBusy(null)
    setLastSync(SyncService.getLastSync())
    setActionMsg(res.success ? 'Backed up to cloud.' : `Backup failed: ${res.error || 'unknown error'}`)
  }

  const handleRestore = async () => {
    if (!user) return
    setConfirmRestore(false)
    setBusy('restore')
    setActionMsg(null)
    const res = await SyncService.forceRestoreFromCloud(user.id)
    setBusy(null)
    if (res.success && res.isEmpty) {
      setActionMsg('No cloud backup found for this account yet.')
    } else if (res.success) {
      setActionMsg('Restored from cloud. Reloading…')
      setTimeout(() => window.location.reload(), 900)
    } else {
      setActionMsg(`Restore failed: ${res.error || 'unknown error'}`)
    }
  }

  useEffect(() => {
    setLastSync(SyncService.getLastSync())
    const interval = setInterval(() => setLastSync(SyncService.getLastSync()), 5000)
    return () => clearInterval(interval)
  }, [])

  // Auto-hide on dashboard after 5 seconds
  useEffect(() => {
    if (!compact || loading) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [compact, loading])

  const handleSignIn = async () => {
    setSignInError(null)
    setSigningIn(true)
    try {
      const { error } = await signInWithGoogle()
      if (error) {
        setSignInError(error)
        setSigningIn(false)
      }
      // On success the page redirects to Google, so we leave signingIn true.
    } catch (err: any) {
      setSignInError(err?.message || 'Sign-in failed. Please try again.')
      setSigningIn(false)
    }
  }

  const handleRecheck = async () => {
    setRechecking(true)
    await checkReachability()
    setRechecking(false)
  }

  const handleSignOut = async () => {
    await signOut()
  }

  if (loading) return null

  // Dashboard compact mode: if logged in, don't clutter the dashboard.
  if (compact && user) return null

  const formattedSync = lastSync
    ? new Date(lastSync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  // ---- Logged in ----
  if (user) {
    // Cloud project unreachable while signed in → data isn't currently backing up.
    const cloudDown = reachable === false
    return (
      <div
        className={
          cloudDown
            ? 'rounded-2xl bg-amber-500/5 border border-amber-500/30 p-4 space-y-3'
            : 'rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-3'
        }
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {user.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="" className="w-9 h-9 rounded-full" />
            ) : (
              <div
                className={
                  cloudDown
                    ? 'w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center'
                    : 'w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center'
                }
              >
                {cloudDown ? (
                  <CloudOff className="w-4 h-4 text-amber-500" />
                ) : (
                  <Check className="w-4 h-4 text-emerald-500" />
                )}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-foreground">{user.user_metadata?.full_name || user.email}</p>
              {cloudDown ? (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Cloud unreachable — not syncing</p>
              ) : (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Linked to cloud • Auto-synced</p>
              )}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Status detail row */}
        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/40">
          <span className="text-muted-foreground">
            Status:{' '}
            <span className={cloudDown ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}>
              {cloudDown ? 'Backup paused' : 'Backed up to cloud'}
            </span>
          </span>
          {formattedSync && <span className="text-muted-foreground">Last sync: {formattedSync}</span>}
        </div>

        {/* Manual backup / restore controls (available when the cloud is up) */}
        {!cloudDown && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={handleBackupNow}
                disabled={busy !== null}
                className="flex-1 h-8 rounded-lg bg-secondary text-foreground text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:bg-secondary/80 disabled:opacity-50"
              >
                {busy === 'backup' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <UploadCloud className="w-3 h-3" />}
                Back up now
              </button>
              <button
                onClick={() => setConfirmRestore(true)}
                disabled={busy !== null}
                className="flex-1 h-8 rounded-lg bg-secondary text-foreground text-[11px] font-semibold flex items-center justify-center gap-1.5 hover:bg-secondary/80 disabled:opacity-50"
              >
                {busy === 'restore' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Restore from cloud
              </button>
            </div>

            {confirmRestore && (
              <div className="rounded-lg bg-secondary/60 border border-border/50 p-2.5 space-y-2">
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Replace the data on this device with your cloud backup? This overwrites current local data with what&apos;s
                  saved in your account.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleRestore}
                    className="flex-1 h-7 rounded-md bg-primary text-primary-foreground text-[10px] font-bold hover:opacity-90"
                  >
                    Yes, restore
                  </button>
                  <button
                    onClick={() => setConfirmRestore(false)}
                    className="h-7 px-3 rounded-md bg-secondary text-muted-foreground text-[10px] font-semibold hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {actionMsg && <p className="text-[10px] text-muted-foreground">{actionMsg}</p>}
          </div>
        )}

        {cloudDown && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground leading-snug">
              We can&apos;t reach your cloud server right now, so recent changes aren&apos;t backed up. Your data is safe
              locally on this device and will sync once the server is reachable again.
            </p>
            <button
              onClick={handleRecheck}
              disabled={rechecking}
              className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:opacity-80 disabled:opacity-50"
            >
              <RefreshCw className={rechecking ? 'w-3 h-3 animate-spin' : 'w-3 h-3'} />
              {rechecking ? 'Checking…' : 'Retry connection'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ---- Not logged in ----
  const cloudUnreachable = isConfigured && reachable === false

  return (
    <AnimatePresence>
      {(!compact || visible) && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.9, filter: 'blur(4px)' }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-2xl bg-gradient-to-br from-primary/8 to-primary/3 border border-primary/20 p-4 space-y-3"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              {cloudUnreachable ? <CloudOff className="w-4 h-4 text-amber-500" /> : <Cloud className="w-4 h-4 text-primary" />}
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Sync across devices</p>
              <p className="text-[10px] text-muted-foreground">
                {cloudUnreachable ? 'Cloud server unreachable' : 'Sign in to backup and access your data anywhere'}
              </p>
            </div>
          </div>

          {/* Status line so users always know whether cloud backup is available */}
          <div className="flex items-center gap-1.5 text-[10px]">
            {!isConfigured ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                <span className="text-muted-foreground">Cloud sync not set up — data saved locally only</span>
              </>
            ) : cloudUnreachable ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-amber-600 dark:text-amber-400 font-medium">Not linked — server unreachable</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-muted-foreground">Not linked — sign in to enable backup</span>
              </>
            )}
          </div>

          <button
            onClick={handleSignIn}
            disabled={!isConfigured || signingIn}
            className="w-full h-10 rounded-xl bg-white dark:bg-white/95 text-gray-700 font-semibold text-xs flex items-center justify-center gap-2.5 hover:shadow-md transition-shadow border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signingIn ? (
              <span className="w-4 h-4 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            {signingIn ? 'Connecting…' : 'Continue with Google'}
          </button>

          {!isConfigured && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-snug">
              Cloud sync isn&apos;t set up on this build. Your data is still saved locally on this device.
            </p>
          )}
          {cloudUnreachable && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 space-y-1.5">
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-snug">
                  The cloud server can&apos;t be reached — the Supabase project may be paused, deleted, or misconfigured.
                  Sign-in won&apos;t work until it&apos;s back, but your data stays safe on this device.
                </p>
              </div>
              <button
                onClick={handleRecheck}
                disabled={rechecking}
                className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:opacity-80 disabled:opacity-50"
              >
                <RefreshCw className={rechecking ? 'w-3 h-3 animate-spin' : 'w-3 h-3'} />
                {rechecking ? 'Checking…' : 'Retry connection'}
              </button>
            </div>
          )}
          {signInError && (
            <p className="text-[10px] text-destructive leading-snug">{signInError}</p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
