'use client'

import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'error' | 'success' | 'info' | 'warning'

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const ICONS: Record<ToastType, React.ElementType> = {
  error: AlertCircle,
  warning: AlertCircle,
  success: CheckCircle,
  info: Info,
}

const STYLES: Record<ToastType, { bg: string; icon: string; border: string }> = {
  error: { bg: 'bg-red-500/10', icon: 'text-red-500', border: 'border-red-500/30' },
  warning: { bg: 'bg-amber-500/10', icon: 'text-amber-500', border: 'border-amber-500/30' },
  success: { bg: 'bg-emerald-500/10', icon: 'text-emerald-500', border: 'border-emerald-500/30' },
  info: { bg: 'bg-blue-500/10', icon: 'text-blue-500', border: 'border-blue-500/30' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timerRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const showToast = useCallback((message: string, type: ToastType = 'error') => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])

    // Auto-dismiss after 3 seconds
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      timerRefs.current.delete(id)
    }, 3000)
    timerRefs.current.set(id, timer)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timerRefs.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timerRefs.current.delete(id)
    }
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast container - positioned at top center */}
      <div className="fixed top-4 left-4 right-4 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.type]
            const styles = STYLES[toast.type]
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="pointer-events-auto w-full max-w-sm"
              >
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-lg backdrop-blur-xl",
                  styles.bg, styles.border
                )}>
                  <Icon className={cn("w-5 h-5 flex-shrink-0", styles.icon)} />
                  <p className="flex-1 text-[13px] font-medium text-foreground">{toast.message}</p>
                  <button
                    onClick={() => dismiss(toast.id)}
                    className="p-1 rounded-lg hover:bg-foreground/5 transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
