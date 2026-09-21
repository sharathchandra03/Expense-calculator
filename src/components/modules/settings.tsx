'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { db, getProfile, saveProfile } from '@/db/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { SyncCard } from '@/components/ui/sync-card'
import { invalidateCurrencyCache, cn } from '@/lib/utils'
import { useTheme } from '@/providers/ThemeProvider'
import { 
  User, Mail, Globe, Palette, Download, Upload, Settings as SettingsIcon,
  Bell, Lock, Trash2, LogOut, ArrowRight, Check, X, ChevronRight,
  FileJson, Database, RotateCcw, Camera, Image, Fingerprint,
  Sliders, Clock, LayoutDashboard, BarChart3, SortDesc, Smartphone, Calendar
} from 'lucide-react'
import { useAppLock } from '@/providers/AppLockProvider'
import { AppConfig, getAppConfig, updateAppConfig } from '@/lib/app-config'
import { PlatformService } from '@/services/PlatformService'
import { WidgetService } from '@/services/WidgetService'
import { NotificationActionService } from '@/services/NotificationActionService'

interface UserProfile {
  name: string
  email: string
  avatar?: string
}

export function Settings({ onNavigateToTab }: { onNavigateToTab?: (tab: string) => void } = {}) {
  const [profile, setProfile] = useState<UserProfile>({ name: '', email: '' })
  const [currency, setCurrency] = useState('INR')
  const { theme, setTheme: setProviderTheme } = useTheme()
  const [notifications, setNotifications] = useState(true)
  const [editing, setEditing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [showAvatarOptions, setShowAvatarOptions] = useState(false)
  const [appConfig, setAppConfig] = useState<AppConfig>(getAppConfig)
  const [showConfiguration, setShowConfiguration] = useState(false)
  const avatarInputRef = React.useRef<HTMLInputElement>(null)
  const cameraInputRef = React.useRef<HTMLInputElement>(null)

  // Load user profile from DB (with localStorage fallback)
  useEffect(() => {
    async function loadProfile() {
      try {
        const dbProfile = await getProfile()
        if (dbProfile) {
          setProfile({ name: dbProfile.name, email: dbProfile.email, avatar: dbProfile.avatar })
          setCurrency(dbProfile.currency || 'INR')
        } else {
          // Fallback to localStorage for first-time migration
          const savedProfile = localStorage.getItem('finance-os-profile')
          if (savedProfile) {
            const p = JSON.parse(savedProfile)
            setProfile(p)
            // Migrate to DB
            await saveProfile({ name: p.name, email: p.email, avatar: p.avatar, currency: localStorage.getItem('finance-os-currency') || 'INR' })
          }
          setCurrency(localStorage.getItem('finance-os-currency') || 'INR')
        }
      } catch {
        // Final fallback
        const savedProfile = localStorage.getItem('finance-os-profile')
        if (savedProfile) setProfile(JSON.parse(savedProfile))
        setCurrency(localStorage.getItem('finance-os-currency') || 'INR')
      }
    }
    loadProfile()

    const savedNotifications = localStorage.getItem('finance-os-notifications') !== 'false'
    setNotifications(savedNotifications)
  }, [])

  // Save profile to DB + localStorage
  const handleSaveProfile = async () => {
    await saveProfile({ name: profile.name, email: profile.email, avatar: profile.avatar, currency })
    localStorage.setItem('finance-os-profile', JSON.stringify(profile))
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2000)
    setEditing(false)
  }

  // Handle avatar file selection (upload or capture)
  const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string
      const updated = { ...profile, avatar: dataUrl }
      setProfile(updated)
      // Save to both DB and localStorage
      await saveProfile({ name: updated.name, email: updated.email, avatar: dataUrl, currency })
      localStorage.setItem('finance-os-profile', JSON.stringify(updated))
      setShowAvatarOptions(false)
    }
    reader.readAsDataURL(file)
    event.target.value = '' // reset so same file can be re-selected
  }

  const handleRemoveAvatar = async () => {
    const updated = { ...profile, avatar: undefined }
    setProfile(updated)
    await saveProfile({ name: updated.name, email: updated.email, avatar: undefined, currency })
    localStorage.setItem('finance-os-profile', JSON.stringify(updated))
    setShowAvatarOptions(false)
  }

  // Save currency
  const handleCurrencyChange = async (newCurrency: string) => {
    setCurrency(newCurrency)
    localStorage.setItem('finance-os-currency', newCurrency)
    invalidateCurrencyCache()
    await saveProfile({ currency: newCurrency })
  }

  // Save theme
  const handleThemeChange = (newTheme: string) => {
    setProviderTheme(newTheme as 'dark' | 'light' | 'system' | 'auto')
  }

  // Toggle notifications
  const handleNotificationsToggle = () => {
    const newValue = !notifications
    setNotifications(newValue)
    localStorage.setItem('finance-os-notifications', String(newValue))
  }

  // Export data as JSON (full backup of all financial data)
  const handleExportData = async () => {
    setIsExporting(true)
    try {
      const [transactions, accounts, assets, lending, bills, goals, budgets, investments, customCategories, subscriptions, debts, splits] = await Promise.all([
        db.transactions.toArray(),
        db.accounts.toArray(),
        db.assets.toArray(),
        db.lending.toArray(),
        db.bills.toArray(),
        db.goals.toArray(),
        db.budgets.toArray(),
        db.investments.toArray(),
        db.customCategories.toArray(),
        db.subscriptions.toArray(),
        db.debts.toArray(),
        db.splits.toArray(),
      ])

      const allData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        profile,
        preferences: { currency, theme, notifications },
        data: { transactions, accounts, assets, lending, bills, goals, budgets, investments, customCategories, subscriptions, debts, splits },
      }

      const dataStr = JSON.stringify(allData, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `pennyflow-backup-${new Date().toISOString().split('T')[0]}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      // Export failed silently
    } finally {
      setIsExporting(false)
    }
  }

  // Import data from JSON
  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (data.profile) setProfile(data.profile)
      if (data.currency) handleCurrencyChange(data.currency)
      if (data.theme) handleThemeChange(data.theme)
      if (data.notifications !== undefined) setNotifications(data.notifications)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      console.error('Import failed:', err)
    }
  }

  // Reset all data
  const handleResetData = async () => {
    // Clear IndexedDB (all tables)
    try {
      await db.transactions.clear()
      await db.accounts.clear()
      await db.assets.clear()
      await db.lending.clear()
      await db.bills.clear()
      await db.goals.clear()
      await db.budgets.clear()
      await db.investments.clear()
      await db.customCategories.clear()
      await db.tags.clear()
      await db.notifications.clear()
      await db.financialBriefs.clear()
      await db.systemLogs.clear()
    } catch (err) {
      console.error('Error clearing database:', err)
    }

    // Clear localStorage
    localStorage.clear()
    setProfile({ name: '', email: '' })
    setCurrency('INR')
    setProviderTheme('dark')
    setNotifications(true)
    setShowResetConfirm(false)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2000)
  }

  const currencySymbol = currency === 'INR' ? '₹' : '$'

  // Update a single config toggle/selector
  const handleConfigChange = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    const updated = updateAppConfig(key, value)
    setAppConfig(updated)
  }

  // Platform detection for feature availability
  const platformLabel = PlatformService.getPlatformLabel()
  const widgetAvailable = PlatformService.canUse('widgets')
  const widgetReason = PlatformService.getUnavailableReason('widgets')
  const notifAvailable = NotificationActionService.isAvailable() || NotificationActionService.canRequest()
  const notifReason = NotificationActionService.getUnavailableReason()

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="py-1"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-xs text-muted-foreground mt-1">Manage your PennyFlow preferences</p>
      </motion.div>

      {/* Success Message */}
      {saveSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2"
        >
          <Check className="w-4 h-4 text-emerald-500" />
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Changes saved successfully</p>
        </motion.div>
      )}

      {/* Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAvatarOptions(!showAvatarOptions)}
            className="relative group"
          >
            {profile.avatar ? (
              <img src={profile.avatar} alt="Avatar" className="w-14 h-14 rounded-full object-cover border-2 border-primary/30" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center border-2 border-background">
              <Camera className="w-2.5 h-2.5 text-white" />
            </div>
          </button>
          <div className="flex-1">
            <h2 className="font-bold text-foreground">{profile.name || 'Add Your Name'}</h2>
            <p className="text-xs text-muted-foreground">{profile.email || 'Set up your profile'}</p>
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs font-semibold text-primary hover:text-primary/80"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {/* Avatar options */}
        {showAvatarOptions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex gap-2 pt-3 border-t border-primary/10"
          >
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary/60 border border-border/50 text-xs font-semibold hover:bg-secondary transition-colors"
            >
              <Image className="w-4 h-4 text-primary" />
              Upload Photo
            </button>
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary/60 border border-border/50 text-xs font-semibold hover:bg-secondary transition-colors"
            >
              <Camera className="w-4 h-4 text-primary" />
              Take Photo
            </button>
            {profile.avatar && (
              <button
                onClick={handleRemoveAvatar}
                className="px-3 flex items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-500 hover:bg-red-500/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarFile} className="hidden" />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="user" onChange={handleAvatarFile} className="hidden" />
          </motion.div>
        )}

        {editing ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pt-4 border-t border-primary/10"
          >
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Name</label>
              <Input
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="Your name"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase">Email</label>
              <Input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="your@email.com"
                className="mt-1"
              />
            </div>
            <Button onClick={handleSaveProfile} className="w-full">
              Save Profile
            </Button>
          </motion.div>
        ) : null}
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-3 gap-3"
      >
        {[
          { label: 'Your Data', value: 'Secure' },
          { label: 'Privacy', value: 'Private' },
          { label: 'App', value: 'Active' }
        ].map((stat, i) => (
          <div key={i} className="bg-secondary/50 border border-border rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-sm font-bold text-foreground mt-1">{stat.value}</p>
          </div>
        ))}
      </motion.div>

      {/* Cloud Sync */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <h3 className="text-sm font-bold text-foreground uppercase opacity-60 mb-3">Cloud Sync</h3>
        <SyncCard />
      </motion.div>

      {/* Preferences Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-3"
      >
        <h3 className="text-sm font-bold text-foreground uppercase opacity-60">Preferences</h3>

        {/* Currency */}
        <div className="bg-secondary/30 border border-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Currency</p>
              <p className="text-xs text-muted-foreground">Display currency for amounts</p>
            </div>
          </div>
          <Select value={currency} onChange={(e) => handleCurrencyChange(e.target.value)} className="w-full">
            <option value="INR">INR (₹) - Indian Rupee</option>
            <option value="USD">USD ($) - US Dollar</option>
            <option value="EUR">EUR (€) - Euro</option>
            <option value="GBP">GBP (£) - British Pound</option>
            <option value="JPY">JPY (¥) - Japanese Yen</option>
            <option value="AED">AED (د.إ) - Dirham</option>
            <option value="CAD">CAD (CA$) - Canadian Dollar</option>
            <option value="AUD">AUD (A$) - Australian Dollar</option>
            <option value="SGD">SGD (S$) - Singapore Dollar</option>
            <option value="CHF">CHF - Swiss Franc</option>
            <option value="CNY">CNY (¥) - Chinese Yuan</option>
            <option value="KRW">KRW (₩) - Korean Won</option>
            <option value="BRL">BRL (R$) - Brazilian Real</option>
            <option value="ZAR">ZAR (R) - South African Rand</option>
            <option value="MXN">MXN (MX$) — Mexican Peso</option>
            <option value="THB">THB (฿) — Thai Baht</option>
          </Select>
        </div>

        {/* Theme */}
        <div className="bg-secondary/30 border border-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Palette className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Theme</p>
              <p className="text-xs text-muted-foreground">App appearance</p>
            </div>
          </div>
          <Select value={theme} onChange={(e) => handleThemeChange(e.target.value)} className="w-full">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System (follows device)</option>
            <option value="auto">Auto (dark at night)</option>
          </Select>
        </div>

        {/* Notifications */}
        <div className="bg-secondary/30 border border-border rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Bell className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">{notifications ? 'Enabled' : 'Disabled'}</p>
            </div>
          </div>
          <button
            onClick={handleNotificationsToggle}
            className={`w-12 h-6 rounded-full transition-colors ${notifications ? 'bg-emerald-500' : 'bg-gray-400'}`}
          >
            <motion.div
              animate={{ x: notifications ? 24 : 2 }}
              className="w-5 h-5 bg-white rounded-full"
            />
          </button>
        </div>

        {/* App Lock (Phase 18) */}
        <AppLockSettings />
      </motion.div>

      {/* Configuration Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="space-y-3"
      >
        <button
          onClick={() => setShowConfiguration(!showConfiguration)}
          className="w-full flex items-center justify-between"
        >
          <h3 className="text-sm font-bold text-foreground uppercase opacity-60">Configuration</h3>
          <motion.div animate={{ rotate: showConfiguration ? 90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        </button>

        <AnimatePresence>
          {showConfiguration && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-3 overflow-hidden"
            >
              {/* Start Screen */}
              <div className="bg-secondary/30 border border-border rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <LayoutDashboard className="w-4 h-4 text-violet-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Start Screen</p>
                    <p className="text-[11px] text-muted-foreground">Default ledger view on open</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {(['daily', 'calendar'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => handleConfigChange('startScreen', opt)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                        appConfig.startScreen === opt
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt === 'daily' ? 'Daily' : 'Calendar'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Analytics Default View */}
              <div className="bg-secondary/30 border border-border rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-cyan-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Analytics Default</p>
                    <p className="text-[11px] text-muted-foreground">What analytics shows first</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {([{ key: 'current-month', label: 'This Month' }, { key: 'overall', label: 'Overall' }] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => handleConfigChange('analyticsDefaultView', opt.key)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                        appConfig.analyticsDefaultView === opt.key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ledger Sort */}
              <div className="bg-secondary/30 border border-border rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    <SortDesc className="w-4 h-4 text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Ledger Sort</p>
                    <p className="text-[11px] text-muted-foreground">How transactions are ordered</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {([{ key: 'time', label: 'Time' }, { key: 'date', label: 'Date' }, { key: 'amount', label: 'Amount' }] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => handleConfigChange('ledgerSort', opt.key)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                        appConfig.ledgerSort === opt.key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Input */}
              <div className="bg-secondary/30 border border-border rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-500/20 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-teal-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Time Input</p>
                    <p className="text-[11px] text-muted-foreground">How time is set on new entries</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {([{ key: 'auto', label: 'Auto (now)' }, { key: 'manual', label: 'Manual' }] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => handleConfigChange('timeInputBehavior', opt.key)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                        appConfig.timeInputBehavior === opt.key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Week Start Day */}
              <div className="bg-secondary/30 border border-border rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-pink-500/20 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-pink-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Week Starts On</p>
                    <p className="text-[11px] text-muted-foreground">For calendar and weekly views</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {([{ key: 'monday', label: 'Mon' }, { key: 'sunday', label: 'Sun' }, { key: 'saturday', label: 'Sat' }] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => handleConfigChange('weekStartDay', opt.key)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                        appConfig.weekStartDay === opt.key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monthly Start Date */}
              <div className="bg-secondary/30 border border-border rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Monthly Start Date</p>
                    <p className="text-[11px] text-muted-foreground">Budget/analytics month starts on</p>
                  </div>
                </div>
                <Select
                  value={String(appConfig.monthlyStartDate)}
                  onChange={(e) => handleConfigChange('monthlyStartDate', Number(e.target.value))}
                  className="w-full"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d === 1 ? '1st (default)' : `${d}${d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}`}</option>
                  ))}
                </Select>
              </div>

              {/* Color Style */}
              <div className="bg-secondary/30 border border-border rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Palette className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">Income/Expense Colors</p>
                    <p className="text-[11px] text-muted-foreground">Color scheme for transactions</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {([
                    { key: 'green-red', label: '🟢 / 🔴' },
                    { key: 'blue-red', label: '🔵 / 🔴' },
                    { key: 'green-orange', label: '🟢 / 🟠' },
                  ] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => handleConfigChange('incomeExpenseColorStyle', opt.key)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                        appConfig.incomeExpenseColorStyle === opt.key
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle Settings - Behavior (always functional) */}
              <div className="space-y-1">
                <ConfigToggle
                  label="Swipe Actions"
                  description="Swipe to delete/duplicate in ledger"
                  value={appConfig.swipeActionsEnabled}
                  onChange={(v) => handleConfigChange('swipeActionsEnabled', v)}
                />
                <ConfigToggle
                  label="Autocomplete"
                  description="Suggest descriptions while typing"
                  value={appConfig.autocompleteEnabled}
                  onChange={(v) => handleConfigChange('autocompleteEnabled', v)}
                />
                <ConfigToggle
                  label="Description Visible"
                  description="Show descriptions in ledger rows"
                  value={appConfig.descriptionVisible}
                  onChange={(v) => handleConfigChange('descriptionVisible', v)}
                />
                <ConfigToggle
                  label="Note Button"
                  description="Show note/memo field in add form"
                  value={appConfig.noteButtonVisible}
                  onChange={(v) => handleConfigChange('noteButtonVisible', v)}
                />
                <ConfigToggle
                  label="Carry-over"
                  description="Carry budget surplus to next month"
                  value={appConfig.carryOverEnabled}
                  onChange={(v) => handleConfigChange('carryOverEnabled', v)}
                />
                <ConfigToggle
                  label="Reminders"
                  description="Bill and goal due date reminders"
                  value={appConfig.reminderEnabled}
                  onChange={(v) => handleConfigChange('reminderEnabled', v)}
                />
              </div>

              {/* Platform Features - with real service integration */}
              <div className="pt-3 border-t border-border/40">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Platform Features</p>
                <p className="text-[10px] text-muted-foreground/60 mb-3 px-1">Running as: {platformLabel}</p>
                <div className="space-y-1">
                  <PlatformToggle
                    label="Home Screen Widget"
                    description={widgetReason || "Show finance data on home screen"}
                    value={appConfig.widgetEnabled}
                    available={widgetAvailable}
                    unavailableReason={widgetReason}
                    onChange={async (v) => {
                      handleConfigChange('widgetEnabled', v)
                      if (v) { WidgetService.startPeriodicSync() }
                    }}
                  />
                  <PlatformToggle
                    label="Notification Quick Add"
                    description={notifReason || "Quick actions from notification bar"}
                    value={appConfig.notificationQuickAdd}
                    available={notifAvailable}
                    unavailableReason={notifReason}
                    onChange={async (v) => {
                      const success = await NotificationActionService.setEnabled(v)
                      if (success) handleConfigChange('notificationQuickAdd', v)
                    }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Data Management Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="space-y-3"
      >
        <h3 className="text-sm font-bold text-foreground uppercase opacity-60">Data Management</h3>

        {/* Export */}
        <button
          onClick={handleExportData}
          disabled={isExporting}
          className="w-full bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between hover:border-emerald-500/50 transition-colors group"
        >
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Download className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Export Data</p>
              <p className="text-xs text-muted-foreground">Download JSON backup</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Import */}
        <label className="block cursor-pointer">
          <div className="w-full bg-gradient-to-r from-blue-500/20 to-blue-500/5 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between hover:border-blue-500/50 transition-colors group">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Import Data</p>
                <p className="text-xs text-muted-foreground">Restore from backup</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
          <input
            type="file"
            accept=".json"
            onChange={handleImportData}
            className="hidden"
          />
        </label>

        {/* Reset */}
        <button
          onClick={() => setShowResetConfirm(true)}
          className="w-full bg-gradient-to-r from-red-500/20 to-red-500/5 border border-red-500/30 rounded-xl p-4 flex items-center justify-between hover:border-red-500/50 transition-colors group"
        >
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <RotateCcw className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Reset All Data</p>
              <p className="text-xs text-muted-foreground">Clear all settings and data</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </motion.div>

      {/* Reset Confirmation */}
      {showResetConfirm && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-background border border-border rounded-2xl p-6 max-w-sm w-full space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Reset All Data?</h3>
                <p className="text-xs text-muted-foreground">This cannot be undone</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">This will permanently delete all your financial data, settings, and preferences. Make sure you have a backup.</p>

            <div className="grid grid-cols-2 gap-3 pt-4">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-lg border border-border hover:bg-secondary/50 transition-colors font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleResetData}
                className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-semibold text-sm"
              >
                Reset
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Help & Support */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="space-y-3"
      >
        <h3 className="text-sm font-bold text-foreground uppercase opacity-60">Support</h3>
        <button
          onClick={() => {
            if (onNavigateToTab) {
              onNavigateToTab('support')
            } else {
              window.history.pushState({ tab: 'support' }, '', '?tab=support')
              window.dispatchEvent(new PopStateEvent('popstate', { state: { tab: 'support' } }))
            }
          }}
          className="w-full bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between hover:border-primary/40 transition-colors group"
        >
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Help & Support</p>
              <p className="text-xs text-muted-foreground">Report bugs, request features, get help</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </motion.div>

      {/* About */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="space-y-3 pb-6"
      >
        <h3 className="text-sm font-bold text-foreground uppercase opacity-60">About PennyFlow</h3>
        <div className="bg-secondary/30 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">App Version</p>
            <p className="font-semibold text-foreground">1.0.0</p>
          </div>
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">Data Location</p>
            <p className="font-semibold text-foreground">On this device only</p>
          </div>
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">Your Privacy</p>
            <p className="font-semibold text-emerald-500">Fully private — no cloud</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground px-1 leading-relaxed">
          PennyFlow keeps all your financial data on your device. Nothing is sent to any server. Your money, your data, your control.
        </p>
      </motion.div>
    </div>
  )
}

// Phase 18: App Lock Settings Component
function AppLockSettings() {
  const { isEnabled, isBiometricAvailable, isBiometricEnabled, enableLock, disableLock, enableBiometric, disableBiometric } = useAppLock()
  const [showSetPin, setShowSetPin] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [biometricLoading, setBiometricLoading] = useState(false)

  const handleEnable = () => {
    if (newPin.length === 4 && /^\d{4}$/.test(newPin)) {
      enableLock(newPin)
      setNewPin('')
      setShowSetPin(false)
    }
  }

  const handleBiometricToggle = async () => {
    if (isBiometricEnabled) {
      disableBiometric()
    } else {
      setBiometricLoading(true)
      await enableBiometric()
      setBiometricLoading(false)
    }
  }

  return (
    <>
      {/* PIN Lock */}
      <div className="bg-secondary/30 border border-border rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center">
            <Lock className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">PIN Lock</p>
            <p className="text-xs text-muted-foreground">{isEnabled ? 'Active — locks after 5 min' : 'Protect your data'}</p>
          </div>
        </div>
        <button
          onClick={() => {
            if (isEnabled) { disableLock() }
            else { setShowSetPin(!showSetPin) }
          }}
          className={`w-12 h-6 rounded-full transition-colors ${isEnabled ? 'bg-emerald-500' : 'bg-gray-400'}`}
        >
          <motion.div
            animate={{ x: isEnabled ? 24 : 2 }}
            className="w-5 h-5 bg-white rounded-full"
          />
        </button>
      </div>

      {showSetPin && !isEnabled && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="overflow-hidden"
        >
          <div className="flex gap-2 p-3 rounded-xl bg-secondary/30 border border-border">
            <input
              type="password"
              maxLength={4}
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4-digit PIN"
              className="flex-1 h-9 px-3 rounded-lg bg-background border border-border/50 text-sm text-center font-mono tracking-[0.5em] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
            />
            <button
              onClick={handleEnable}
              disabled={newPin.length !== 4}
              className="px-4 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40"
            >
              Set PIN
            </button>
          </div>
        </motion.div>
      )}

      {/* Fingerprint / Biometric */}
      {isBiometricAvailable && isEnabled && (
        <div className="bg-secondary/30 border border-border rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Fingerprint className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Fingerprint Unlock</p>
              <p className="text-xs text-muted-foreground">{isBiometricEnabled ? 'Enabled — unlock with touch' : 'Use biometrics to unlock'}</p>
            </div>
          </div>
          <button
            onClick={handleBiometricToggle}
            disabled={biometricLoading}
            className={`w-12 h-6 rounded-full transition-colors ${isBiometricEnabled ? 'bg-emerald-500' : 'bg-gray-400'}`}
          >
            <motion.div
              animate={{ x: isBiometricEnabled ? 24 : 2 }}
              className="w-5 h-5 bg-white rounded-full"
            />
          </button>
        </div>
      )}
    </>
  )
}

// Reusable toggle row component matching the existing design language
function ConfigToggle({ label, description, value, onChange }: {
  label: string
  description: string
  value: boolean
  onChange: (val: boolean) => void
}) {
  return (
    <div className="bg-secondary/30 border border-border rounded-xl px-4 py-3 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground truncate">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`ml-3 w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-emerald-500' : 'bg-gray-400'}`}
      >
        <motion.div
          animate={{ x: value ? 20 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="w-5 h-5 bg-white rounded-full shadow-sm"
        />
      </button>
    </div>
  )
}

// Platform-aware toggle with availability indicator
function PlatformToggle({ label, description, value, available, unavailableReason, onChange }: {
  label: string
  description: string
  value: boolean
  available: boolean
  unavailableReason: string | null
  onChange: (val: boolean) => void
}) {
  return (
    <div className={cn(
      "bg-secondary/30 border border-border rounded-xl px-4 py-3 flex items-center justify-between",
      !available && "opacity-60"
    )}>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground truncate">{description}</p>
        {!available && unavailableReason && (
          <p className="text-[10px] text-amber-500/80 mt-0.5">{unavailableReason}</p>
        )}
      </div>
      {available ? (
        <button
          onClick={() => onChange(!value)}
          className={`ml-3 w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-emerald-500' : 'bg-gray-400'}`}
        >
          <motion.div
            animate={{ x: value ? 20 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="w-5 h-5 bg-white rounded-full shadow-sm"
          />
        </button>
      ) : (
        <span className="ml-3 text-[9px] font-bold text-muted-foreground/50 uppercase px-2 py-1 rounded bg-secondary/60">N/A</span>
      )}
    </div>
  )
}
