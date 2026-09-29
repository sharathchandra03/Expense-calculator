'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { db } from '@/db/schema'
import { User, Session } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  isConfigured: boolean
  signInWithGoogle: () => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isConfigured: false,
  signInWithGoogle: async () => ({}),
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
    'pennyflow-category-order',
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

/**
 * Remove OAuth artifacts (?code=, ?state=, #access_token=...) from the URL
 * after the session has been established, without triggering a navigation.
 * Preserves any legitimate app params (e.g. ?tab=, ?action=).
 */
function cleanOAuthParamsFromUrl() {
  try {
    const url = new URL(window.location.href)
    const oauthParams = ['code', 'state', 'error', 'error_description', 'provider_token']
    let changed = false
    oauthParams.forEach((p) => {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p)
        changed = true
      }
    })
    // Implicit-flow tokens land in the hash fragment.
    if (url.hash && /access_token|refresh_token|expires_in/.test(url.hash)) {
      url.hash = ''
      changed = true
    }
    if (changed) {
      window.history.replaceState({}, '', url.toString())
    }
  } catch {
    // Non-fatal — URL cleanup is cosmetic.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // No credentials — run fully local, don't attempt any auth calls.
      setLoading(false)
      return
    }

    // Get initial session. With detectSessionInUrl + PKCE, the client
    // exchanges the OAuth `?code=` here before resolving the session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (session) cleanOAuthParamsFromUrl()
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (session) cleanOAuthParamsFromUrl()
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async (): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured) {
      return { error: 'Cloud sync is not configured. Missing Supabase credentials.' }
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Return to a clean origin so the OAuth code param doesn't collide
        // with the app's own ?tab= / ?action= handling.
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
    if (error) {
      return { error: error.message }
    }
    // On success the browser redirects to Google; nothing else to do here.
    return {}
  }

  const signOut = async () => {
    // Push latest data to cloud before clearing (so nothing is lost)
    const { SyncService } = await import('@/services/SyncService')
    if (user) {
      await SyncService.pushToCloud(user.id).catch(() => {})
    }

    // Sign out from Supabase
    if (isSupabaseConfigured) {
      await supabase.auth.signOut().catch(() => {})
    }

    // Clear all local data so next login shows fresh/correct account
    await clearLocalUserData()

    setUser(null)
    setSession(null)

    // Reload app to show clean state
    window.location.reload()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, isConfigured: isSupabaseConfigured, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
