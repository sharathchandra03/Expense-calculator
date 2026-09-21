'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value: string // YYYY-MM-DD
  onChange: (date: string) => void
  className?: string
  placeholder?: string
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function DatePicker({ value, onChange, className, placeholder = 'Select date' }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number; maxHeight?: number }>({ top: 0, left: 0, width: 280 })
  const [viewDate, setViewDate] = useState(() => {
    if (value) return new Date(value + 'T00:00:00')
    return new Date()
  })

  useEffect(() => {
    if (value) setViewDate(new Date(value + 'T00:00:00'))
  }, [value])

  // Calculate position when opening - flip above the trigger if there isn't enough room below
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const pickerWidth = 288
      // Use the actual rendered height if available, otherwise fall back to an estimate
      const estimatedHeight = 360
      const pickerHeight = calendarRef.current?.offsetHeight || estimatedHeight

      // Find the closest scroll parent (phone frame) to constrain within
      const scrollParent = triggerRef.current.closest('.overflow-y-auto')?.getBoundingClientRect()
      const viewportBottom = scrollParent ? Math.min(scrollParent.bottom, window.innerHeight) : window.innerHeight
      const viewportTop = scrollParent ? Math.max(scrollParent.top, 0) : 0
      const maxRight = scrollParent ? scrollParent.right - 8 : window.innerWidth - 8
      const minLeft = scrollParent ? scrollParent.left + 8 : 8

      const spaceBelow = viewportBottom - rect.bottom
      const spaceAbove = rect.top - viewportTop
      const gap = 4

      let top: number
      let maxHeight: number | undefined

      if (spaceBelow >= pickerHeight + gap || spaceBelow >= spaceAbove) {
        // Open below the trigger
        top = rect.bottom + gap
        const available = viewportBottom - top - 8
        maxHeight = available < pickerHeight ? Math.max(available, 200) : undefined
      } else {
        // Not enough room below - open above the trigger instead
        const desiredTop = rect.top - gap - pickerHeight
        top = Math.max(viewportTop + 8, desiredTop)
        maxHeight = Math.min(pickerHeight, rect.top - gap - top)
      }

      // Center horizontally relative to trigger, but clamp within visible area
      let left = rect.left + (rect.width / 2) - (pickerWidth / 2)
      left = Math.max(minLeft, Math.min(left, maxRight - pickerWidth))

      setDropdownPos({ top, left, width: pickerWidth, maxHeight })
    }
  }, [isOpen])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const goToPrevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const goToNextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const selectDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onChange(dateStr)
    setIsOpen(false)
  }

  const selectToday = () => {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    onChange(dateStr)
    setViewDate(now)
    setIsOpen(false)
  }

  const displayValue = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : placeholder

  const selectedDate = value ? new Date(value + 'T00:00:00') : null
  const isSelected = (day: number) => {
    if (!selectedDate) return false
    return selectedDate.getFullYear() === year && selectedDate.getMonth() === month && selectedDate.getDate() === day
  }
  const isToday = (day: number) => {
    const now = new Date()
    return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day
  }

  const calendarDays: { day: number; isCurrentMonth: boolean }[] = []
  for (let i = firstDay - 1; i >= 0; i--) {
    calendarDays.push({ day: daysInPrevMonth - i, isCurrentMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push({ day: d, isCurrentMonth: true })
  }
  const remaining = 42 - calendarDays.length
  for (let d = 1; d <= remaining; d++) {
    calendarDays.push({ day: d, isCurrentMonth: false })
  }

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-9 px-3 rounded-xl bg-secondary border border-border text-xs text-left text-foreground flex items-center gap-2 hover:border-ring/50 transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>{displayValue}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Full-screen backdrop */}
            <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />

            {/* Dropdown - fixed position */}
            <motion.div
              ref={calendarRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="fixed z-[9999] bg-card border border-border rounded-2xl shadow-elevated p-4 overflow-y-auto"
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
                maxHeight: dropdownPos.maxHeight,
              }}
            >
              {/* Month/Year header */}
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={goToPrevMonth} className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-foreground">{MONTHS[month]} {year}</span>
                <button type="button" onClick={goToNextMonth} className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {WEEKDAYS.map(wd => (
                  <div key={wd} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{wd}</div>
                ))}
              </div>

              {/* Days */}
              <div className="grid grid-cols-7 gap-0.5">
                {calendarDays.map((cell, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={!cell.isCurrentMonth}
                    onClick={() => cell.isCurrentMonth && selectDate(cell.day)}
                    className={cn(
                      'w-8 h-8 rounded-lg text-[11px] font-medium flex items-center justify-center transition-all',
                      !cell.isCurrentMonth && 'text-muted-foreground/25 cursor-default',
                      cell.isCurrentMonth && !isSelected(cell.day) && !isToday(cell.day) && 'text-foreground hover:bg-secondary',
                      cell.isCurrentMonth && isToday(cell.day) && !isSelected(cell.day) && 'text-primary font-bold ring-1 ring-primary/30',
                      cell.isCurrentMonth && isSelected(cell.day) && 'bg-primary text-primary-foreground font-bold'
                    )}
                  >
                    {cell.day}
                  </button>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                <button type="button" onClick={() => { onChange(''); setIsOpen(false) }} className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Clear
                </button>
                <button type="button" onClick={selectToday} className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors">
                  Today
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
