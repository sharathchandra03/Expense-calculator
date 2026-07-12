'use client'

import React, { useState, useEffect } from 'react'
import { seedDatabaseIfEmpty } from '@/db/schema'
import { BottomNav, TabType } from '@/components/layout/bottom-nav'
import { Dashboard } from '@/components/modules/dashboard'
import { TransactionsLedger } from '@/components/modules/transactions-ledger'
import { AssetsTracker } from '@/components/modules/assets-tracker'
import { ForecastEngine } from '@/components/modules/forecast-engine'
import { Settings } from '@/components/modules/settings'
import { SpendingIntelligence } from '@/components/modules/spending-intelligence'
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
import { WeeklyBrief } from '@/components/modules/weekly-brief'
import { Analytics } from '@/components/modules/analytics'
import { AboutApp } from '@/components/modules/about-app'
import { SplitExpenses } from '@/components/modules/split-expenses'
import { CurrencyConverter } from '@/components/modules/currency-converter'
import { DebtPlanner } from '@/components/modules/debt-planner'
import { BudgetVsActual } from '@/components/modules/budget-vs-actual'
import { ReceiptGallery } from '@/components/modules/receipt-gallery'
import { RecurringTransactionService } from '@/services/RecurringTransactionService'
import { Achievements } from '@/components/modules/achievements'
import { SubscriptionTracker } from '@/components/modules/subscriptions'
import { SharedWallets } from '@/components/modules/shared-wallets'
import { TaxHelper } from '@/components/modules/tax-helper'
import { NetWorthTimeline } from '@/components/modules/networth-timeline'
import { CSVImport } from '@/components/modules/csv-import'
import { AnimatePresence, motion } from 'framer-motion'

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
        console.log('PWA Service Worker registered successfully:', reg.scope)
      }).catch((err) => {
        console.error('PWA Service Worker registration failed:', err)
      })
    }

    // Programmatically unregister service workers in development to prevent HMR loop
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().then((success) => {
            if (success) {
              console.log('Successfully unregistered stale service worker in development');
              // Clear caches as well to restore clean state
              if ('caches' in window) {
                caches.keys().then((keys) => {
                  keys.forEach((key) => caches.delete(key));
                });
              }
            }
          });
        }
      });
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
      <div className="flex flex-1 items-center justify-center bg-[#050505] text-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 rounded-full border-4 border-t-primary border-r-transparent animate-spin" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            PennyFlow Initializing...
          </p>
        </div>
      </div>
    )
  }

  // Active module renderer with error handling
  const renderModule = () => {
    try {
      switch (activeTab) {
        case 'dashboard':
          return <Dashboard key="dashboard" onNavigateToTab={(tab) => handleTabChange(tab)} />
        case 'insights':
          return <SpendingIntelligence key="insights" />
        case 'ledger':
          return <TransactionsLedger key="ledger" onNavigateToTab={(tab) => handleTabChange(tab as any)} />
        case 'assets':
          return <AssetsTracker key="assets" />
        case 'lending':
          return <LendingDashboard key="lending" />
        case 'bills':
          return <BillsManager key="bills" />
        case 'budgets':
          return <BudgetManager key="budgets" />
        case 'reports':
          return <FinancialReports key="reports" />
        case 'notifications':
          return <NotificationsCenter key="notifications" />
        case 'goals':
          return <GoalsDashboard key="goals" />
        case 'investments':
          return <InvestmentTracker key="investments" />
        case 'accounts':
          return <AccountManager key="accounts" />
        case 'categories':
          return <CustomCategories key="categories" />
        case 'brief':
          return <WeeklyBrief key="brief" />
        case 'analytics':
          return <Analytics key="analytics" />
        case 'settings':
          return <Settings key="settings" />
        case 'about':
          return <AboutApp key="about" />
        case 'splits':
          return <SplitExpenses key="splits" />
        case 'converter':
          return <CurrencyConverter key="converter" />
        case 'debtplanner':
          return <DebtPlanner key="debtplanner" />
        case 'budgetactual':
          return <BudgetVsActual key="budgetactual" />
        case 'receipts':
          return <ReceiptGallery key="receipts" />
        case 'achievements':
          return <Achievements key="achievements" />
        case 'subscriptions':
          return <SubscriptionTracker key="subscriptions" />
        case 'sharedwallets':
          return <SharedWallets key="sharedwallets" />
        case 'taxhelper':
          return <TaxHelper key="taxhelper" />
        case 'networth':
          return <NetWorthTimeline key="networth" />
        case 'csvimport':
          return <CSVImport key="csvimport" />
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

  return (
    <div className="min-h-screen bg-neutral-900/10 dark:bg-black/90 flex items-center justify-center p-0 md:p-6 transition-colors duration-300">
      {/* Desktop Container Wrapper Mockup / Mobile Fullbleed */}
      <div className="w-full h-[100dvh] md:h-[850px] md:max-w-md md:rounded-[3rem] bg-background text-foreground md:border border-border/80 dark:border-border/40 md:shadow-2xl overflow-hidden relative flex flex-col">

        {/* Navigation: pinned top bar + slide-in sidebar + floating add button */}
        <BottomNav
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          onQuickAddClick={() => setIsQuickAddOpen(true)}
        />

        {/* Scrollable content area (top bar stays pinned above it) */}
        <div className="flex-1 w-full overflow-y-auto px-5 pt-24 pb-28">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="w-full"
            >
              {renderModule()}
            </motion.div>
          </AnimatePresence>
        </div>

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

