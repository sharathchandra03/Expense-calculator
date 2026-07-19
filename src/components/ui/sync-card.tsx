'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { SyncService } from '@/services/SyncService'
import { Cloud, LogOut, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function SyncCard({ compact = false }: { compact?: boolean }) {
  const { user, loading, signInWithGoogle, signOut } = useAuth()
  const [visible, setVisible] = useState(true)
  const [lastSync, setLastSync] = useState<string | null>(null)

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

  const handleSignOut = async () => {
    await signOut()
  }

  if (loading) return null

  // Dashboard: if logged in, don't show
  if (compact && user) return null

  // Logged in (Settings only)
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
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Auto-synced across devices</p>
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
        {formattedSync && (
          <p className="text-[10px] text-muted-foreground">Last synced: {formattedSync}</p>
        )}
      </div>
    )
  }

  // Not logged in - prompt
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
