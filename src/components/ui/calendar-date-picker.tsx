'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, ChevronDown, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CalendarDatePickerProps {
  /** Whether the picker dialog is open */
  open: boolean
  /** Current value in YYYY-MM-DD format */
  value: string
  /** Called with the confirmed YYYY-MM-DD value when the user taps OK */
  onConfirm: (date: string) => void
  /** Called when the user cancels or dismisses */
  onCancel: () => void
  /** Accent color token (defaults to primary) */
  accent?: string
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * Material-style calendar date picker rendered as a centered modal dialog.
 * Mirrors the ClockTimePicker surface: a themed card, "SELECT DATE" header, a
 * large day label, month navigation, a day grid, and CANCEL / OK footer
 * buttons. Colors use theme tokens so the picker follows light/dark mode.
 * Also offers a keyboard-entry mode (pencil toggle) for typing the date.
 */
export function CalendarDatePicker({ open, value, onConfirm, onCancel, accent }: CalendarDatePickerProps) {
  // The in-progress selection — only committed to the form on OK.
  const [selected, setSelected] = useState<Date>(() => parseValue(value))
  // Month currently shown in the grid.
  const [viewDate, setViewDate] = useState<Date>(() => parseValue(value))
  const [keyboard, setKeyboard] = useState(false)
  const [typed, setTyped] = useState('')
  // Which grid the calendar is showing: days, months, or years.
  const [view, setView] = useState<'day' | 'month' | 'year'>('day')

  // Re-hydrate from the incoming value every time the dialog opens.
  useEffect(() => {
    if (!open) return
    const d = parseValue(value)
    setSelected(d)
    setViewDate(d)
    setKeyboard(false)
    setTyped(toYMD(d))
    setView('day')
  }, [open, value])

  const accentColor = accent || 'var(--primary, #6d5efc)'

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // The stepper moves by month in the day grid, and by year when picking a
  // month or year (year view scrolls through 12-year pages).
  const stepBack = () =>
    setViewDate(view === 'day' ? new Date(year, month - 1, 1) : new Date(year - (view === 'year' ? 12 : 1), month, 1))
  const stepForward = () =>
    setViewDate(view === 'day' ? new Date(year, month + 1, 1) : new Date(year + (view === 'year' ? 12 : 1), month, 1))

  // A 12-year page centered near the current year (shows a few past years).
  const years = Array.from({ length: 12 }, (_, i) => year - 7 + i)

  const pick = (day: number) => {
    const d = new Date(year, month, day)
    setSelected(d)
    setTyped(toYMD(d))
  }

  const confirm = () => onConfirm(toYMD(selected))

  const isSelected = (day: number) =>
    selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day

  const isToday = (day: number) => {
    const now = new Date()
    return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day
  }

  // Build the 6-week grid (leading blanks + days of the month).
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const headerLabel = selected.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  const applyTyped = (raw: string) => {
    setTyped(raw)
    // Accept a complete, valid YYYY-MM-DD date and reflect it in the grid.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
    if (!m) return
    const d = new Date(raw + 'T00:00:00')
    if (isNaN(d.getTime())) return
    setSelected(d)
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1))
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="relative w-full max-w-[340px] rounded-3xl bg-popover text-popover-foreground shadow-elevated border border-border overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 pt-5 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Select date
              </p>
              <div className="flex items-center justify-between">
                <h2 className="text-[30px] font-bold leading-tight text-foreground">{headerLabel}</h2>
                <button
                  type="button"
                  onClick={() => setKeyboard(k => !k)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  aria-label="Toggle keyboard entry"
                >
                  <Pencil className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>

            <div className="h-px bg-border" />

            {keyboard ? (
              /* Keyboard entry */
              <div className="px-6 py-8">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Enter date
                </label>
                <input
                  autoFocus
                  type="date"
                  value={typed.length === 10 ? typed : toYMD(selected)}
                  onChange={(e) => applyTyped(e.target.value)}
                  className="w-full h-12 rounded-xl bg-secondary px-4 text-[17px] font-semibold text-foreground focus:outline-none focus:ring-2"
                  style={{ ['--tw-ring-color' as string]: accentColor }}
                />
              </div>
            ) : (
              <div className="px-5 py-4">
                {/* Header: tappable month+year label (opens month/year pickers)
                 * plus prev/next stepper. The stepper steps months in day view,
                 * and years in month/year view. */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => setView(v => (v === 'day' ? 'year' : 'day'))}
                    className="flex items-center gap-1 rounded-lg px-1.5 py-1 -ml-1.5 text-[15px] font-semibold text-foreground hover:bg-secondary transition-colors"
                    aria-label="Switch between day, month and year"
                  >
                    {view === 'day' ? `${MONTHS[month]} ${year}` : view === 'month' ? year : 'Select year'}
                    <ChevronDown className={cn('w-4 h-4 transition-transform', view !== 'day' && 'rotate-180')} />
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={stepBack}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      aria-label="Previous"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={stepForward}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      aria-label="Next"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* ---- Year grid ---- */}
                {view === 'year' && (
                  <div className="grid grid-cols-4 gap-1.5 py-1 max-h-[232px] overflow-y-auto">
                    {years.map(y => {
                      const sel = y === year
                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => {
                            setViewDate(new Date(y, month, 1))
                            setView('month')
                          }}
                          className={cn(
                            'h-11 rounded-xl text-[14px] font-semibold flex items-center justify-center transition-colors',
                            sel ? 'text-white' : 'text-foreground hover:bg-secondary',
                          )}
                          style={sel ? { backgroundColor: accentColor } : undefined}
                        >
                          {y}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* ---- Month grid ---- */}
                {view === 'month' && (
                  <div className="grid grid-cols-3 gap-1.5 py-1">
                    {MONTHS.map((mName, mIdx) => {
                      const sel = mIdx === month
                      return (
                        <button
                          key={mName}
                          type="button"
                          onClick={() => {
                            setViewDate(new Date(year, mIdx, 1))
                            setView('day')
                          }}
                          className={cn(
                            'h-12 rounded-xl text-[13.5px] font-semibold flex items-center justify-center transition-colors',
                            sel ? 'text-white' : 'text-foreground hover:bg-secondary',
                          )}
                          style={sel ? { backgroundColor: accentColor } : undefined}
                        >
                          {mName.slice(0, 3)}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* ---- Day grid ---- */}
                {view === 'day' && (
                  <>
                    <div className="grid grid-cols-7 mb-1">
                      {WEEKDAYS.map((wd, i) => (
                        <div key={i} className="text-center text-[12px] font-medium text-muted-foreground/70 py-1">{wd}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1">
                      {cells.map((day, idx) => {
                        if (day === null) return <div key={idx} />
                        const sel = isSelected(day)
                        const today = isToday(day)
                        return (
                          <div key={idx} className="flex justify-center">
                            <button
                              type="button"
                              onClick={() => pick(day)}
                              className={cn(
                                'w-10 h-10 rounded-full text-[15px] font-medium flex items-center justify-center transition-colors',
                                sel ? 'text-white' : 'text-foreground hover:bg-secondary',
                                !sel && today && 'ring-1 ring-ring/40',
                              )}
                              style={sel ? { backgroundColor: accentColor } : undefined}
                            >
                              {day}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-6 px-6 pb-5 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                className="text-sm font-semibold uppercase tracking-wide transition-colors hover:brightness-125"
                style={{ color: accentColor }}
              >
                OK
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/** Parse a YYYY-MM-DD string into a local Date, falling back to today. */
function parseValue(value: string): Date {
  if (value) {
    const d = new Date(value + 'T00:00:00')
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

/** Format a Date to a local YYYY-MM-DD string (no timezone drift). */
function toYMD(d: Date): string {
  return ymd(d.getFullYear(), d.getMonth(), d.getDate())
}
