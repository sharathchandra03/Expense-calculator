'use client'

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Fingerprint, X, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

const LOCK_PIN_KEY = 'pennyflow-lock-pin-hash'
const LOCK_ENABLED_KEY = 'pennyflow-lock-enabled'
const LOCK_BIOMETRIC_KEY = 'pennyflow-lock-biometric'
const LAST_ACTIVITY_KEY = 'pennyflow-last-activity'

interface AppLockContextType {
  isLocked: boolean
  isEnabled: boolean
  isBiometricAvailable: boolean
  isBiometricEnabled: boolean
  enableLock: (pin: string) => void
  disableLock: () => void
  enableBiometric: () => Promise<boolean>
  disableBiometric: () => void
  changePIN: (oldPin: string, newPin: string) => boolean
}

const AppLockContext = createContext<AppLockContextType>({
  isLocked: false,
  isEnabled: false,
  isBiometricAvailable: false,
  isBiometricEnabled: false,
  enableLock: () => {},
  disableLock: () => {},
  enableBiometric: async () => false,
  disableBiometric: () => {},
  changePIN: () => false,
})

export function useAppLock() {
  return useContext(AppLockContext)
}

// Simple hash function for local PIN
function hashPIN(pin: string): string {
  let hash = 0
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

function verifyPIN(input: string, storedHash: string): boolean {
  return hashPIN(input) === storedHash
}

// Check if biometric/screen lock auth is available
async function checkBiometricAvailability(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  // Check if the device supports screen lock (fingerprint/face/PIN)
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

// Trigger device screen lock (fingerprint/face/device PIN) — NOT passkeys
async function authenticateWithBiometric(): Promise<boolean> {
  try {
    // Use the Web Lock Screen verification via navigator.credentials
    // This triggers the DEVICE lock screen (fingerprint/face) not a passkey flow
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'PennyFlow' },
        user: {
          id: new TextEncoder().encode('pennyflow-local-user'),
          name: 'local',
          displayName: 'PennyFlow User',
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // ONLY device biometric, no external keys
          userVerification: 'required', // Forces fingerprint/face
          residentKey: 'discouraged', // Don't create a passkey
        },
        timeout: 60000,
        attestation: 'none',
      },
    })
    return !!credential
  } catch {
    return false
  }
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false)
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [error, setError] = useState('')
  const [biometricAttempting, setBiometricAttempting] = useState(false)
  const activityTimer = useRef<NodeJS.Timeout | null>(null)

  // Initialize lock state
  useEffect(() => {
    if (typeof window === 'undefined') return

    const enabled = localStorage.getItem(LOCK_ENABLED_KEY) === 'true'
    const biometric = localStorage.getItem(LOCK_BIOMETRIC_KEY) === 'true'
    setIsEnabled(enabled)
    setIsBiometricEnabled(biometric)

    // Check biometric availability
    checkBiometricAvailability().then(setIsBiometricAvailable)

    if (enabled) {
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY)
      const timeout = 5 * 60 * 1000 // 5 minutes
      if (!lastActivity || Date.now() - parseInt(lastActivity) > timeout) {
        setIsLocked(true)
      }
    }
  }, [])

  // Auto-attempt biometric unlock when lock screen shows
  useEffect(() => {
    if (isLocked && isBiometricEnabled && isBiometricAvailable && !biometricAttempting) {
      // Small delay to let the lock screen render first
      const timer = setTimeout(() => {
        attemptBiometricUnlock()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isLocked, isBiometricEnabled, isBiometricAvailable])

  const attemptBiometricUnlock = async () => {
    setBiometricAttempting(true)
    try {
      const success = await authenticateWithBiometric()
      if (success) {
        setIsLocked(false)
        setPinInput('')
        setError('')
        localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())
      }
    } catch {}
    setBiometricAttempting(false)
  }

  // Track activity for auto-lock
  useEffect(() => {
    if (!isEnabled || isLocked) return

    const updateActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString())
    }

    const checkTimeout = () => {
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY)
      const timeout = 5 * 60 * 1000
      if (lastActivity && Date.now() - parseInt(lastActivity) > timeout) {
        setIsLocked(true)
      }
    }

    updateActivity()
    const events = ['mousedown', 'touchstart', 'keydown', 'scroll']
    events.forEach(event => document.addEventListener(event, updateActivity, { passive: true }))
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
    localStorage.setItem(LOCK_BIOMETRIC_KEY, 'false')
    setIsEnabled(false)
    setIsBiometricEnabled(false)
    setIsLocked(false)
  }, [])

  const enableBiometric = useCallback(async (): Promise<boolean> => {
    const available = await checkBiometricAvailability()
    if (!available) return false

    // Test that biometric actually works by doing a verification
    const success = await authenticateWithBiometric()
    if (success) {
      localStorage.setItem(LOCK_BIOMETRIC_KEY, 'true')
      setIsBiometricEnabled(true)
      return true
    }
    return false
  }, [])

  const disableBiometric = useCallback(() => {
    localStorage.setItem(LOCK_BIOMETRIC_KEY, 'false')
    setIsBiometricEnabled(false)
  }, [])

  const changePIN = useCallback((oldPin: string, newPin: string): boolean => {
    const stored = localStorage.getItem(LOCK_PIN_KEY)
    if (!stored || !verifyPIN(oldPin, stored)) return false
    localStorage.setItem(LOCK_PIN_KEY, hashPIN(newPin))
    return true
  }, [])

  const handlePinDigit = (digit: string) => {
    if (pinInput.length >= 4) return
    const newPin = pinInput + digit
    setPinInput(newPin)
    if (newPin.length === 4) {
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
    <AppLockContext.Provider value={{ isLocked, isEnabled, isBiometricAvailable, isBiometricEnabled, enableLock, disableLock, enableBiometric, disableBiometric, changePIN }}>
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
                <p className="text-[13px] text-muted-foreground mt-1">
                  {isBiometricEnabled ? 'Use fingerprint or enter PIN' : 'Enter your 4-digit PIN'}
                </p>
              </div>

              {/* Biometric button */}
              {isBiometricEnabled && isBiometricAvailable && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={attemptBiometricUnlock}
                  disabled={biometricAttempting}
                  className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors"
                >
                  <Fingerprint className={cn("w-10 h-10 text-primary", biometricAttempting && "animate-pulse")} />
                  <span className="text-[12px] font-medium text-primary">
                    {biometricAttempting ? 'Verifying...' : 'Tap to unlock with fingerprint'}
                  </span>
                </motion.button>
              )}

              {/* Divider if both options available */}
              {isBiometricEnabled && isBiometricAvailable && (
                <div className="flex items-center gap-3 w-full">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground">or use PIN</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

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
