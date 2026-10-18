'use client'

import React, { useEffect, useRef } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { SyncService, SYNCED_PREFERENCE_LS_KEYS } from '@/services/SyncService'
import { isSupabaseConfigured } from '@/lib/supabase'
import { db } from '@/db/schema'

const DEBOUNCE_MS = 3000 // Wait 3 seconds after last change before pushing

/**
 * Patch localStorage ONCE so same-tab writes to a synced preference key emit a
 * `pennyflow:prefs-changed` event. The native `storage` event only fires in
 * OTHER tabs, so without this a user changing (say) their dashboard layout in
 * the active tab would not trigger a cloud backup until some unrelated DB write
 * or a tab-focus push happened. Idempotent and SSR-safe.
 */
let prefsPatched = false
function patchLocalStorageForPrefSync() {
  if (prefsPatched || typeof window === 'undefined') return
  prefsPatched = true
  const syncedKeys = new Set(SYNCED_PREFERENCE_LS_KEYS)
  const emit = (key: string) => {
    if (syncedKeys.has(key)) {
      window.dispatchEvent(new Event('pennyflow:prefs-changed'))
    }
  }
  const origSet = localStorage.setItem.bind(localStorage)
  const origRemove = localStorage.removeItem.bind(localStorage)
  localStorage.setItem = (key: string, value: string) => {
    origSet(key, value)
    emit(key)
  }
  localStorage.removeItem = (key: string) => {
    origRemove(key)
    emit(key)
  }
}

/**
 * AutoSyncProvider — Cloud sync orchestrator
 *
 * BEHAVIOR:
 * - Guest users (not logged in): No sync. Data stays in local IndexedDB only.
 * - First login (guest had local data): MERGE local into cloud account (local wins).
 * - Login after logout (local is empty): RESTORE from cloud.
 * - Already linked (returning user with data): PUSH to cloud as backup.
 * - On every DB change while logged in: debounced push to cloud.
 * - On tab focus while logged in: push to cloud (never pull/overwrite).
 * - On logout: data is pushed to cloud first, then local is cleared.
 *
 * GUARANTEES:
 * - App updates/deploys NEVER touch user data (local or cloud).
 * - Local data is NEVER overwritten by cloud unless local is confirmed empty.
 * - Guest data is NEVER lost — it migrates to cloud on first login.
 */
export function AutoSyncProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const pushTimer = useRef<NodeJS.Timeout | null>(null)
  const hasInitialized = useRef(false)
  const isSyncing = useRef(false)

  // Patch localStorage once so same-tab preference writes can be detected.
  useEffect(() => {
    patchLocalStorageForPrefSync()
  }, [])

  // On login: sync data based on state
  // Case 1: Guest had local data → push it to their cloud account (migrate guest→cloud)
  // Case 2: Local is empty (fresh login after logout) → restore from cloud
  // Case 3: Already linked, local has data → push as backup
  useEffect(() => {
    if (!isSupabaseConfigured) return
    if (!user || loading) return
    if (hasInitialized.current) return

    const initSync = async () => {
      if (isSyncing.current) return
      isSyncing.current = true
      hasInitialized.current = true

      try {
        const localAccountCount = await db.accounts.count()
        const localTransactionCount = await db.transactions.count()
        const localGoalsCount = await db.goals.count()
        const localBillsCount = await db.bills.count()
        const localHasData = localAccountCount > 0 || localTransactionCount > 0 || localGoalsCount > 0 || localBillsCount > 0

        const isLinked = SyncService.isAccountLinked(user.id)

        if (localHasData && !isLinked) {
          // CASE 1: Guest had data, now logging in for first time
          // Merge: push local data to cloud (local wins), restore cloud-only tables
          await SyncService.mergeLocalIntoCloud(user.id)
          SyncService.markAccountLinked(user.id)
        } else if (localHasData && isLinked) {
          // CASE 3: Already linked user, local has data → just backup to cloud
          await SyncService.pushToCloud(user.id)
        } else if (!localHasData) {
          // CASE 2: Local is empty → restore from cloud
          const result = await SyncService.pullFromCloud(user.id)
          if (result.success && !result.isEmpty) {
            SyncService.markAccountLinked(user.id)
            window.location.reload()
            return
          }
          SyncService.markAccountLinked(user.id)
        }
      } catch {
        // Sync failed silently — local data is safe regardless
      } finally {
        isSyncing.current = false
      }
    }

    initSync()
  }, [user, loading])

  // Auto-push after any local DB change (debounced)
  useEffect(() => {
    if (!isSupabaseConfigured || !user) return

    const debouncedPush = () => {
      if (pushTimer.current) clearTimeout(pushTimer.current)
      pushTimer.current = setTimeout(async () => {
        if (isSyncing.current || !user) return
        isSyncing.current = true
        try {
          await SyncService.pushToCloud(user.id)
        } catch {
          // Push failed silently — will retry on next change
        } finally {
          isSyncing.current = false
        }
      }, DEBOUNCE_MS)
    }

    // Listen to all table changes via Dexie hooks.
    // This list mirrors SyncService.SYNC_TABLES so every table that gets
    // backed up to the cloud also triggers a debounced auto-push when it
    // changes. (supportTickets has its own dedicated cloud sync path.)
    const tables = [
      db.transactions,
      db.accounts,
      db.assets,
      db.lending,
      db.bills,
      db.goals,
      db.budgets,
      db.investments,
      db.customCategories,
      db.tags,
      db.subscriptions,
      db.debts,
      db.splits,
      db.sharedWallets,
      db.notifications,
      db.systemLogs,
      db.financialBriefs,
      db.templates,
      db.userProfile,
    ]

    const hooks: (() => void)[] = []

    tables.forEach((table) => {
      const createHook = () => debouncedPush()
      const updateHook = () => debouncedPush()
      const deleteHook = () => debouncedPush()

      table.hook('creating', createHook)
      table.hook('updating', updateHook)
      table.hook('deleting', deleteHook)

      hooks.push(
        () => table.hook('creating').unsubscribe(createHook),
        () => table.hook('updating').unsubscribe(updateHook),
        () => table.hook('deleting').unsubscribe(deleteHook),
      )
    })

    // Preference/UI data lives in localStorage (dashboard layout, notes,
    // theme, recent searches, ...) and never touches Dexie, so it wouldn't
    // otherwise trigger a push. Listen for cross-tab `storage` events and the
    // same-tab `pennyflow:prefs-changed` event (see patchLocalStorage below)
    // so those changes are backed up too.
    const onStorage = () => debouncedPush()
    window.addEventListener('storage', onStorage)
    window.addEventListener('pennyflow:prefs-changed', onStorage)

    return () => {
      hooks.forEach(unsub => unsub())
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pennyflow:prefs-changed', onStorage)
      if (pushTimer.current) clearTimeout(pushTimer.current)
    }
  }, [user])

  // On app focus: push local changes to cloud (NEVER pull/overwrite)
  // This ensures cloud always has the latest without risking local data
  useEffect(() => {
    if (!isSupabaseConfigured || !user) return
    let lastPushTime = 0
    const MIN_PUSH_INTERVAL = 30000 // 30 seconds

    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && !isSyncing.current && user) {
        const now = Date.now()
        if (now - lastPushTime < MIN_PUSH_INTERVAL) return
        lastPushTime = now
        isSyncing.current = true
        try {
          await SyncService.pushToCloud(user.id)
        } catch {
          // Push failed silently
        } finally {
          isSyncing.current = false
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [user])

  return <>{children}</>
}
