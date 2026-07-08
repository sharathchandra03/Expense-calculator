'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { SyncService } from '@/services/SyncService'
import { Cloud, LogOut, Check, RefreshCw, CloudOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export function SyncCard({ compact = false }: { compact?: boolean }) {
  const { user, loading, signInWithGoogle, signOut } = useAuth()
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setLastSync(SyncService.getLastSync())
  }, [syncing])

  // Auto-hide on dashboard after 5 seconds (only in compact/dashboard mode)
  useEffect(() => {
    if (!compact) return
    if (loading) return
    // Reset visibility when component mounts
    setVisible(true)
    const timer = setTimeout(() => {
      setVisible(false)
    }, 5000)
    return () => clearTimeout(timer)
  }, [compact, loading])

  // Auto-sync on login
  useEffect(() => {
    if (user && !loading) {
      // Only auto-push (don't pull and overwrite local data automatically)
      handlePush()
    }
  }, [user, loading])

  const handlePush = async () => {
    if (!user || syncing) return
    setSyncing(true)
    try {
      const result = await SyncService.pushToCloud(user.id)
      setSyncStatus(result.success ? 'success' : 'error')
    } catch {
      setSyncStatus('error')
    } finally {
      setSyncing(false)
      setLastSync(SyncService.getLastSync())
    }
  }

  const handleSync = async () => {
    if (!user || syncing) return
    setSyncing(true)
    setSyncStatus('idle')

    try {
      // Push local data to cloud (local is always the source of truth)
      const pushResult = await SyncService.pushToCloud(user.id)
      setSyncStatus(pushResult.success ? 'success' : 'error')
    } catch {
      setSyncStatus('error')
    } finally {
      setSyncing(false)
      setLastSync(SyncService.getLastSync())
    }
  }

  const handleSignOut = async () => {
    // Push before signing out
    if (user) {
      await SyncService.pushToCloud(user.id)
    }
    await signOut()
  }

  if (loading) return null

  // DASHBOARD (compact mode): Only show sign-in prompt if NOT logged in, auto-hide after 5s
  // If already logged in, don't show anything on dashboard
  if (compact && user) return null

  // Logged in state (only shows in Settings)
  if (user) {
    const formattedSync = lastSync
      ? new Date(lastSync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : null

    return (
      <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {user.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="" className="w-9 h-9 rounded-full" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-500" />
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-foreground">{user.user_metadata?.full_name || user.email}</p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                {syncing ? 'Syncing...' : syncStatus === 'error' ? 'Sync failed' : 'Synced & backed up'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="p-2 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Sync now"
            >
              <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
            </button>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        {formattedSync && (
          <p className="text-[10px] text-muted-foreground">Last synced: {formattedSync}</p>
        )}
      </div>
    )
  }

  // Not logged in - show sign-in prompt (auto-hides on dashboard after 5s)
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
              <Cloud className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Sync across devices</p>
              <p className="text-[10px] text-muted-foreground">Sign in to backup and access your data anywhere</p>
            </div>
          </div>

          <button
            onClick={signInWithGoogle}
            className="w-full h-10 rounded-xl bg-white dark:bg-white/95 text-gray-700 font-semibold text-xs flex items-center justify-center gap-2.5 hover:shadow-md transition-shadow border border-gray-200"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
