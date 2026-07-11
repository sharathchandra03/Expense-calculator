'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'

type Theme = 'dark' | 'light' | 'system' | 'auto'

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'dark' | 'light'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

/**
 * Phase 14: Smart Theme Schedule
 * - 'auto' mode: dark after 7pm, light before 7am
 * - 'system' mode: follows OS preference
 * - 'dark'/'light': manual override always available
 */
function getAutoTheme(): 'dark' | 'light' {
  const hour = new Date().getHours()
  // Dark: 7pm (19) to 7am (7)
  return (hour >= 19 || hour < 7) ? 'dark' : 'light'
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'theme',
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark')
  const autoIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(storageKey) as Theme | null
    if (stored) setTheme(stored)
  }, [storageKey])

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    let resolved: 'dark' | 'light'

    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } else if (theme === 'auto') {
      resolved = getAutoTheme()
    } else {
      resolved = theme
    }

    root.classList.add(resolved)
    setResolvedTheme(resolved)

    // For 'auto' mode, check every minute if theme should switch
    if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current)
      autoIntervalRef.current = null
    }

    if (theme === 'auto') {
      autoIntervalRef.current = setInterval(() => {
        const newResolved = getAutoTheme()
        if (newResolved !== resolvedTheme) {
          root.classList.remove('light', 'dark')
          root.classList.add(newResolved)
          setResolvedTheme(newResolved)
        }
      }, 60000) // Check every minute
    }

    // For 'system' mode, listen for OS preference changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => {
        const newResolved = e.matches ? 'dark' : 'light'
        root.classList.remove('light', 'dark')
        root.classList.add(newResolved)
        setResolvedTheme(newResolved)
      }
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }

    return () => {
      if (autoIntervalRef.current) clearInterval(autoIntervalRef.current)
    }
  }, [theme])

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme)
      setTheme(newTheme)
    },
    resolvedTheme,
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
