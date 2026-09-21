'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { db } from '@/db/schema'
import { User, Session } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
})

/**
 * Clear all local user data (IndexedDB + localStorage preferences).
 * Called on sign-out so the next user gets a clean slate.
 * Auth-related keys (supabase session) are handled by supabase.auth.signOut().
 */
async function clearLocalUserData() {
  try {
    // Clear all IndexedDB tables
    await db.transactions.clear()
    await db.accounts.clear()
    await db.assets.clear()
    await db.lending.clear()
    await db.bills.clear()
    await db.goals.clear()
    await db.budgets.clear()
    await db.investments.clear()
    await db.customCategories.clear()
    await db.tags.clear()
    await db.notifications.clear()
    await db.financialBriefs.clear()
    await db.systemLogs.clear()
    await db.userProfile.clear()
    await db.debts.clear()
    await db.subscriptions.clear()
    await db.templates.clear()
    await db.splits.clear()
    await db.sharedWallets.clear()
  } catch {
    // If some tables don't exist, that's fine
  }

  // Clear user-specific localStorage (preserve only non-user keys)
  const keysToRemove = [
    'finance-os-profile',
    'finance-os-currency',
    'finance-os-theme',
    'finance-os-notifications',
    'finance-os-onboarding-done',
    'pennyflow-hidden-categories',
    'pennyflow-custom-account-types',
    'pennyflow-hidden-account-types',
    'pennyflow-dash-order',
    'pennyflow-dash-hidden',
    'pennyflow-dash-compact',
    'pennyflow-overview-order',
    'pennyflow-last-sync',
    'pennyflow-account-linked',
    'pennyflow-last-account-id',
    'pennyflow-recurring-last-run',
    'pennyflow-lock-pin-hash',
    'pennyflow-lock-enabled',
    'pennyflow-lock-biometric',
    'pennyflow-last-activity',
    'pennyflow-analytics-order',
  ]
  keysToRemove.forEach(key => localStorage.removeItem(key))
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
  }

  const signOut = async () => {
    // Push latest data to cloud before clearing (so nothing is lost)
    const { SyncService } = await import('@/services/SyncService')
    if (user) {
      await SyncService.pushToCloud(user.id).catch(() => {})
    }

    // Sign out from Supabase
    await supabase.auth.signOut()

    // Clear all local data so next login shows fresh/correct account
    await clearLocalUserData()

    setUser(null)
    setSession(null)

    // Reload app to show clean state
    window.location.reload()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
