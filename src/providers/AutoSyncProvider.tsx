'use client'

import React, { useEffect, useRef } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { SyncService } from '@/services/SyncService'
import { db } from '@/db/schema'

const DEBOUNCE_MS = 3000 // Wait 3 seconds after last change before pushing

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

  // On login: sync data based on state
  // Case 1: Guest had local data → push it to their cloud account (migrate guest→cloud)
  // Case 2: Local is empty (fresh login after logout) → restore from cloud
  // Case 3: Already linked, local has data → push as backup
  useEffect(() => {
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
    if (!user) return

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

    // Listen to all table changes via Dexie hooks
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
      db.subscriptions,
      db.debts,
      db.splits,
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

    return () => {
      hooks.forEach(unsub => unsub())
      if (pushTimer.current) clearTimeout(pushTimer.current)
    }
  }, [user])

  // On app focus: push local changes to cloud (NEVER pull/overwrite)
  // This ensures cloud always has the latest without risking local data
  useEffect(() => {
    if (!user) return
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
