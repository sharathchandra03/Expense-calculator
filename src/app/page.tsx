'use client'

import React, { useState, useEffect } from 'react'
import { seedDatabaseIfEmpty } from '@/db/schema'
import { BottomNav, TabType } from '@/components/layout/bottom-nav'
import { Dashboard } from '@/components/modules/dashboard'
import { TransactionsLedger } from '@/components/modules/transactions-ledger'
import { AssetsTracker } from '@/components/modules/assets-tracker'
import { Settings } from '@/components/modules/settings'
import { LendingDashboard } from '@/components/modules/lending-dashboard'
import { GlobalSearch } from '@/components/modules/global-search'
import { Onboarding } from '@/components/modules/onboarding'
import { QuickAddModal } from '@/components/modules/quick-add-modal'
import { BillsManager } from '@/components/modules/bills-manager'
import { BudgetManager } from '@/components/modules/budget-manager'
import { FinancialReports } from '@/components/modules/financial-reports'
import { NotificationsCenter } from '@/components/modules/notifications-center'
import { GoalsDashboard } from '@/components/modules/goals-dashboard'
import { InvestmentTracker } from '@/components/modules/investment-tracker'
import { CustomCategories } from '@/components/modules/custom-categories'
import { AccountManager } from '@/components/modules/account-manager'
import { Analytics } from '@/components/modules/analytics'
import { SplitExpenses } from '@/components/modules/split-expenses'
import { DebtPlanner } from '@/components/modules/debt-planner'
import { ReceiptGallery } from '@/components/modules/receipt-gallery'
import { RecurringTransactionService } from '@/services/RecurringTransactionService'
import { SubscriptionTracker } from '@/components/modules/subscriptions'
import { CSVImport } from '@/components/modules/csv-import'
import { AboutApp } from '@/components/modules/about-app'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState(true)
  const [dbReady, setDbReady] = useState(false)

  // Browser history management for mobile back button
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    // Push a new history state so back button navigates within the app
    if (tab !== 'dashboard') {
      window.history.pushState({ tab }, '', `?tab=${tab}`)
    }
  }

  // Handle browser back button (popstate)
  useEffect(() => {
    // Push initial state for dashboard
    window.history.replaceState({ tab: 'dashboard' }, '', window.location.pathname)

    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.tab) {
        setActiveTab(event.state.tab)
      } else {
        // No state means we're at the root - go to dashboard
        setActiveTab('dashboard')
        // Push state again to prevent closing app on next back press
        window.history.pushState({ tab: 'dashboard' }, '', window.location.pathname)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Seed database on mount
  useEffect(() => {
    // Clear old service worker caches and force fresh load
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => reg.unregister())
      })
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)))
      }
    }

    async function initDB() {
      try {
        await seedDatabaseIfEmpty()
        setDbReady(true)

        // Phase 1.1: Process recurring transactions on app load
        RecurringTransactionService.processRecurrences().then(count => {
          if (count > 0) {
            console.log(`[PennyFlow] Auto-logged ${count} recurring transaction(s)`)
          }
        }).catch(err => console.error('Recurring transaction check failed:', err))
      } catch (err) {
        console.error('Failed to initialize database:', err)
        setDbReady(true) // continue anyway
      }
    }
    initDB()

    // Check if first time
    const hasSeenOnboarding = localStorage.getItem('finance-os-onboarding-done')
    if (hasSeenOnboarding) {
      setIsFirstTime(false)
    }

    // Phase 13: Handle PWA shortcut URL params
    const urlParams = new URLSearchParams(window.location.search)
    const action = urlParams.get('action')
    if (action === 'add-expense') {
      setIsQuickAddOpen(true)
    } else if (action === 'view-balance') {
      setActiveTab('accounts')
      window.history.pushState({ tab: 'accounts' }, '', '?tab=accounts')
    }

    // Register Service Worker for PWA in production only
    if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[PennyFlow] Service worker registered')
      }).catch((err) => {
        console.error('[PennyFlow] SW registration failed:', err)
      })
    }

    // Global keyboard shortcut for search (Cmd+K or Ctrl+K)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (!dbReady) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white text-foreground">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 rounded-full border-4 border-t-[#6d5efc] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Loading...
          </p>
        </div>
      </div>
    )
  }

  // Active module renderer
  const renderModule = () => {
    try {
      switch (activeTab) {
        case 'dashboard':
          return <Dashboard key="dashboard" onNavigateToTab={(tab) => handleTabChange(tab)} />
        case 'ledger':
          return <TransactionsLedger key="ledger" onNavigateToTab={(tab) => handleTabChange(tab as any)} />
        case 'accounts':
          return <AccountManager key="accounts" />
        case 'analytics':
          return <Analytics key="analytics" />
        case 'budgets':
          return <BudgetManager key="budgets" />
        case 'bills':
          return <BillsManager key="bills" />
        case 'subscriptions':
          return <SubscriptionTracker key="subscriptions" />
        case 'goals':
          return <GoalsDashboard key="goals" />
        case 'debtplanner':
          return <DebtPlanner key="debtplanner" />
        case 'categories':
          return <CustomCategories key="categories" />
        case 'receipts':
          return <ReceiptGallery key="receipts" />
        case 'splits':
          return <SplitExpenses key="splits" />
        case 'investments':
          return <InvestmentTracker key="investments" />
        case 'lending':
          return <LendingDashboard key="lending" />
        case 'assets':
          return <AssetsTracker key="assets" />
        case 'reports':
          return <FinancialReports key="reports" />
        case 'notifications':
          return <NotificationsCenter key="notifications" />
        case 'csvimport':
          return <CSVImport key="csvimport" />
        case 'settings':
          return <Settings key="settings" />
        case 'about':
          return <AboutApp key="about" />
        default:
          return <Dashboard key="dashboard" onNavigateToTab={(tab) => handleTabChange(tab)} />
      }
    } catch (error) {
      console.error('Error rendering module:', error)
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <p className="text-sm text-muted-foreground">Error loading module</p>
          <button
            onClick={() => handleTabChange('dashboard')}
            className="text-xs px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      )
    }
  }

  // Dashboard has its own full-bleed purple hero; other modules get standard padding
  const isDashboard = activeTab === 'dashboard'

  return (
    <div className="min-h-screen bg-[#e8e8ec] flex items-center justify-center p-0 md:p-6">
      {/* Desktop phone frame / Mobile fullbleed */}
      <div className="w-full h-[100dvh] md:h-[860px] md:max-w-[400px] md:rounded-[2.5rem] bg-background text-foreground md:shadow-elevated overflow-hidden relative flex flex-col">

        {/* Scrollable content area */}
        <div className="flex-1 w-full overflow-y-auto pb-28 bg-background">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn("w-full", !isDashboard && "px-5 pt-6")}
            >
              {renderModule()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <BottomNav
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          onQuickAddClick={() => setIsQuickAddOpen(true)}
        />

        {/* Global Quick Add Dialog */}
        <QuickAddModal
          isOpen={isQuickAddOpen}
          onClose={() => setIsQuickAddOpen(false)}
        />

        {/* Global Search Dialog */}
        <GlobalSearch
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />

        {/* Onboarding Tutorial */}
        <Onboarding
          isFirstTime={isFirstTime}
          onComplete={() => setIsFirstTime(false)}
        />
      </div>
    </div>
  )
}

