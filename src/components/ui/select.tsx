'use client'

import * as React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

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
    const triggerRef = useRef<HTMLButtonElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const hiddenSelectRef = useRef<HTMLSelectElement | null>(null)

    const options = extractOptions(children)

    // Determine if value is controlled
    const isControlled = value !== undefined
    const currentValue = isControlled ? (value as string) : internalValue

    const selectedOption = options.find(o => o.value === currentValue)
    const displayLabel = selectedOption?.label || options[0]?.label || 'Select...'
    const hasSelection = selectedOption && selectedOption.value !== ''

    // Close on outside click
    useEffect(() => {
      if (!isOpen) return
      const handleClick = (e: MouseEvent) => {
        if (
          containerRef.current && !containerRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false)
        }
      }
      // Use setTimeout to avoid immediately catching the same click that opened the dropdown
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClick)
      }, 0)
      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('mousedown', handleClick)
      }
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

    const handleSelect = useCallback((optionValue: string) => {
      if (!isControlled) {
        setInternalValue(optionValue)
      }

      // Directly call onChange if provided
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
      <div ref={containerRef} className="relative flex flex-col space-y-1.5 w-full">
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

        {/* Inline Dropdown */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="absolute left-0 right-0 top-full mt-1 z-[9999] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl shadow-black/20 backdrop-blur-xl"
            >
              <div className="max-h-[260px] overflow-y-auto p-1.5 scrollbar-thin" role="listbox">
                {options.filter(o => o.value !== '').map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === currentValue}
                    onClick={() => handleSelect(option.value)}
                    disabled={option.disabled}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-all duration-100",
                      "hover:bg-primary/8 active:scale-[0.98]",
                      option.value === currentValue
                        ? "bg-primary/10 text-primary"
                        : "text-foreground",
                      option.disabled && "opacity-40 pointer-events-none"
                    )}
                  >
                    <span>{option.label}</span>
                    {option.value === currentValue && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select }
