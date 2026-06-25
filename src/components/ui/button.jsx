import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "../../lib/utils"

const buttonVariants = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"

const getVariantClasses = (variant) => {
  switch (variant) {
    case "default": return "bg-primary text-primary-foreground shadow hover:bg-primary/90"
    case "destructive": return "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
    case "outline": return "border border-border bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
    case "secondary": return "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80"
    case "ghost": return "hover:bg-accent hover:text-accent-foreground"
    case "link": return "text-primary underline-offset-4 hover:underline"
    default: return "bg-primary text-primary-foreground shadow hover:bg-primary/90"
  }
}

const getSizeClasses = (size) => {
  switch (size) {
    case "default": return "h-9 px-4 py-2"
    case "sm": return "h-8 rounded-md px-3 text-xs"
    case "lg": return "h-10 rounded-md px-8"
    case "icon": return "h-9 w-9"
    default: return "h-9 px-4 py-2"
  }
}

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants, getVariantClasses(variant), getSizeClasses(size), className)}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button }
