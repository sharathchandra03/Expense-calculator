import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
  prefixSymbol?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, label, prefixSymbol, ...props }, ref) => {
    return (
      <div className="flex flex-col space-y-1.5 w-full">
        {label && (
          <label className="text-xs font-semibold text-muted-foreground/80 tracking-wide uppercase px-0.5">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefixSymbol && (
            <span className="absolute left-4 text-muted-foreground font-medium text-sm select-none">
              {prefixSymbol}
            </span>
          )}
          <input
            type={type}
            className={cn(
              "flex h-11 w-full rounded-2xl border border-border/70 bg-secondary px-4 py-2 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring/80 disabled:cursor-not-allowed disabled:opacity-50",
              prefixSymbol && "pl-8",
              error && "border-destructive focus-visible:ring-destructive focus-visible:border-destructive/80",
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && (
          <span className="text-xs text-destructive px-1 animate-in fade-in slide-in-from-top-1 duration-200">
            {error}
          </span>
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
