'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Smartphone, ChevronRight, X, Check, AlertTriangle, RefreshCw } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { SyncService } from '@/services/SyncService'
import { DataExportService, recordBackup } from '@/services/DataExportService'

type Step = 'choose' | 'local-confirm' | 'working' | 'done'

interface BackupSheetProps {
  isOpen: boolean
  onClose: () => void
  /** Notifies the parent so it can refresh the "Last backup" line. */
  onBackupComplete?: () => void
}

export function BackupSheet({ isOpen, onClose, onBackupComplete }: BackupSheetProps) {
  const { user, isConfigured, signInWithGoogle } = useAuth()
  const [step, setStep] = useState<Step>('choose')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setStep('choose')
    setMessage(null)
    setError(null)
  }

  const handleClose = () => {
    onClose()
    // Reset after the exit animation so the sheet reopens on step 1.
    setTimeout(reset, 250)
  }

  // ── Local backup ───────────────────────────────────────────────
  const handleCreateLocalBackup = async () => {
    setStep('working')
    setError(null)
    const res = await DataExportService.downloadFullBackup()
    if (res.success) {
      setMessage(`Saved ${res.filename} to your Downloads folder.`)
      setStep('done')
      onBackupComplete?.()
    } else {
      setError(res.error || 'Could not create the backup file.')
      setStep('local-confirm')
    }
  }

  // ── Cloud (Google Drive) backup ────────────────────────────────
  const handleCloudBackup = async () => {
    setError(null)

    // Not signed in → launch the Google consent screen. OAuth redirects away;
    // on return the app is signed in and the user can tap again to push.
    if (!user) {
      if (!isConfigured) {
        setError('Cloud backup isn\'t configured on this build. Use Local Storage instead.')
        return
      }
      setStep('working')
      const { error } = await signInWithGoogle()
      if (error) {
        setError(error)
        setStep('choose')
      }
      // On success the browser redirects to Google — nothing more to do here.
      return
    }

    // Signed in → push the local database to the cloud.
    setStep('working')
    const res = await SyncService.pushToCloud(user.id)
    if (res.success) {
      recordBackup('cloud')
      setMessage('Your data is backed up to Google Drive (cloud).')
      setStep('done')
      onBackupComplete?.()
    } else {
      setError(res.error || 'Cloud backup failed. Please try again.')
      setStep('choose')
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-x-0 bottom-0 z-50 rounded-t-3xl bg-card border-t border-border/60 p-5 pb-8"
            role="dialog"
            aria-label="Backup data"
          >
            {/* Grabber */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />

            {/* ── Step: choose destination ── */}
            {step === 'choose' && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-[20px] font-bold text-foreground">Backup data to...</h2>
                  <button
                    onClick={handleClose}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary hover:bg-accent transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {/* Local Storage */}
                  <button
                    onClick={() => setStep('local-confirm')}
                    className="flex w-full items-center gap-4 rounded-2xl border border-border/60 bg-background px-4 py-4 text-left hover:bg-accent active:scale-[0.99] transition-all"
                  >
                    <Smartphone className="h-6 w-6 flex-shrink-0 text-foreground" strokeWidth={1.7} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-semibold text-foreground">Local Storage</p>
                      <p className="text-[12px] text-muted-foreground">Save a backup file to this device</p>
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  </button>

                  {/* Google Drive */}
                  <button
                    onClick={handleCloudBackup}
                    className="flex w-full items-center gap-4 rounded-2xl border border-border/60 bg-background px-4 py-4 text-left hover:bg-accent active:scale-[0.99] transition-all"
                  >
                    <GoogleDriveIcon className="h-6 w-6 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-semibold text-foreground">
                        Google Drive <span className="text-muted-foreground font-normal">(Recommended)</span>
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {user ? (user.email ?? 'Signed in') : 'Sign in to back up to the cloud'}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  </button>
                </div>

                {error && (
                  <p className="mt-4 flex items-center gap-2 text-[12px] text-destructive">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
                  </p>
                )}
              </>
            )}

            {/* ── Step: local confirm ── */}
            {step === 'local-confirm' && (
              <div className="text-center">
                <h2 className="text-[20px] font-bold text-foreground">Ready to Backup?</h2>
                <p className="mx-auto mt-3 max-w-[320px] text-[13px] leading-relaxed text-muted-foreground">
                  Local backups are saved to the &quot;Downloads&quot; folder on your device as a JSON file. If you ever need
                  to restore, this is where you&apos;ll find it.
                </p>

                {error && (
                  <p className="mt-3 flex items-center justify-center gap-2 text-[12px] text-destructive">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
                  </p>
                )}

                <div className="mt-5 h-px w-full bg-border/60" />

                <button
                  onClick={handleCreateLocalBackup}
                  className="mt-4 w-full rounded-xl bg-primary py-3.5 text-[15px] font-bold text-primary-foreground hover:opacity-90 active:scale-[0.99] transition-all"
                >
                  Create Backup
                </button>
                <button
                  onClick={() => { setStep('choose'); setError(null) }}
                  className="mt-2 w-full py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back
                </button>
              </div>
            )}

            {/* ── Step: working ── */}
            {step === 'working' && (
              <div className="flex flex-col items-center py-6 text-center">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-[14px] font-medium text-foreground">
                  {user ? 'Backing up…' : 'Opening Google sign-in…'}
                </p>
              </div>
            )}

            {/* ── Step: done ── */}
            {step === 'done' && (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                  <Check className="h-7 w-7 text-emerald-500" strokeWidth={2.5} />
                </div>
                <h2 className="mt-4 text-[18px] font-bold text-foreground">Backup complete</h2>
                <p className="mx-auto mt-2 max-w-[320px] text-[13px] leading-relaxed text-muted-foreground">
                  {message}
                </p>
                <button
                  onClick={handleClose}
                  className="mt-5 w-full rounded-xl bg-primary py-3.5 text-[15px] font-bold text-primary-foreground hover:opacity-90 active:scale-[0.99] transition-all"
                >
                  Done
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function GoogleDriveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16.3 6 3 29l6.6 11.5L23 17.5 16.3 6Z" fill="#0066DA" />
      <path d="M31.7 6H16.3L23 17.5h15.4L31.7 6Z" fill="#00AC47" />
      <path d="M44.4 40.5 38.4 29H23l6.6 11.5h14.8Z" fill="#EA4335" transform="translate(-1 0)" />
      <path d="M9.6 40.5h28.8L45 29H16.3L9.6 40.5Z" fill="#FFBA00" />
      <path d="M45 29 31.7 6l-6.7 11.5L38.4 29H45Z" fill="#00832D" />
      <path d="M9.6 40.5 16.3 29H3l6.6 11.5Z" fill="#2684FC" />
    </svg>
  )
}
