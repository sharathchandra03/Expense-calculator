'use client'

import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { seedDatabaseIfEmpty } from '@/db/schema'
import { BottomNav, TabType } from '@/components/layout/bottom-nav'
import { Dashboard } from '@/components/modules/dashboard'
import { RecurringTransactionService } from '@/services/RecurringTransactionService'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// Code-split all secondary modules (loaded on demand)
const TransactionsLedger = dynamic(() => import('@/components/modules/transactions-ledger').then(m => ({ default: m.TransactionsLedger })), { ssr: false })
const AssetsTracker = dynamic(() => import('@/components/modules/assets-tracker').then(m => ({ default: m.AssetsTracker })), { ssr: false })
const Settings = dynamic(() => import('@/components/modules/settings').then(m => ({ default: m.Settings })), { ssr: false })
const LendingDashboard = dynamic(() => import('@/components/modules/lending-dashboard').then(m => ({ default: m.LendingDashboard })), { ssr: false })
const GlobalSearch = dynamic(() => import('@/components/modules/global-search').then(m => ({ default: m.GlobalSearch })), { ssr: false })
const Onboarding = dynamic(() => import('@/components/modules/onboarding').then(m => ({ default: m.Onboarding })), { ssr: false })
const QuickAddModal = dynamic(() => import('@/components/modules/quick-add-modal').then(m => ({ default: m.QuickAddModal })), { ssr: false })
const BillsManager = dynamic(() => import('@/components/modules/bills-manager').then(m => ({ default: m.BillsManager })), { ssr: false })
const BudgetManager = dynamic(() => import('@/components/modules/budget-manager').then(m => ({ default: m.BudgetManager })), { ssr: false })
const FinancialReports = dynamic(() => import('@/components/modules/financial-reports').then(m => ({ default: m.FinancialReports })), { ssr: false })
const NotificationsCenter = dynamic(() => import('@/components/modules/notifications-center').then(m => ({ default: m.NotificationsCenter })), { ssr: false })
const GoalsDashboard = dynamic(() => import('@/components/modules/goals-dashboard').then(m => ({ default: m.GoalsDashboard })), { ssr: false })
const InvestmentTracker = dynamic(() => import('@/components/modules/investment-tracker').then(m => ({ default: m.InvestmentTracker })), { ssr: false })
const CustomCategories = dynamic(() => import('@/components/modules/custom-categories').then(m => ({ default: m.CustomCategories })), { ssr: false })
const AccountManager = dynamic(() => import('@/components/modules/account-manager').then(m => ({ default: m.AccountManager })), { ssr: false })
const Analytics = dynamic(() => import('@/components/modules/analytics').then(m => ({ default: m.Analytics })), { ssr: false })
const SplitExpenses = dynamic(() => import('@/components/modules/split-expenses').then(m => ({ default: m.SplitExpenses })), { ssr: false })
const DebtPlanner = dynamic(() => import('@/components/modules/debt-planner').then(m => ({ default: m.DebtPlanner })), { ssr: false })
const ReceiptGallery = dynamic(() => import('@/components/modules/receipt-gallery').then(m => ({ default: m.ReceiptGallery })), { ssr: false })
const SubscriptionTracker = dynamic(() => import('@/components/modules/subscriptions').then(m => ({ default: m.SubscriptionTracker })), { ssr: false })
const CSVImport = dynamic(() => import('@/components/modules/csv-import').then(m => ({ default: m.CSVImport })), { ssr: false })
const AboutApp = dynamic(() => import('@/components/modules/about-app').then(m => ({ default: m.AboutApp })), { ssr: false })
const HelpSupport = dynamic(() => import('@/components/modules/help-support').then(m => ({ default: m.HelpSupport })), { ssr: false })

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

        // Process recurring transactions on app load
        RecurringTransactionService.processRecurrences().catch(() => {})
      } catch {
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
      navigator.serviceWorker.register('/sw.js').catch(() => {})
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
      <div className="flex flex-1 items-center justify-center bg-background text-foreground">
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
        case 'support':
          return <HelpSupport key="support" />
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
    <div className="min-h-screen bg-[#e8e8ec] dark:bg-[#050505] flex items-center justify-center p-0 md:p-6">
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

