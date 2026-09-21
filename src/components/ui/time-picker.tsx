'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TimePickerProps {
  value: string // HH:mm (24h format)
  onChange: (time: string) => void
  className?: string
  placeholder?: string
}

export function TimePicker({ value, onChange, className, placeholder = 'Set time' }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number; maxHeight?: number }>({ top: 0, left: 0, width: 260 })
  const [hour, setHour] = useState(12)
  const [minute, setMinute] = useState(0)
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM')

  useEffect(() => {
    if (value) {
      const [h, m] = value.split(':').map(Number)
      if (!isNaN(h) && !isNaN(m)) {
        const hr12 = h === 0 ? 12 : h > 12 ? h - 12 : h
        setHour(hr12)
        setMinute(m)
        setPeriod(h >= 12 ? 'PM' : 'AM')
      }
    }
  }, [value])

  // Calculate position when opening - flip above the trigger if there isn't enough room below
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const pickerWidth = 264
      const estimatedHeight = 300
      const pickerHeight = panelRef.current?.offsetHeight || estimatedHeight

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

  const formatDisplay = () => {
    if (!value) return placeholder
    const parts = value.split(':')
    if (parts.length < 2) return placeholder
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    if (isNaN(h) || isNaN(m)) return placeholder
    const hr12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    const p = h >= 12 ? 'PM' : 'AM'
    return `${hr12}:${String(m).padStart(2, '0')} ${p}`
  }

  const confirmTime = () => {
    let h24 = hour
    if (period === 'AM' && hour === 12) h24 = 0
    else if (period === 'PM' && hour !== 12) h24 = hour + 12
    const timeStr = `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    onChange(timeStr)
    setIsOpen(false)
  }

  const setNow = () => {
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    onChange(timeStr)
    setIsOpen(false)
  }

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-9 px-3 rounded-xl bg-secondary border border-border text-xs text-left text-foreground flex items-center gap-2 hover:border-ring/50 transition-colors"
      >
        <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>{formatDisplay()}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />

            <motion.div
              ref={panelRef}
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
              {/* Time display */}
              <div className="text-center mb-4">
                <span className="text-2xl font-bold text-foreground tracking-tight">
                  {hour}:{String(minute).padStart(2, '0')}{' '}
                  <span className="text-sm font-semibold text-muted-foreground">{period}</span>
                </span>
              </div>

              {/* Hour / Minute / Period selectors */}
              <div className="flex gap-2 mb-4">
                <div className="flex-1">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase text-center block mb-1.5">Hour</label>
                  <ScrollColumn items={Array.from({ length: 12 }, (_, i) => i + 1)} selected={hour} onSelect={setHour} />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase text-center block mb-1.5">Min</label>
                  <ScrollColumn items={Array.from({ length: 60 }, (_, i) => i)} selected={minute} onSelect={setMinute} padZero />
                </div>
                <div className="w-14">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase text-center block mb-1.5">&nbsp;</label>
                  <div className="flex flex-col gap-1.5">
                    <button type="button" onClick={() => setPeriod('AM')} className={cn('h-9 rounded-lg text-xs font-bold transition-all', period === 'AM' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>
                      AM
                    </button>
                    <button type="button" onClick={() => setPeriod('PM')} className={cn('h-9 rounded-lg text-xs font-bold transition-all', period === 'PM' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>
                      PM
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-border/50">
                <button type="button" onClick={setNow} className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors">
                  Now
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { onChange(''); setIsOpen(false) }} className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg">
                    Clear
                  </button>
                  <button type="button" onClick={confirmTime} className="text-[11px] font-bold text-primary-foreground bg-primary px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
                    Done
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// Scroll column for hour/minute selection
function ScrollColumn({ items, selected, onSelect, padZero }: {
  items: number[]
  selected: number
  onSelect: (val: number) => void
  padZero?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const idx = items.indexOf(selected)
    if (idx >= 0 && containerRef.current) {
      const itemEl = containerRef.current.children[idx] as HTMLElement
      if (itemEl) {
        itemEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
  }, [selected, items])

  return (
    <div
      ref={containerRef}
      className="h-[110px] overflow-y-auto rounded-xl bg-secondary/50 border border-border/50"
      style={{ scrollbarWidth: 'none' }}
    >
      {items.map(item => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(item)}
          className={cn(
            'w-full h-9 flex items-center justify-center text-xs font-medium transition-all',
            selected === item
              ? 'bg-primary text-primary-foreground font-bold rounded-lg'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          {padZero ? String(item).padStart(2, '0') : item}
        </button>
      ))}
    </div>
  )
}
