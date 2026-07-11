'use client'

import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UndoAction {
  id: string
  message: string
  onUndo: () => Promise<void> | void
}

interface UndoContextType {
  showUndo: (message: string, onUndo: () => Promise<void> | void) => void
}

const UndoContext = createContext<UndoContextType>({ showUndo: () => {} })

export function useUndo() {
  return useContext(UndoContext)
}

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<UndoAction | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const showUndo = useCallback((message: string, onUndo: () => Promise<void> | void) => {
    // Clear existing timer
    if (timerRef.current) clearTimeout(timerRef.current)

    const id = Date.now().toString()
    setToast({ id, message, onUndo })

    // Auto-dismiss after 4 seconds
    timerRef.current = setTimeout(() => {
      setToast(null)
    }, 4000)
  }, [])

  const handleUndo = useCallback(async () => {
    if (!toast) return
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await toast.onUndo()
    } catch (err) {
      console.error('Undo failed:', err)
    }
    setToast(null)
  }, [toast])

  const handleDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast(null)
  }, [])

  return (
    <UndoContext.Provider value={{ showUndo }}>
      {children}

      {/* Toast UI */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed bottom-24 left-4 right-4 z-[100] mx-auto max-w-sm"
          >
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-foreground/95 text-background shadow-2xl shadow-black/40 backdrop-blur-xl border border-white/10">
              <p className="flex-1 text-xs font-medium truncate">{toast.message}</p>
              <button
                onClick={handleUndo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/20 text-primary font-bold text-xs hover:bg-primary/30 transition-colors flex-shrink-0"
              >
                <Undo2 className="w-3 h-3" />
                Undo
              </button>
              <button
                onClick={handleDismiss}
                className="p-1 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </UndoContext.Provider>
  )
}
