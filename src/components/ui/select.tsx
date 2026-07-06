import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col space-y-1.5 w-full">
        {label && (
          <label className="text-xs font-semibold text-muted-foreground/80 tracking-wide uppercase px-0.5">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            ref={ref}
            className={cn(
              "flex h-11 w-full appearance-none rounded-2xl border border-border/70 bg-secondary px-4 py-2 text-sm transition-all text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring/80 disabled:cursor-not-allowed disabled:opacity-50 pr-10",
              error && "border-destructive focus:ring-destructive focus:border-destructive/80",
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="absolute right-4 h-4.5 w-4.5 text-muted-foreground pointer-events-none" />
        </div>
        {error && (
          <span className="text-xs text-destructive px-1 animate-in fade-in duration-200">
            {error}
          </span>
        )}
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select }
