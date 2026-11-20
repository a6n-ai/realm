import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { badgeTone } from "@foundry/ui/badge"
import { cn } from "@foundry/ui/cn"

const badgeVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center w-fit border border-transparent font-medium whitespace-nowrap outline-none transition-shadow",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-3",
  ],
  {
    variants: {
      variant: {
        default: `bg-primary text-primary-foreground ${badgeTone.brand}`,
        outline: `border-border bg-transparent dark:bg-input/32 ${badgeTone.neutral}`,
        secondary: `bg-secondary text-secondary-foreground ${badgeTone.neutral}`,
        info: `bg-info text-white ${badgeTone.info}`,
        success: `bg-success text-white ${badgeTone.success}`,
        warning: `bg-warning text-white ${badgeTone.warning}`,
        destructive: `bg-destructive text-white ${badgeTone.danger}`,
        focus: `bg-focus text-focus-foreground ${badgeTone.brand}`,
        invert: `bg-invert text-invert-foreground ${badgeTone.neutral}`,
        "primary-light": `border-primary/10 bg-primary/10 text-primary dark:border-primary/25 dark:bg-primary/15 dark:text-primary ${badgeTone.brand}`,
        "warning-light": `border-warning/15 bg-warning/10 text-warning-foreground dark:border-warning/25 dark:bg-warning/15 dark:text-warning ${badgeTone.warning}`,
        "success-light": `border-success/15 bg-success/10 text-success-foreground dark:border-success/25 dark:bg-success/15 dark:text-success ${badgeTone.success}`,
        "info-light": `border-info/15 bg-info/10 text-info-foreground dark:border-info/25 dark:bg-info/15 dark:text-info ${badgeTone.info}`,
        "destructive-light": `border-destructive/15 bg-destructive/10 text-destructive-foreground dark:border-destructive/25 dark:bg-destructive/15 dark:text-destructive ${badgeTone.danger}`,
        "invert-light": `border-invert/15 bg-invert/10 text-foreground dark:border-invert/45 dark:bg-invert/35 dark:text-invert-foreground ${badgeTone.neutral}`,
        "focus-light": `border-focus/15 bg-focus/10 text-focus-foreground dark:border-focus/25 dark:bg-focus/15 dark:text-focus ${badgeTone.brand}`,
        "primary-outline": `bg-background border-border text-primary dark:bg-input/30 ${badgeTone.brand}`,
        "warning-outline": `bg-background border-border text-warning-foreground dark:bg-input/30 ${badgeTone.warning}`,
        "success-outline": `bg-background border-border text-success-foreground dark:bg-input/30 ${badgeTone.success}`,
        "info-outline": `bg-background border-border text-info-foreground dark:bg-input/30 ${badgeTone.info}`,
        "destructive-outline": `bg-background border-border text-destructive-foreground dark:bg-input/30 ${badgeTone.danger}`,
        "invert-outline": `bg-background border-border text-invert-foreground dark:bg-input/30 ${badgeTone.neutral}`,
        "focus-outline": `bg-background border-border text-focus-foreground dark:bg-input/30 ${badgeTone.brand}`,
      },
      size: {
        xs: "px-1 py-0.25 text-[0.6rem] leading-none h-4 min-w-4 gap-1",
        sm: "px-1 py-0.25 text-[0.625rem] leading-none h-4.5 min-w-4.5 gap-1",
        default: "px-1.25 py-0.5 text-xs h-5 min-w-5 gap-1",
        lg: "px-1.5 py-0.5 text-xs h-5.5 min-w-5.5 gap-1",
        xl: "px-2 py-0.75 text-sm h-6 min-w-6 gap-1.5",
      },
      /** `default`: active style radius. `full`: pill radius. */
      radius: {
        default:
          "rounded-sm",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      radius: "default",
    },
  }
)

interface BadgeProps
  extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  asChild?: boolean
}

function Badge({
  className,
  variant,
  size,
  radius,
  asChild = false,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-size={size ?? "default"}
      className={cn(badgeVariants({ variant, size, radius, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants, type BadgeProps }
