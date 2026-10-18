import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  label?: string;
}

/**
 * Themed multi-line text input. Matches the `Input` component's surface,
 * radius, focus ring and error styling so forms stay consistent.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, label, rows = 4, ...props }, ref) => {
    return (
      <div className="flex flex-col space-y-1.5 w-full">
        {label && (
          <label className="text-xs font-semibold text-muted-foreground/80 tracking-wide uppercase px-0.5">
            {label}
          </label>
        )}
        <textarea
          rows={rows}
          className={cn(
            "flex w-full rounded-2xl border border-border/70 bg-secondary px-4 py-3 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring/80 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
            error && "border-destructive focus-visible:ring-destructive focus-visible:border-destructive/80",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <span className="text-xs text-destructive px-1 animate-in fade-in slide-in-from-top-1 duration-200">
            {error}
          </span>
        )}
      </div>
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
