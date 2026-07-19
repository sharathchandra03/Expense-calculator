'use client'

import React, { useState } from 'react'
import { LayoutDashboard, Wallet, TrendingUp, Landmark, Settings, Plus, Heart, Calendar, BarChart3, Bell, Target, TrendingDown, X, Tag, CreditCard, Users, Camera, Upload, Home, Clock, User, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

export type TabType = 'dashboard' | 'ledger' | 'accounts' | 'analytics' | 'budgets' | 'bills' | 'subscriptions' | 'goals' | 'debtplanner' | 'categories' | 'receipts' | 'splits' | 'investments' | 'lending' | 'assets' | 'reports' | 'notifications' | 'csvimport' | 'settings' | 'about';

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
  // Money
  { id: 'budgets', label: 'Budgets', icon: Wallet },
  { id: 'bills', label: 'Bills', icon: Calendar },
  { id: 'subscriptions', label: 'Subscriptions', icon: RefreshCw },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'debtplanner', label: 'Debt Planner', icon: TrendingDown },
  // Tracking
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'categories', label: 'Categories', icon: Tag },
  { id: 'receipts', label: 'Receipts', icon: Camera },
  { id: 'splits', label: 'Split Expenses', icon: Users },
  // Assets
  { id: 'accounts', label: 'Accounts', icon: CreditCard },
  { id: 'investments', label: 'Investments', icon: TrendingUp },
  { id: 'lending', label: 'Lending', icon: Heart },
  { id: 'assets', label: 'Assets', icon: Landmark },
  // Tools
  { id: 'csvimport', label: 'Import & Export', icon: Upload },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  // App
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'about', label: 'About PennyFlow', icon: Heart },
]

export function BottomNav({ activeTab, setActiveTab, onQuickAddClick }: BottomNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [navItems] = useState<NavItem[]>(DEFAULT_NAV_ITEMS)

  const handleNavClick = (tab: TabType) => {
    setActiveTab(tab)
    setIsOpen(false)
  }

  // Left/right tabs around the center FAB — matching reference exactly: Home, History, [+], Cards, Profile
  const leftTabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'ledger', label: 'History', icon: Clock },
  ]
  const rightTabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'accounts', label: 'Cards', icon: CreditCard },
  ]

  const renderTab = (tab: { id: TabType; label: string; icon: React.ElementType }) => {
    const Icon = tab.icon
    const isActive = activeTab === tab.id
    return (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        className="flex flex-col items-center justify-center gap-0.5 w-16 h-full"
      >
        <Icon
          className={cn("h-[22px] w-[22px]", isActive ? "text-foreground" : "text-muted-foreground")}
          strokeWidth={isActive ? 2.3 : 1.7}
        />
        <span className={cn("text-[10px]", isActive ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
          {tab.label}
        </span>
      </button>
    )
  }

  return (
    <>
      {/* Bottom Navigation Bar — 4 tabs + center FAB */}
      <div className="absolute bottom-0 left-0 right-0 z-30 bg-card border-t border-border/60 safe-bottom">
        <div className="flex items-center justify-between h-[72px] px-4">
          {leftTabs.map(renderTab)}

          {/* Center FAB */}
          <button
            onClick={onQuickAddClick}
            className="flex h-[52px] w-[52px] -mt-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-fab"
            aria-label="Add transaction"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>

          {rightTabs.map(renderTab)}

          {/* Profile — opens drawer */}
          <button
            onClick={() => setIsOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 w-16 h-full"
          >
            <User className="h-[22px] w-[22px] text-muted-foreground" strokeWidth={1.7} />
            <span className="text-[10px] font-medium text-muted-foreground">Profile</span>
          </button>
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
            className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="absolute inset-y-0 right-0 z-50 flex w-[82%] max-w-[300px] flex-col bg-background"
          >
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-border/50">
              <div className="flex items-center gap-3">
                <img 
                  src="/Favicon assets/android-chrome-192x192.png" 
                  alt="PennyFlow" 
                  className="w-8 h-8 rounded-lg object-contain"
                />
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">PennyFlow</h2>
                  <p className="text-[10px] text-muted-foreground">Personal Finance</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-secondary transition-colors"
                aria-label="Close menu"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Reorder toggle */}
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold text-foreground/70 uppercase tracking-wide">Menu</span>
            </div>

            {/* Nav items — organized by sections */}
            <nav className="flex-1 overflow-y-auto px-3 pb-4">
              {/* Section: Money */}
              <p className="px-3 pt-3 pb-1.5 text-[10px] font-bold text-foreground/70 uppercase tracking-wider">Money</p>
              {navItems.slice(0, 5).map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button key={item.id} onClick={() => handleNavClick(item.id)} className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors', isActive ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
                    <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </button>
                )
              })}

              {/* Section: Tracking */}
              <p className="px-3 pt-4 pb-1.5 text-[10px] font-bold text-foreground/70 uppercase tracking-wider">Tracking</p>
              {navItems.slice(5, 9).map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button key={item.id} onClick={() => handleNavClick(item.id)} className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors', isActive ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
                    <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </button>
                )
              })}

              {/* Section: Assets */}
              <p className="px-3 pt-4 pb-1.5 text-[10px] font-bold text-foreground/70 uppercase tracking-wider">Assets</p>
              {navItems.slice(9, 13).map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button key={item.id} onClick={() => handleNavClick(item.id)} className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors', isActive ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
                    <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </button>
                )
              })}

              {/* Section: Tools */}
              <p className="px-3 pt-4 pb-1.5 text-[10px] font-bold text-foreground/70 uppercase tracking-wider">Tools</p>
              {navItems.slice(13).map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button key={item.id} onClick={() => handleNavClick(item.id)} className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors', isActive ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
                    <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </nav>

            {/* Quick add in sidebar */}
            <div className="p-4 border-t border-border/50">
              <button
                onClick={() => {
                  setIsOpen(false)
                  onQuickAddClick()
                }}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground font-medium text-[13px] hover:opacity-90 active:scale-[0.98] transition-all"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Add Transaction
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
