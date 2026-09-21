import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'pill';
  trailingIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild = false, trailingIcon, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    
    // Custom premium styles matching our design system
    const baseStyles = "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]"
    
    const variants = {
      default: "bg-foreground text-background hover:opacity-90 shadow-md",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
      outline: "border border-border/80 bg-transparent hover:bg-muted text-foreground",
      secondary: "bg-secondary text-secondary-foreground hover:opacity-90 border border-border/20",
      ghost: "hover:bg-muted text-foreground",
      link: "text-primary underline-offset-4 hover:underline"
    }

    const sizes = {
      default: "h-10 px-5 rounded-full",
      sm: "h-8 px-3 rounded-full text-xs",
      lg: "h-12 px-7 rounded-full text-base",
      pill: "h-11 px-6 rounded-full text-sm",
      icon: "h-10 w-10 rounded-full"
    }

    return (
      <Comp
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      >
        <span>{children}</span>
        {trailingIcon && (
          <span className="ml-2 w-5 h-5 rounded-full bg-current/10 flex items-center justify-center scale-95 transition-transform group-hover:translate-x-0.5">
            {trailingIcon}
          </span>
        )}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button }
