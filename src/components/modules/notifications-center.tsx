'use client'

import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Bell, Trash2, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { NotificationService } from '@/services/NotificationService'

export function NotificationsCenter() {
  const notifications = useLiveQuery(() => db.notifications.orderBy('timestamp').reverse().toArray()) ?? []
  const safeNotifications = Array.isArray(notifications) ? notifications : []

  const unreadCount = NotificationService.getUnreadCount(safeNotifications)
  const grouped = NotificationService.groupByType(safeNotifications)

  const handleMarkAsRead = async (id: string) => {
    const notif = safeNotifications.find(n => n.id === id)
    if (notif) {
      await db.notifications.update(id, { read: true })
    }
  }

  const handleMarkAllAsRead = async () => {
    const updates = safeNotifications
      .filter(n => !n.read)
      .map(n => db.notifications.update(n.id, { read: true }))
    await Promise.all(updates)
  }

  const handleDelete = async (id: string) => {
    await db.notifications.delete(id)
  }

  const handleDeleteAll = async () => {
    if (confirm('Clear all notifications?')) {
      await Promise.all(safeNotifications.map(n => db.notifications.delete(n.id)))
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'bill_due': return '📋'
      case 'budget_warning': return '⚠️'
      case 'goal_progress': return '🎯'
      case 'transaction': return '💰'
      default: return '📢'
    }
  }

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Notifications</h1>
          <p className="text-xs text-muted-foreground">
            {unreadCount} unread • {safeNotifications.length} total
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="text-xs px-3 py-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            Mark All Read
          </button>
        )}
      </div>

      {/* Notification Groups */}
      {safeNotifications.length > 0 ? (
        <div className="space-y-4">
          {Object.entries(grouped).map(([type, notifs]) => (
            <div key={type} className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase">{type.replace('_', ' ')}</p>
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {notifs.map((notif, idx) => (
                    <motion.div
                      key={notif.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={cn(
                        'p-4 rounded-2xl border transition-all',
                        notif.read
                          ? 'bg-card/50 border-border/30 opacity-75'
                          : 'bg-card border-border/50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getNotificationIcon(notif.type)}</span>
                            <p className="text-sm font-bold">{notif.title}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{notif.message}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-2">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {new Date(notif.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {!notif.read && (
                            <button
                              onClick={() => handleMarkAsRead(notif.id)}
                              className="p-2 hover:bg-primary/10 rounded-lg transition-colors"
                              title="Mark as read"
                            >
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(notif.id)}
                            className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}

          {safeNotifications.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="w-full h-10 rounded-full border border-destructive/30 text-destructive text-xs font-semibold uppercase tracking-wider hover:bg-destructive/10 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      ) : (
        <div className="text-center py-12 bg-secondary/20 rounded-3xl border border-dashed border-border/50">
          <Bell className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs font-bold text-muted-foreground">No notifications</p>
          <p className="text-[10px] text-muted-foreground/75 mt-1">Your notifications will appear here</p>
        </div>
      )}
    </div>
  )
}
