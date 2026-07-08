'use client'

import React, { useEffect, useRef } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { SyncService } from '@/services/SyncService'
import { db } from '@/db/schema'

const DEBOUNCE_MS = 3000 // Wait 3 seconds after last change before pushing

export function AutoSyncProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const pushTimer = useRef<NodeJS.Timeout | null>(null)
  const hasPulled = useRef(false)
  const isSyncing = useRef(false)

  // On login: smart sync (pull if empty, push if has data)
  useEffect(() => {
    if (!user || loading) return
    if (hasPulled.current) return

    const smartSync = async () => {
      if (isSyncing.current) return
      isSyncing.current = true
      hasPulled.current = true

      try {
        const localAccountCount = await db.accounts.count()
        const localTransactionCount = await db.transactions.count()
        const localHasData = localAccountCount > 0 || localTransactionCount > 0

        if (!localHasData) {
          // New device → pull from cloud
          const result = await SyncService.pullFromCloud(user.id)
          if (result.success && !result.isEmpty) {
            // Reload to show pulled data
            window.location.reload()
          }
        } else {
          // Has local data → push to cloud
          await SyncService.pushToCloud(user.id)
        }
      } catch (err) {
        console.error('Auto sync failed:', err)
      } finally {
        isSyncing.current = false
      }
    }

    smartSync()
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
        } catch (err) {
          console.error('Auto push failed:', err)
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

  // On app focus (user switches back to tab) → pull latest from cloud
  useEffect(() => {
    if (!user) return

    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && !isSyncing.current && user) {
        isSyncing.current = true
        try {
          await SyncService.pullFromCloud(user.id)
        } catch (err) {
          console.error('Pull on focus failed:', err)
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
