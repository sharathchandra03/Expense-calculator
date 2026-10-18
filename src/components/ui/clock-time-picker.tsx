'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Keyboard } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClockTimePickerProps {
  /** Whether the picker dialog is open */
  open: boolean
  /** Current value in HH:mm (24h) format */
  value: string
  /** Called with the confirmed HH:mm value when the user taps OK */
  onConfirm: (time: string) => void
  /** Called when the user cancels or dismisses */
  onCancel: () => void
  /** Accent color token (defaults to primary) */
  accent?: string
}

type Mode = 'hour' | 'minute'

/**
 * Material-style clock time picker with a flip-digit display, AM/PM toggle,
 * an analog dial for choosing the hour / minute, and a keyboard-entry fallback.
 * Rendered as a centered modal dialog to mirror the reference design.
 */
export function ClockTimePicker({ open, value, onConfirm, onCancel, accent }: ClockTimePickerProps) {
  const [hour, setHour] = useState(11) // 1-12
  const [minute, setMinute] = useState(6) // 0-59
  const [period, setPeriod] = useState<'AM' | 'PM'>('PM')
  const [mode, setMode] = useState<Mode>('hour')
  const [keyboard, setKeyboard] = useState(false)
  const dialRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // Hydrate from incoming value whenever the dialog opens
  useEffect(() => {
    if (!open) return
    setMode('hour')
    setKeyboard(false)
    if (value) {
      const [h, m] = value.split(':').map(Number)
      if (!isNaN(h) && !isNaN(m)) {
        setHour(h === 0 ? 12 : h > 12 ? h - 12 : h)
        setMinute(m)
        setPeriod(h >= 12 ? 'PM' : 'AM')
        return
      }
    }
    const now = new Date()
    const h = now.getHours()
    setHour(h === 0 ? 12 : h > 12 ? h - 12 : h)
    setMinute(now.getMinutes())
    setPeriod(h >= 12 ? 'PM' : 'AM')
  }, [open, value])

  const accentColor = accent || 'var(--primary, #6d5efc)'

  const confirm = () => {
    let h24 = hour
    if (period === 'AM' && hour === 12) h24 = 0
    else if (period === 'PM' && hour !== 12) h24 = hour + 12
    onConfirm(`${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
  }

  // --- Dial math -----------------------------------------------------------
  // Angle (deg) where 0 = 12 o'clock position, increasing clockwise.
  const valueToAngle = (val: number, count: number) => (val % count) * (360 / count)

  const handleFromPointer = useCallback((clientX: number, clientY: number) => {
    const dial = dialRef.current
    if (!dial) return
    const rect = dial.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    let angle = Math.atan2(dx, -dy) * (180 / Math.PI) // 0 at top, clockwise
    if (angle < 0) angle += 360

    if (mode === 'hour') {
      let h = Math.round(angle / 30) % 12
      if (h === 0) h = 12
      setHour(h)
    } else {
      let m = Math.round(angle / 6) % 60
      setMinute(m)
    }
  }, [mode])

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    handleFromPointer(e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    handleFromPointer(e.clientX, e.clientY)
  }
  const onPointerUp = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    // After choosing an hour, advance to minutes for a one-gesture flow
    if (mode === 'hour') setTimeout(() => setMode('minute'), 180)
  }

  const handAngle = mode === 'hour' ? valueToAngle(hour, 12) : valueToAngle(minute, 60)

  const dialNumbers =
    mode === 'hour'
      ? Array.from({ length: 12 }, (_, i) => i + 1)
      : Array.from({ length: 12 }, (_, i) => i * 5)

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
            className="relative w-full max-w-[320px] rounded-3xl bg-[#2a2a2e] p-5 shadow-2xl"
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60 mb-4">
              Select time
            </p>

            {/* Flip-style HH : MM display + AM/PM */}
            <div className="flex items-stretch gap-2 mb-5">
              <FlipField
                active={mode === 'hour'}
                accent={accentColor}
                value={hour}
                min={1}
                max={12}
                onFocus={() => setMode('hour')}
                onCommit={(v) => setHour(v)}
                onDone={() => setMode('minute')}
              />
              <span className="flex items-center text-4xl font-bold text-white/80">:</span>
              <FlipField
                active={mode === 'minute'}
                accent={accentColor}
                value={minute}
                min={0}
                max={59}
                onFocus={() => setMode('minute')}
                onCommit={(v) => setMinute(v)}
              />

              <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-white/15 ml-1">
                {(['AM', 'PM'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={cn(
                      'w-14 flex-1 px-2 text-sm font-semibold transition-colors',
                      period === p ? 'text-white' : 'text-white/55 hover:text-white/80'
                    )}
                    style={period === p ? { backgroundColor: hexToRgba(accentColor, 0.28) } : undefined}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {keyboard ? (
              <KeyboardEntry
                hour={hour}
                minute={minute}
                onHour={(h) => setHour(h)}
                onMinute={(m) => setMinute(m)}
              />
            ) : (
              /* Analog clock dial */
              <div className="flex justify-center py-2">
                <div
                  ref={dialRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  className="relative h-[232px] w-[232px] touch-none select-none rounded-full bg-[#3a3a3f]"
                >
                  {/* Center pivot */}
                  <div
                    className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: accentColor }}
                  />

                  {/* Hand */}
                  <div
                    className="absolute left-1/2 top-1/2 origin-bottom"
                    style={{
                      height: 'calc(50% - 26px)',
                      width: '2px',
                      backgroundColor: accentColor,
                      transform: `translate(-50%, -100%) rotate(${handAngle}deg)`,
                      transformOrigin: 'bottom center',
                      transition: draggingRef.current ? 'none' : 'transform 0.18s ease',
                    }}
                  />

                  {/* Numbers — positioned by clock value so they line up with
                      the hand. The hand places value v at (v * stepDeg) clockwise
                      from the 12-o'clock (top) position, so each label must sit at
                      the same angle. stepDeg = 30 for hours, 6 for minutes. */}
                  {dialNumbers.map((num) => {
                    const stepDeg = mode === 'hour' ? 30 : 6
                    // For hours, 12 sits at the top (0°); for minutes, 0 sits at top.
                    const clockValue = mode === 'hour' ? (num % 12) : num
                    const angle = (clockValue * stepDeg - 90) * (Math.PI / 180)
                    const radius = 92
                    const x = Math.cos(angle) * radius
                    const y = Math.sin(angle) * radius
                    const selected =
                      mode === 'hour' ? hour === num : minute === num
                    const label = mode === 'minute' ? String(num).padStart(2, '0') : num
                    return (
                      <div
                        key={num}
                        className={cn(
                          'absolute flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-medium transition-colors',
                          selected ? 'text-white' : 'text-white/80'
                        )}
                        style={{
                          left: `calc(50% + ${x}px)`,
                          top: `calc(50% + ${y}px)`,
                          transform: 'translate(-50%, -50%)',
                          backgroundColor: selected ? accentColor : 'transparent',
                        }}
                      >
                        {label}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setKeyboard((k) => !k)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                aria-label="Toggle keyboard entry"
              >
                <Keyboard className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-sm font-semibold uppercase tracking-wide text-white/70 hover:text-white transition-colors"
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
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

function FlipField({
  value,
  active,
  accent,
  min,
  max,
  onFocus,
  onCommit,
  onDone,
}: {
  value: number
  active: boolean
  accent: string
  min: number
  max: number
  onFocus: () => void
  onCommit: (v: number) => void
  /** Called once a complete value is entered (e.g. advance hour → minute). */
  onDone?: () => void
}) {
  // Local draft of what the user is typing. `null` means "show the real value".
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  // Show the live draft only while this field is active; otherwise always show
  // the canonical, zero-padded value. (Draft is cleared on blur / focus too.)
  const display = active && draft !== null ? draft : String(value).padStart(2, '0')

  const handleChange = (raw: string) => {
    // Keep digits only, max 2 characters
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    setDraft(digits)

    if (digits === '') return

    const n = Number(digits)
    // Commit a clamped value live so the dial/hand follow along as you type.
    onCommit(clamp(n))

    // Auto-advance once the entry is unambiguous:
    //  - two digits typed, or
    //  - a single digit that cannot be the start of a valid 2-digit value
    //    (e.g. for hours, typing "2" can't become "20".. "29", so move on).
    const couldTypeMore = Number(digits + '0') <= max
    if (digits.length === 2 || !couldTypeMore) {
      onDone?.()
    }
  }

  const commitBlur = () => {
    if (draft !== null && draft !== '') onCommit(clamp(Number(draft)))
    setDraft(null)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={display}
      onFocus={() => { onFocus(); setDraft(''); requestAnimationFrame(() => inputRef.current?.select()) }}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={commitBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') { commitBlur(); inputRef.current?.blur() } }}
      aria-label={max === 12 ? 'Hour' : 'Minute'}
      className={cn(
        'h-[72px] w-[84px] rounded-xl text-center text-5xl font-bold tabular-nums transition-colors focus:outline-none',
        active ? 'text-white ring-2' : 'bg-white/10 text-white/80'
      )}
      style={active ? { backgroundColor: hexToRgba(accent, 0.3), ['--tw-ring-color' as string]: accent } : undefined}
    />
  )
}

function KeyboardEntry({
  hour,
  minute,
  onHour,
  onMinute,
}: {
  hour: number
  minute: number
  onHour: (h: number) => void
  onMinute: (m: number) => void
}) {
  return (
    <div className="flex items-center justify-center gap-3 py-8">
      <input
        type="number"
        min={1}
        max={12}
        value={hour}
        onChange={(e) => {
          const v = Math.min(12, Math.max(1, Number(e.target.value) || 1))
          onHour(v)
        }}
        className="h-16 w-20 rounded-xl bg-white/10 text-center text-3xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/30"
      />
      <span className="text-3xl font-bold text-white/70">:</span>
      <input
        type="number"
        min={0}
        max={59}
        value={String(minute).padStart(2, '0')}
        onChange={(e) => {
          const v = Math.min(59, Math.max(0, Number(e.target.value) || 0))
          onMinute(v)
        }}
        className="h-16 w-20 rounded-xl bg-white/10 text-center text-3xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/30"
      />
    </div>
  )
}

/** Convert a hex / css color into an rgba string. Falls back to the input for non-hex. */
function hexToRgba(color: string, alpha: number): string {
  const hex = color.trim()
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!match) {
    // css var or named color — wrap with color-mix for alpha
    return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`
  }
  const r = parseInt(match[1], 16)
  const g = parseInt(match[2], 16)
  const b = parseInt(match[3], 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
