'use client'

import React from 'react'
import { Landmark, Plus, BarChart3, Home, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'

export type TabType = 'dashboard' | 'ledger' | 'accounts' | 'analytics' | 'budgets' | 'bills' | 'subscriptions' | 'goals' | 'debtplanner' | 'categories' | 'receipts' | 'splits' | 'sharedwallets' | 'investments' | 'lending' | 'assets' | 'reports' | 'notifications' | 'csvimport' | 'settings' | 'about' | 'support' | 'faq' | 'health' | 'supportadmin' | 'more' | 'dayview' | 'calendarview' | 'customview';

interface BottomNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onQuickAddClick: () => void;
}

export function BottomNav({ activeTab, setActiveTab, onQuickAddClick }: BottomNavProps) {
  // Live unread notification count for the More badge.
  const unreadCount = useLiveQuery(
    async () => db.notifications.filter(n => !n.read).count(),
    [],
    0
  ) ?? 0

  // Left/right tabs around the center FAB — Home, Analysis, [+], Accounts, More.
  const leftTabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'analytics', label: 'Analysis', icon: BarChart3 },
  ]
  const rightTabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'accounts', label: 'Accounts', icon: Landmark },
  ]

  const renderTab = (tab: { id: TabType; label: string; icon: React.ElementType }) => {
    const Icon = tab.icon
    const isActive = activeTab === tab.id
    return (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        className="relative flex flex-col items-center justify-center gap-0.5 w-16 h-full"
        aria-current={isActive ? 'page' : undefined}
      >
        {/* Active indicator dot */}
        {isActive && (
          <motion.span
            layoutId="nav-active-indicator"
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="absolute top-2 h-1 w-1 rounded-full bg-[#6d5efc]"
          />
        )}
        <motion.div animate={{ y: isActive ? -1 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
          <Icon
            className={cn("h-[22px] w-[22px] transition-colors", isActive ? "text-foreground" : "text-muted-foreground")}
            strokeWidth={isActive ? 2.3 : 1.7}
          />
        </motion.div>
        <span className={cn("text-[10px] transition-colors", isActive ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
          {tab.label}
        </span>
      </button>
    )
  }

  return (
    <>
      {/* Bottom Navigation Bar — 4 tabs + center FAB */}
      <nav className="absolute bottom-0 left-0 right-0 z-30 bg-card border-t border-border/60 safe-bottom" aria-label="Main navigation">
        <div className="flex items-center justify-between h-[72px] px-4">
          {leftTabs.map(renderTab)}

          {/* Center FAB */}
          <motion.button
            onClick={onQuickAddClick}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92, rotate: 90 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            className="flex h-[52px] w-[52px] -mt-5 items-center justify-center rounded-full bg-gradient-to-br from-[#7c6ffd] to-[#5b3df5] text-white shadow-fab ring-4 ring-card"
            aria-label="Add transaction"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </motion.button>

          {rightTabs.map(renderTab)}

          {/* More — opens the full "More" hub page */}
          <button
            onClick={() => setActiveTab('more')}
            className="relative flex flex-col items-center justify-center gap-0.5 w-16 h-full"
            aria-current={activeTab === 'more' ? 'page' : undefined}
            aria-label={unreadCount > 0 ? `Open more menu, ${unreadCount} unread notifications` : 'Open more menu'}
          >
            {activeTab === 'more' && (
              <motion.span
                layoutId="nav-active-indicator"
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                className="absolute top-2 h-1 w-1 rounded-full bg-[#6d5efc]"
              />
            )}
            <div className="relative">
              <motion.div animate={{ y: activeTab === 'more' ? -1 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
                <MoreHorizontal
                  className={cn('h-[22px] w-[22px] transition-colors', activeTab === 'more' ? 'text-foreground' : 'text-muted-foreground')}
                  strokeWidth={activeTab === 'more' ? 2.3 : 1.7}
                />
              </motion.div>
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className={cn('text-[10px] transition-colors', activeTab === 'more' ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>More</span>
          </button>
        </div>
      </nav>
    </>
  )
}
