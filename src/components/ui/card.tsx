import * as React from "react"
import { cn } from "@/lib/utils"

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  outerClassName?: string;
  noBezel?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, outerClassName, noBezel = false, children, ...props }, ref) => {
    if (noBezel) {
      return (
        <div
          ref={ref}
          className={cn(
            "rounded-2xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden",
            className
          )}
          {...props}
        >
          {children}
        </div>
      );
    }

    return (
      <div className={cn("double-bezel-outer", outerClassName)}>
        <div
          ref={ref}
          className={cn(
            "double-bezel-inner bg-card text-card-foreground p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] border border-border/30 overflow-hidden",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </div>
    );
  }
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1 p-0 mb-4", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-base font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-0 mt-4 border-t border-border/40 pt-4", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
