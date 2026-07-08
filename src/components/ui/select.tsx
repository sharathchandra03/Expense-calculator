'use client'

import * as React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { createPortal } from "react-dom"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

interface OptionData {
  value: string;
  label: string;
  disabled?: boolean;
}

function extractOptions(children: React.ReactNode): OptionData[] {
  const options: OptionData[] = []
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === 'option') {
      const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>
      options.push({
        value: (props.value as string) ?? '',
        label: (props.children as string) ?? '',
        disabled: props.disabled,
      })
    }
  })
  return options
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, label, error, value, defaultValue, onChange, name, ...props }, ref) => {
    const [isOpen, setIsOpen] = useState(false)
    const [internalValue, setInternalValue] = useState<string>((defaultValue as string) ?? '')
    const [isMobile, setIsMobile] = useState(false)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const hiddenSelectRef = useRef<HTMLSelectElement | null>(null)
    const [mounted, setMounted] = useState(false)

    const options = extractOptions(children)

    // Determine if value is controlled
    const isControlled = value !== undefined
    const currentValue = isControlled ? (value as string) : internalValue

    const selectedOption = options.find(o => o.value === currentValue)
    const displayLabel = selectedOption?.label || options[0]?.label || 'Select...'
    const hasSelection = selectedOption && selectedOption.value !== ''

    useEffect(() => {
      setMounted(true)
      const checkMobile = () => setIsMobile(window.innerWidth < 640)
      checkMobile()
      window.addEventListener('resize', checkMobile)
      return () => window.removeEventListener('resize', checkMobile)
    }, [])

    // Close on outside click
    useEffect(() => {
      if (!isOpen) return
      const handleClick = (e: MouseEvent) => {
        if (
          triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
          dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false)
        }
      }
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }, [isOpen])

    // Close on escape
    useEffect(() => {
      if (!isOpen) return
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false)
      }
      document.addEventListener('keydown', handleKey)
      return () => document.removeEventListener('keydown', handleKey)
    }, [isOpen])

    // Lock body scroll when mobile sheet is open
    useEffect(() => {
      if (isOpen && isMobile) {
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = '' }
      }
    }, [isOpen, isMobile])

    const handleSelect = useCallback((optionValue: string) => {
      if (!isControlled) {
        setInternalValue(optionValue)
      }

      // Fire onChange with a synthetic-like event for react-hook-form and direct onChange handlers
      if (hiddenSelectRef.current) {
        // Set the value on the native element
        hiddenSelectRef.current.value = optionValue

        // Create and dispatch a native event that React's onChange will pick up
        const nativeEvent = new Event('input', { bubbles: true })
        hiddenSelectRef.current.dispatchEvent(nativeEvent)

        const changeEvent = new Event('change', { bubbles: true })
        hiddenSelectRef.current.dispatchEvent(changeEvent)
      }

      // Also directly call onChange if provided (belt + suspenders for controlled components)
      if (onChange) {
        const syntheticEvent = {
          target: { value: optionValue, name: name || '' },
          currentTarget: { value: optionValue, name: name || '' },
        } as React.ChangeEvent<HTMLSelectElement>
        onChange(syntheticEvent)
      }

      setIsOpen(false)
    }, [isControlled, onChange, name])

    // Merge refs
    const mergedRef = useCallback((node: HTMLSelectElement | null) => {
      hiddenSelectRef.current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLSelectElement | null>).current = node
      }
    }, [ref])

    return (
      <div className="flex flex-col space-y-1.5 w-full">
        {label && (
          <label className="text-xs font-semibold text-muted-foreground/80 tracking-wide uppercase px-0.5">
            {label}
          </label>
        )}

        {/* Hidden native select for form compatibility */}
        <select
          ref={mergedRef}
          name={name}
          value={currentValue}
          onChange={onChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          {...props}
        >
          {children}
        </select>

        {/* Custom trigger */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-2xl border border-border/70 bg-secondary px-4 py-2 text-sm transition-all",
            "focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring/80",
            "active:scale-[0.98]",
            isOpen && "ring-1 ring-ring border-ring/80",
            error && "border-destructive focus:ring-destructive focus:border-destructive/80",
            !hasSelection && "text-muted-foreground",
            hasSelection && "text-foreground",
            className
          )}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="truncate font-medium text-[13px]">{displayLabel}</span>
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0 ml-2",
            isOpen && "rotate-180"
          )} />
        </button>

        {error && (
          <span className="text-xs text-destructive px-1 animate-in fade-in duration-200">
            {error}
          </span>
        )}

        {/* Dropdown / Bottom Sheet */}
        {mounted && createPortal(
          <AnimatePresence>
            {isOpen && (
              isMobile ? (
                // Mobile Bottom Sheet
                <MobileSheet
                  ref={dropdownRef}
                  options={options}
                  currentValue={currentValue}
                  onSelect={handleSelect}
                  onClose={() => setIsOpen(false)}
                  label={label || displayLabel}
                />
              ) : (
                // Desktop Dropdown
                <DesktopDropdown
                  ref={dropdownRef}
                  options={options}
                  currentValue={currentValue}
                  onSelect={handleSelect}
                  triggerRef={triggerRef}
                />
              )
            )}
          </AnimatePresence>,
          document.body
        )}
      </div>
    )
  }
)
Select.displayName = "Select"

// Desktop floating dropdown
interface DropdownProps {
  options: OptionData[]
  currentValue: string
  onSelect: (value: string) => void
  onClose?: () => void
  triggerRef?: React.RefObject<HTMLButtonElement | null>
  label?: string
}

const DesktopDropdown = React.forwardRef<HTMLDivElement, DropdownProps>(
  ({ options, currentValue, onSelect, triggerRef }, ref) => {
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })

    useEffect(() => {
      if (triggerRef?.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        const dropdownHeight = Math.min(options.length * 44 + 16, 280)
        
        const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight

        setPosition({
          top: showAbove ? rect.top - dropdownHeight - 4 + window.scrollY : rect.bottom + 4 + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
        })
      }
    }, [triggerRef, options.length])

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: -4, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.97 }}
        transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
        style={{ position: 'absolute', top: position.top, left: position.left, width: position.width, zIndex: 9999 }}
        className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl shadow-black/20 backdrop-blur-xl"
      >
        <div className="max-h-[260px] overflow-y-auto p-1.5 scrollbar-thin" role="listbox">
          {options.filter(o => o.value !== '').map((option) => (
            <motion.button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === currentValue}
              onClick={() => onSelect(option.value)}
              disabled={option.disabled}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-all duration-100",
                "hover:bg-primary/8 active:scale-[0.98]",
                option.value === currentValue
                  ? "bg-primary/10 text-primary"
                  : "text-foreground",
                option.disabled && "opacity-40 pointer-events-none"
              )}
              whileTap={{ scale: 0.97 }}
            >
              <span>{option.label}</span>
              {option.value === currentValue && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                  <Check className="h-4 w-4 text-primary" />
                </motion.div>
              )}
            </motion.button>
          ))}
        </div>
      </motion.div>
    )
  }
)
DesktopDropdown.displayName = "DesktopDropdown"

// Mobile bottom sheet
const MobileSheet = React.forwardRef<HTMLDivElement, DropdownProps>(
  ({ options, currentValue, onSelect, onClose, label }, ref) => {
    return (
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        {/* Sheet */}
        <motion.div
          ref={ref}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          className="fixed bottom-0 left-0 right-0 z-[9999] max-h-[70vh] rounded-t-3xl border-t border-border/60 bg-card shadow-2xl shadow-black/30"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="px-6 pt-2 pb-4 border-b border-border/40">
            <h3 className="text-sm font-bold text-foreground tracking-tight">
              {label || 'Choose an option'}
            </h3>
          </div>

          {/* Options */}
          <div className="overflow-y-auto max-h-[calc(70vh-100px)] px-3 py-2 pb-8" role="listbox">
            {options.filter(o => o.value !== '').map((option, index) => (
              <motion.button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === currentValue}
                onClick={() => onSelect(option.value)}
                disabled={option.disabled}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03, duration: 0.2 }}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl px-4 py-3.5 my-0.5 text-[14px] font-medium transition-all duration-100",
                  "active:scale-[0.97]",
                  option.value === currentValue
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-secondary/80",
                  option.disabled && "opacity-40 pointer-events-none"
                )}
              >
                <span>{option.label}</span>
                {option.value === currentValue && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center"
                  >
                    <Check className="h-3.5 w-3.5 text-primary" />
                  </motion.div>
                )}
              </motion.button>
            ))}
          </div>

          {/* Safe area spacer for iPhone notch */}
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </motion.div>
      </>
    )
  }
)
MobileSheet.displayName = "MobileSheet"

export { Select }
