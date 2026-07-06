'use client'

import React, { useState } from 'react'
import { LayoutDashboard, Wallet, TrendingUp, Landmark, Settings, Plus, Heart, Calendar, BarChart3, Bell, Target, TrendingDown, Menu, X, Tag, CreditCard, Newspaper } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

export type TabType = 'dashboard' | 'insights' | 'ledger' | 'assets' | 'lending' | 'forecast' | 'bills' | 'budgets' | 'reports' | 'notifications' | 'goals' | 'investments' | 'accounts' | 'categories' | 'brief' | 'settings';

interface BottomNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onQuickAddClick: () => void;
}

const navItems: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'brief', label: 'Financial Brief', icon: Newspaper },
  { id: 'budgets', label: 'Budgets', icon: Wallet },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'investments', label: 'Investments', icon: TrendingDown },
  { id: 'accounts', label: 'Accounts', icon: CreditCard },
  { id: 'notifications', label: 'Alerts', icon: Bell },
  { id: 'insights', label: 'Insights', icon: TrendingUp },
  { id: 'bills', label: 'Bills', icon: Calendar },
  { id: 'ledger', label: 'Ledger', icon: Wallet },
  { id: 'assets', label: 'Assets', icon: Landmark },
  { id: 'lending', label: 'Lending', icon: Heart },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function BottomNav({ activeTab, setActiveTab, onQuickAddClick }: BottomNavProps) {
  const [isOpen, setIsOpen] = useState(false)

  const activeItem = navItems.find((item) => item.id === activeTab)

  const handleNavClick = (tab: TabType) => {
    setActiveTab(tab)
    setIsOpen(false)
  }

  return (
    <>
      {/* Top bar with menu toggle + current section label */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-3 px-5 py-4 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <button
          onClick={() => setIsOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60 text-foreground hover:bg-secondary transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-bold tracking-tight">
          {activeItem?.label ?? 'FinanceOS'}
        </span>
      </div>

      {/* Backdrop overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Left sidebar drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-y-0 left-0 z-50 flex w-[75%] max-w-[280px] flex-col bg-card border-r border-border/50 shadow-2xl"
          >
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-5 py-5 border-b border-border/40">
              <div>
                <h2 className="text-base font-bold tracking-tight">FinanceOS</h2>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Personal Finance</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary transition-colors"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition-all',
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="tracking-tight">{item.label}</span>
                    {isActive && <span className="ml-auto h-2 w-2 rounded-full bg-primary" />}
                  </button>
                )
              })}
            </nav>

            {/* Quick add button */}
            <div className="p-4 border-t border-border/40">
              <button
                onClick={() => {
                  setIsOpen(false)
                  onQuickAddClick()
                }}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-lg"
              >
                <Plus className="h-5 w-5" />
                Add Transaction
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Floating Quick Add button (always visible) */}
      <button
        onClick={onQuickAddClick}
        className="absolute bottom-6 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 active:scale-95 transition-transform border-4 border-background"
        aria-label="Quick Add"
      >
        <Plus className="h-7 w-7" />
      </button>
    </>
  )
}
