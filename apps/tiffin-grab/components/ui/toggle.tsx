"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Toggle as TogglePrimitive } from "radix-ui"

import { cn } from "@foundry/ui/cn"

const toggleVariants = cva(
  "group/toggle inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors outline-none select-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-primary/6 data-[state=on]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          // The dark: base styles outrank a plain data-[state=on] rule, so the "on" look is repeated under dark: too.
          "border border-border bg-background text-muted-foreground data-[state=on]:border-primary/50 dark:border-input dark:bg-input/30 dark:data-[state=on]:border-primary/50 dark:data-[state=on]:bg-primary/8",
      },
      size: {
        default: "h-8 min-w-8 px-2.5",
        sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2 text-[0.8rem]",
        lg: "h-9 min-w-9 px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
