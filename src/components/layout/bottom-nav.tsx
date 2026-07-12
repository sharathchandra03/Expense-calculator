'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { LayoutDashboard, Wallet, TrendingUp, Landmark, Settings, Plus, Heart, Calendar, BarChart3, Bell, Target, TrendingDown, Menu, X, Tag, CreditCard, Newspaper, Info, Users, Globe, Camera, Trophy, RefreshCw, Shield, IndianRupee, LineChart, Upload, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import { BudgetBar } from '@/components/ui/budget-bar'

export type TabType = 'dashboard' | 'analytics' | 'insights' | 'ledger' | 'assets' | 'lending' | 'forecast' | 'bills' | 'budgets' | 'reports' | 'notifications' | 'goals' | 'investments' | 'accounts' | 'categories' | 'brief' | 'settings' | 'about' | 'splits' | 'converter' | 'debtplanner' | 'budgetactual' | 'receipts' | 'achievements' | 'subscriptions' | 'sharedwallets' | 'taxhelper' | 'networth' | 'csvimport';

interface BottomNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onQuickAddClick: () => void;
}

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ElementType;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
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
  { id: 'splits', label: 'Split Expenses', icon: Users },
  { id: 'receipts', label: 'Receipt Gallery', icon: Camera },
  { id: 'converter', label: 'Currency Converter', icon: Globe },
  { id: 'debtplanner', label: 'Debt Planner', icon: TrendingDown },
  { id: 'budgetactual', label: 'Budget vs Actual', icon: BarChart3 },
  { id: 'achievements', label: 'Achievements', icon: Trophy },
  { id: 'subscriptions', label: 'Subscriptions', icon: RefreshCw },
  { id: 'sharedwallets', label: 'Shared Wallets', icon: Users },
  { id: 'taxhelper', label: 'Tax Helper', icon: IndianRupee },
  { id: 'networth', label: 'Net Worth Timeline', icon: LineChart },
  { id: 'csvimport', label: 'Import CSV', icon: Upload },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'about', label: 'About PennyFlow', icon: Info },
]

const NAV_ORDER_KEY = 'pennyflow-nav-order'

function getStoredOrder(): TabType[] | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(NAV_ORDER_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return null
}

function saveOrder(order: TabType[]) {
  try {
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order))
  } catch {}
}

export function BottomNav({ activeTab, setActiveTab, onQuickAddClick }: BottomNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isReordering, setIsReordering] = useState(false)
  const [navItems, setNavItems] = useState<NavItem[]>(DEFAULT_NAV_ITEMS)

  // Load stored order on mount
  useEffect(() => {
    const storedOrder = getStoredOrder()
    if (storedOrder) {
      // Rebuild nav items based on stored order, filtering out any that don't exist
      const ordered: NavItem[] = []
      for (const id of storedOrder) {
        const item = DEFAULT_NAV_ITEMS.find(i => i.id === id)
        if (item) ordered.push(item)
      }
      // Add any new items not in stored order
      for (const item of DEFAULT_NAV_ITEMS) {
        if (!ordered.find(i => i.id === item.id)) {
          ordered.push(item)
        }
      }
      setNavItems(ordered)
    }
  }, [])

  const handleReorder = (newItems: NavItem[]) => {
    setNavItems(newItems)
    saveOrder(newItems.map(i => i.id))
  }

  const activeItem = navItems.find((item) => item.id === activeTab)

  const handleNavClick = (tab: TabType) => {
    if (isReordering) return
    setActiveTab(tab)
    setIsOpen(false)
  }

  return (
    <>
      {/* Top bar with menu toggle + current section label */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={() => setIsOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60 text-foreground hover:bg-secondary transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img 
            src="/app-assets/pennyflow-logo.png" 
            alt="PennyFlow" 
            className="w-7 h-7 rounded-lg object-contain"
          />
          <span className="text-sm font-bold tracking-tight">
            {activeItem?.label ?? 'PennyFlow'}
          </span>
        </div>
        {/* Budget awareness bar */}
        <div className="px-5 pb-2">
          <BudgetBar />
        </div>
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
              <div className="flex items-center space-x-3">
                <img 
                  src="/app-assets/pennyflow-logo.png" 
                  alt="PennyFlow" 
                  className="w-9 h-9 rounded-xl object-contain"
                />
                <div>
                  <h2 className="text-base font-bold tracking-tight">PennyFlow</h2>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Personal Finance</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary transition-colors"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Reorder toggle */}
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Navigation</span>
              <button
                onClick={() => setIsReordering(!isReordering)}
                className={cn(
                  "text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors",
                  isReordering ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isReordering ? 'Done' : 'Reorder'}
              </button>
            </div>

            {/* Nav items - draggable */}
            <nav className="flex-1 overflow-y-auto px-3 py-2">
              {isReordering ? (
                <Reorder.Group
                  axis="y"
                  values={navItems}
                  onReorder={handleReorder}
                  className="space-y-1"
                >
                  {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = activeTab === item.id
                    return (
                      <Reorder.Item
                        key={item.id}
                        value={item}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition-all cursor-grab active:cursor-grabbing',
                          isActive
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                        )}
                      >
                        <GripVertical className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                        <Icon className="h-5 w-5 flex-shrink-0" />
                        <span className="tracking-tight">{item.label}</span>
                      </Reorder.Item>
                    )
                  })}
                </Reorder.Group>
              ) : (
                <div className="space-y-1">
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
                </div>
              )}
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
