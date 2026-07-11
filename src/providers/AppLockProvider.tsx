'use client'

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Fingerprint, X, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

const LOCK_PIN_KEY = 'pennyflow-lock-pin-hash'
const LOCK_ENABLED_KEY = 'pennyflow-lock-enabled'
const LOCK_TIMEOUT_KEY = 'pennyflow-lock-timeout'
const LAST_ACTIVITY_KEY = 'pennyflow-last-activity'

interface AppLockContextType {
  isLocked: boolean
  isEnabled: boolean
  enableLock: (pin: string) => void
  disableLock: () => void
  changePIN: (oldPin: string, newPin: string) => boolean
}

const AppLockContext = createContext<AppLockContextType>({
  isLocked: false,
  isEnabled: false,
  enableLock: () => {},
  disableLock: () => {},
  changePIN: () => false,
})

export function useAppLock() {
  return useContext(AppLockContext)
}

// Simple hash function (not cryptographic — suitable for local PIN)
function hashPIN(pin: string): string {
  let hash = 0
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit int
  }
  return Math.abs(hash).toString(36)
}

function verifyPIN(input: string, storedHash: string): boolean {
  return hashPIN(input) === storedHash
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [error, setError] = useState('')
  const activityTimer = useRef<NodeJS.Timeout | null>(null)

  // Initialize lock state
  useEffect(() => {
    if (typeof window === 'undefined') return

    const enabled = localStorage.getItem(LOCK_ENABLED_KEY) === 'true'
    setIsEnabled(enabled)

    if (enabled) {
      // Check if should be locked (5 minutes inactivity)
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY)
      const timeout = 5 * 60 * 1000 // 5 minutes
      if (!lastActivity || Date.now() - parseInt(lastActivity) > timeout) {
        setIsLocked(true)
      }
    }
  }, [])

  // Track activity for auto-lock
  useEffect(() => {
    if (!isEnabled || isLocked) return

    const updateActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())
    }

    const checkTimeout = () => {
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY)
      const timeout = 5 * 60 * 1000 // 5 minutes
      if (lastActivity && Date.now() - parseInt(lastActivity) > timeout) {
        setIsLocked(true)
      }
    }

    updateActivity()

    // Update on any interaction
    const events = ['mousedown', 'touchstart', 'keydown', 'scroll']
    events.forEach(event => document.addEventListener(event, updateActivity, { passive: true }))

    // Check every 30 seconds
    activityTimer.current = setInterval(checkTimeout, 30000)

    return () => {
      events.forEach(event => document.removeEventListener(event, updateActivity))
      if (activityTimer.current) clearInterval(activityTimer.current)
    }
  }, [isEnabled, isLocked])

  const enableLock = useCallback((pin: string) => {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return
    localStorage.setItem(LOCK_PIN_KEY, hashPIN(pin))
    localStorage.setItem(LOCK_ENABLED_KEY, 'true')
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())
    setIsEnabled(true)
  }, [])

  const disableLock = useCallback(() => {
    localStorage.removeItem(LOCK_PIN_KEY)
    localStorage.setItem(LOCK_ENABLED_KEY, 'false')
    setIsEnabled(false)
    setIsLocked(false)
  }, [])

  const changePIN = useCallback((oldPin: string, newPin: string): boolean => {
    const stored = localStorage.getItem(LOCK_PIN_KEY)
    if (!stored || !verifyPIN(oldPin, stored)) return false
    localStorage.setItem(LOCK_PIN_KEY, hashPIN(newPin))
    return true
  }, [])

  const handleUnlock = useCallback(() => {
    const stored = localStorage.getItem(LOCK_PIN_KEY)
    if (!stored) return

    if (verifyPIN(pinInput, stored)) {
      setIsLocked(false)
      setPinInput('')
      setError('')
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())
    } else {
      setError('Incorrect PIN')
      setPinInput('')
      setTimeout(() => setError(''), 2000)
    }
  }, [pinInput])

  const handlePinDigit = (digit: string) => {
    if (pinInput.length >= 4) return
    const newPin = pinInput + digit
    setPinInput(newPin)
    if (newPin.length === 4) {
      // Auto-submit after 4 digits
      setTimeout(() => {
        const stored = localStorage.getItem(LOCK_PIN_KEY)
        if (stored && verifyPIN(newPin, stored)) {
          setIsLocked(false)
          setPinInput('')
          setError('')
          localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())
        } else {
          setError('Incorrect PIN')
          setPinInput('')
          setTimeout(() => setError(''), 2000)
        }
      }, 100)
    }
  }

  return (
    <AppLockContext.Provider value={{ isLocked, isEnabled, enableLock, disableLock, changePIN }}>
      {children}

      {/* Lock Screen */}
      <AnimatePresence>
        {isLocked && isEnabled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-background flex flex-col items-center justify-center p-6"
          >
            <div className="flex flex-col items-center space-y-6 w-full max-w-xs">
              {/* Logo */}
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Shield className="w-8 h-8 text-primary" />
              </div>

              <div className="text-center">
                <h2 className="text-xl font-bold text-foreground">PennyFlow Locked</h2>
                <p className="text-xs text-muted-foreground mt-1">Enter your 4-digit PIN</p>
              </div>

              {/* PIN Dots */}
              <div className="flex gap-4">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={cn(
                      "w-4 h-4 rounded-full transition-all duration-200",
                      i < pinInput.length ? "bg-primary scale-110" : "bg-secondary border border-border/50"
                    )}
                  />
                ))}
              </div>

              {/* Error */}
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs font-semibold text-destructive"
                >
                  {error}
                </motion.p>
              )}

              {/* Number Pad */}
              <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '←'].map((digit, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (digit === '←') setPinInput(pinInput.slice(0, -1))
                      else if (digit) handlePinDigit(digit)
                    }}
                    disabled={!digit}
                    className={cn(
                      "h-14 rounded-2xl text-lg font-bold transition-all",
                      digit === '←' ? "bg-secondary/50 text-muted-foreground hover:bg-secondary" :
                      digit ? "bg-secondary hover:bg-secondary/80 active:scale-95 text-foreground" :
                      "invisible"
                    )}
                  >
                    {digit}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLockContext.Provider>
  )
}
