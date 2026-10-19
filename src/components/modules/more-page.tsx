'use client'

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock, Wallet, Tag, RefreshCw, Crown, ChevronRight,
  BarChart3, LayoutDashboard, PieChart, Settings as SettingsIcon,
  HelpCircle, Bell, ShieldCheck, Pencil, AlertTriangle,
  Users, CreditCard, Camera, TrendingUp, Landmark, Upload, HeartHandshake, Target, TrendingDown,
  Megaphone, Star, MessageSquare, Info, LogOut, CalendarDays, SlidersHorizontal, Rows3,
  CalendarClock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getProfile, saveProfile } from '@/db/schema'
import { useAuth } from '@/providers/AuthProvider'
import { isOperatorEmail } from '@/lib/admin-config'
import type { TabType } from '@/components/layout/bottom-nav'
import { getLastBackup, type LastBackupInfo } from '@/services/DataExportService'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast-notification'
import { SyncCard } from '@/components/ui/sync-card'
import { X, Trash2, Camera as CameraIcon, Check } from 'lucide-react'

// Shareable app details used by "Invite a friend" and "Rate app".
const APP_NAME = 'PennyFlow'
const APP_URL = typeof window !== 'undefined' ? window.location.origin : 'https://pennyflow.app'
const INVITE_MESSAGE = `Check out ${APP_NAME} — a private, offline-first personal finance tracker. ${APP_URL}`

interface MorePageProps {
  onNavigateToTab: (tab: TabType) => void
  /** Opens the backup bottom sheet (owned by the app shell so it overlays the full frame). */
  onBackupClick: () => void
  /** Bumped by the shell after a backup completes so the card refreshes its timestamp. */
  backupVersion?: number
}

interface GridItem {
  id: TabType
  label: string
  icon: React.ElementType
  color: string
  accent?: boolean
}

// Primary feature grid (2 columns) — mirrors the reference "Transactions / Scheduled" style.
const FEATURE_GRID: GridItem[] = [
  { id: 'ledger', label: 'Transactions', icon: Clock, color: 'text-blue-400' },
  { id: 'plannedpayments', label: 'Planned Payments', icon: CalendarClock, color: 'text-violet-400' },
  { id: 'budgets', label: 'Budgets', icon: Wallet, color: 'text-pink-400' },
  { id: 'categories', label: 'Categories', icon: Tag, color: 'text-emerald-400' },
  { id: 'subscriptions', label: 'Subscriptions', icon: RefreshCw, color: 'text-sky-400' },
  { id: 'goals', label: 'Goals', icon: Target, color: 'text-amber-400' },
]

// "Insights" row (3 columns) — icon stacked above label.
const VIEW_ITEMS: GridItem[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard, color: 'text-foreground' },
  { id: 'analytics', label: 'Analysis', icon: BarChart3, color: 'text-foreground' },
  { id: 'statistics', label: 'Statistics', icon: PieChart, color: 'text-foreground' },
]

// Transaction "Views" row (3 columns) — Day / Calendar / Custom views of transactions.
const TRANSACTION_VIEWS: GridItem[] = [
  { id: 'dayview', label: 'Day', icon: Rows3, color: 'text-foreground' },
  { id: 'calendarview', label: 'Calendar', icon: CalendarDays, color: 'text-foreground' },
  { id: 'customview', label: 'Custom', icon: SlidersHorizontal, color: 'text-foreground' },
]

// Secondary feature grid — the rest of the modules, grouped under "Manage".
const MANAGE_GRID: GridItem[] = [
  { id: 'accounts', label: 'Accounts', icon: CreditCard, color: 'text-indigo-400' },
  { id: 'investments', label: 'Investments', icon: TrendingUp, color: 'text-green-400' },
  { id: 'lending', label: 'Lending', icon: HeartHandshake, color: 'text-rose-400' },
  { id: 'assets', label: 'Assets', icon: Landmark, color: 'text-cyan-400' },
  { id: 'splits', label: 'Split Expenses', icon: Users, color: 'text-orange-400' },
  { id: 'sharedwallets', label: 'Shared Wallets', icon: Wallet, color: 'text-teal-400' },
  { id: 'receipts', label: 'Receipts', icon: Camera, color: 'text-fuchsia-400' },
  { id: 'debtplanner', label: 'Debt Planner', icon: TrendingDown, color: 'text-red-400' },
  { id: 'csvimport', label: 'Import / Export', icon: Upload, color: 'text-violet-400' },
]

export function MorePage({ onNavigateToTab, onBackupClick, backupVersion }: MorePageProps) {
  const { user, signOut } = useAuth()
  const { showToast } = useToast()
  const isOperator = isOperatorEmail(user?.email)
  const [profileName, setProfileName] = useState<string>('')
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>(undefined)
  const [lastBackup, setLastBackup] = useState<LastBackupInfo | null>(() => getLastBackup())
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const firstBackupSync = React.useRef(true)

  // Inline profile editing (name + avatar) — previously only possible in Settings.
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftAvatar, setDraftAvatar] = useState<string | undefined>(undefined)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = React.useRef<HTMLInputElement>(null)

  // Inline cloud sync / sign-in sheet — previously only reachable from Settings.
  const [isSyncOpen, setIsSyncOpen] = useState(false)

  const openEditProfile = () => {
    setDraftName(profileName || '')
    setDraftAvatar(profileAvatar)
    setIsEditOpen(true)
  }

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    setUploadingAvatar(true)
    try {
      const { compressImageToBase64 } = await import('@/lib/receipt-utils')
      const base64 = await compressImageToBase64(file)
      setDraftAvatar(base64)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load that image')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    try {
      await saveProfile({ name: draftName.trim(), avatar: draftAvatar })
      setProfileName(draftName.trim())
      setProfileAvatar(draftAvatar)
      setIsEditOpen(false)
      showToast('Profile updated')
    } catch {
      showToast('Could not save profile')
    } finally {
      setSavingProfile(false)
    }
  }

  // Invite a friend — use the native share sheet when available, else copy to clipboard.
  const handleInvite = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: APP_NAME, text: INVITE_MESSAGE, url: APP_URL })
        return
      } catch {
        // User dismissed the share sheet, or share failed — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(INVITE_MESSAGE)
      showToast('Invite link copied to clipboard')
    } catch {
      showToast('Could not share right now')
    }
  }

  // Rate app — open the app in a new tab (store link can be swapped in later).
  const handleRateApp = () => {
    window.open(APP_URL, '_blank', 'noopener,noreferrer')
  }

  const handleSignOut = async () => {
    setShowSignOutConfirm(false)
    await signOut()
  }

  const unreadCount = useLiveQuery(
    async () => db.notifications.filter(n => !n.read).count(),
    [],
    0
  ) ?? 0

  // Resolve the display identity: local profile first, then auth user.
  useEffect(() => {
    let active = true
    getProfile()
      .then(p => {
        if (!active) return
        setProfileName(p?.name || user?.user_metadata?.full_name || '')
        setProfileAvatar(p?.avatar || (user?.user_metadata?.avatar_url as string | undefined))
      })
      .catch(() => {
        if (!active) return
        setProfileName(user?.user_metadata?.full_name || '')
        setProfileAvatar(user?.user_metadata?.avatar_url as string | undefined)
      })
    return () => { active = false }
  }, [user])

  // Refresh the last-backup timestamp after a backup completes (skip initial mount,
  // which is already seeded by the lazy useState initializer above).
  useEffect(() => {
    if (firstBackupSync.current) {
      firstBackupSync.current = false
      return
    }
    setLastBackup(getLastBackup())
  }, [backupVersion])

  const formatBackup = (info: LastBackupInfo) => {
    const when = new Date(info.at).toLocaleString('en-US', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    })
    const where = info.destination === 'cloud' ? 'G-Drive backup' : 'Local backup'
    return `Last backup: ${where} on ${when}`
  }

  const isSignedIn = !!user
  const displayName = profileName || (isSignedIn ? 'Your account' : 'Guest User')
  const subtitle = isSignedIn ? (user?.email ?? 'Signed in') : 'Sign in to back up'

  return (
    <div className="flex flex-col space-y-5 pb-6">
      {/* ── Profile card ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl bg-card border border-border/60 p-4 shadow-sm"
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative h-14 w-14 flex-shrink-0 rounded-full overflow-hidden bg-secondary flex items-center justify-center">
            {profileAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileAvatar} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <Users className="h-7 w-7 text-muted-foreground" strokeWidth={1.6} />
            )}
          </div>

          {/* Name + action */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[17px] font-bold text-foreground">{displayName}</h2>
              <button
                onClick={openEditProfile}
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-secondary transition-colors"
                aria-label="Edit profile"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            <button
              onClick={() => setIsSyncOpen(true)}
              className="truncate text-left text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {subtitle}
            </button>
          </div>

          {/* Security / backup shield */}
          <button
            onClick={() => setIsSyncOpen(true)}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-secondary hover:bg-accent transition-colors"
            aria-label="Security & backup"
          >
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Backup banner — shows last backup time, or a warning if never backed up */}
        <div className="my-3 h-px w-full bg-border/60" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {!lastBackup && (
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-400" strokeWidth={1.8} />
            )}
            <p className="text-[13px] leading-snug text-muted-foreground">
              {lastBackup ? formatBackup(lastBackup) : "Your data hasn't been backed up yet."}
            </p>
          </div>
          <button
            onClick={onBackupClick}
            className="flex-shrink-0 text-[13px] font-semibold text-foreground hover:text-primary transition-colors"
          >
            Back up now
          </button>
        </div>
      </motion.div>

      {/* ── Feature grid (2 columns) ──────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
        className="grid grid-cols-2 gap-3"
      >
        {FEATURE_GRID.map((item) => (
          <GridCard key={item.id} item={item} onClick={() => onNavigateToTab(item.id)} />
        ))}
      </motion.div>

      {/* ── Transaction Views row (Day / Calendar / Custom) ───────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <p className="px-1 pb-2 text-[13px] font-semibold text-muted-foreground">Views</p>
        <div className="grid grid-cols-3 gap-3">
          {TRANSACTION_VIEWS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => onNavigateToTab(item.id)}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-card border border-border/60 py-5 hover:bg-accent active:scale-[0.98] transition-all"
              >
                <Icon className="h-5 w-5 text-foreground" strokeWidth={1.8} />
                <span className="text-[13px] font-medium text-foreground">{item.label}</span>
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* ── Insights row (3 columns) ──────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
      >
        <p className="px-1 pb-2 text-[13px] font-semibold text-muted-foreground">Insights</p>
        <div className="grid grid-cols-3 gap-3">
          {VIEW_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => onNavigateToTab(item.id)}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-card border border-border/60 py-5 hover:bg-accent active:scale-[0.98] transition-all"
              >
                <Icon className="h-5 w-5 text-foreground" strokeWidth={1.8} />
                <span className="text-[13px] font-medium text-foreground">{item.label}</span>
              </button>
            )
          })}
        </div>
      </motion.div>

      {/* ── Highlight banner (adapted from the Pro upsell) ────────── */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.09 }}
        onClick={() => onNavigateToTab('health')}
        className="flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/10 to-purple-500/5 p-4 text-left hover:border-amber-400/70 active:scale-[0.99] transition-all"
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
          <Crown className="h-5 w-5 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-foreground">See your financial health</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Understand where your money goes with a full health score.
          </p>
        </div>
        <ChevronRight className="h-5 w-5 flex-shrink-0 text-amber-400" />
      </motion.button>

      {/* ── Manage grid (rest of the modules) ─────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
      >
        <p className="px-1 pb-2 text-[13px] font-semibold text-muted-foreground">Manage</p>
        <div className="grid grid-cols-2 gap-3">
          {MANAGE_GRID.map((item) => (
            <GridCard key={item.id} item={item} onClick={() => onNavigateToTab(item.id)} />
          ))}
        </div>
      </motion.div>

      {/* ── More options list ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <p className="px-1 pb-2 text-[13px] font-semibold text-muted-foreground">More options</p>
        <div className="overflow-hidden rounded-2xl bg-card border border-border/60">
          <ListRow icon={SettingsIcon} label="Settings" onClick={() => onNavigateToTab('settings')} />
          <ListRow
            icon={Bell}
            label="Notifications"
            badge={unreadCount > 0 ? (unreadCount > 9 ? '9+' : String(unreadCount)) : undefined}
            onClick={() => onNavigateToTab('notifications')}
          />
          <ListRow icon={Megaphone} label="Invite a friend" onClick={handleInvite} />
          <ListRow icon={Star} label="Rate app" onClick={handleRateApp} />
          <ListRow icon={MessageSquare} label="Query / feedback" onClick={() => onNavigateToTab('support')} />
          <ListRow icon={HelpCircle} label="FAQs" onClick={() => onNavigateToTab('support')} />
          <ListRow
            icon={Info}
            label="About app"
            onClick={() => onNavigateToTab('about')}
          />
          {isOperator && (
            <ListRow
              icon={ShieldCheck}
              label="Support Inbox"
              onClick={() => onNavigateToTab('supportadmin')}
            />
          )}
          <ListRow
            icon={LogOut}
            label="Sign out"
            onClick={() => setShowSignOutConfirm(true)}
            danger
            last
          />
        </div>
      </motion.div>

      {/* Sign out confirmation */}
      <ConfirmDialog
        isOpen={showSignOutConfirm}
        title="Sign out?"
        message="Your data will be backed up to the cloud, then cleared from this device. You can sign back in anytime to restore it."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={handleSignOut}
        onCancel={() => setShowSignOutConfirm(false)}
      />

      {/* Edit profile sheet — change name & upload a photo inline */}
      <EditProfileSheet
        isOpen={isEditOpen}
        name={draftName}
        avatar={draftAvatar}
        saving={savingProfile}
        uploading={uploadingAvatar}
        avatarInputRef={avatarInputRef}
        onNameChange={setDraftName}
        onPickPhoto={() => avatarInputRef.current?.click()}
        onRemovePhoto={() => setDraftAvatar(undefined)}
        onAvatarInput={handleAvatarPick}
        onClose={() => setIsEditOpen(false)}
        onSave={handleSaveProfile}
      />

      {/* Cloud sync / sign-in sheet — back up without leaving this page */}
      <SyncSheet isOpen={isSyncOpen} onClose={() => setIsSyncOpen(false)} />
    </div>
  )
}

/* ── Edit profile sheet ──────────────────────────────────────────── */
function EditProfileSheet({
  isOpen,
  name,
  avatar,
  saving,
  uploading,
  avatarInputRef,
  onNameChange,
  onPickPhoto,
  onRemovePhoto,
  onAvatarInput,
  onClose,
  onSave,
}: {
  isOpen: boolean
  name: string
  avatar?: string
  saving: boolean
  uploading: boolean
  avatarInputRef: React.RefObject<HTMLInputElement | null>
  onNameChange: (v: string) => void
  onPickPhoto: () => void
  onRemovePhoto: () => void
  onAvatarInput: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="absolute inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="relative w-full rounded-t-[1.8rem] bg-card border-t border-border/60 p-5 pb-8 shadow-elevated"
            role="dialog"
            aria-modal="true"
            aria-label="Edit profile"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-foreground">Edit profile</h3>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={onPickPhoto}
                disabled={uploading}
                className="relative h-24 w-24 overflow-hidden rounded-full bg-secondary flex items-center justify-center group disabled:opacity-60"
                aria-label="Upload photo"
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <Users className="h-10 w-10 text-muted-foreground" strokeWidth={1.6} />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploading ? (
                    <RefreshCw className="h-6 w-6 text-white animate-spin" />
                  ) : (
                    <CameraIcon className="h-6 w-6 text-white" />
                  )}
                </span>
              </button>
              <div className="flex items-center gap-4">
                <button
                  onClick={onPickPhoto}
                  disabled={uploading}
                  className="text-[13px] font-semibold text-primary hover:opacity-80 disabled:opacity-50"
                >
                  {uploading ? 'Uploading…' : avatar ? 'Change photo' : 'Upload photo'}
                </button>
                {avatar && (
                  <button
                    onClick={onRemovePhoto}
                    className="flex items-center gap-1 text-[13px] font-semibold text-destructive hover:opacity-80"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarInput}
              />
            </div>

            {/* Name */}
            <div className="mt-6">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Name</label>
              <input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                maxLength={60}
                placeholder="Your name"
                className="mt-1.5 h-12 w-full rounded-2xl border border-border/60 bg-background px-4 text-[15px] font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* Save */}
            <button
              onClick={onSave}
              disabled={saving || uploading}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground font-bold text-[15px] hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ── Cloud sync / sign-in sheet ──────────────────────────────────── */
function SyncSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="absolute inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="relative w-full rounded-t-[1.8rem] bg-card border-t border-border/60 p-5 pb-8 shadow-elevated"
            role="dialog"
            aria-modal="true"
            aria-label="Cloud sync"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-foreground">Cloud sync &amp; backup</h3>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SyncCard />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ── Reusable pieces ─────────────────────────────────────────────── */

function GridCard({ item, onClick }: { item: GridItem; onClick: () => void }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl bg-card border border-border/60 px-4 py-4 text-left hover:bg-accent active:scale-[0.98] transition-all"
    >
      <Icon className={cn('h-5 w-5 flex-shrink-0', item.color)} strokeWidth={1.9} />
      <span className="min-w-0 flex-1 text-[14px] font-medium leading-tight text-foreground">{item.label}</span>
    </button>
  )
}

function ListRow({
  icon: Icon,
  label,
  onClick,
  badge,
  last,
  danger,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  badge?: string
  last?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-accent active:bg-accent/70 transition-colors',
        !last && 'border-b border-border/60'
      )}
    >
      <Icon
        className={cn(
          'h-[18px] w-[18px] flex-shrink-0',
          danger ? 'text-red-500' : 'text-muted-foreground'
        )}
        strokeWidth={1.8}
      />
      <span className={cn('flex-1 text-[14px] font-medium', danger ? 'text-red-500' : 'text-foreground')}>
        {label}
      </span>
      {badge && (
        <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center leading-none">
          {badge}
        </span>
      )}
      <ChevronRight className={cn('h-4 w-4 flex-shrink-0', danger ? 'text-red-500' : 'text-muted-foreground')} />
    </button>
  )
}
