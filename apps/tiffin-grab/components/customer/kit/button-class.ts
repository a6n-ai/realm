// Plain module (no "use client") so server components can style links as kit buttons.
import { cn, FOCUS, FONT, SPRING } from "./cn";

export type ButtonVariant = "primary" | "outline" | "quiet" | "ghost" | "danger" | "hero";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground,#fff)] hover:bg-[color-mix(in_oklch,var(--primary)_86%,black)]",
  hero:
    "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground,#fff)] shadow-[0_12px_30px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent)] hover:bg-[color-mix(in_oklch,var(--primary)_86%,black)]",
  outline: "border-[var(--foreground)] bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)]",
  quiet: "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]",
  ghost: "border-transparent bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)]",
  danger: "border-[#be123c] bg-transparent text-[#be123c] hover:bg-[#be123c1a] dark:border-[#fda4af] dark:text-[#fda4af] dark:hover:bg-[#fda4af1a]",
};

/** The kit button's classes, for links that must look like buttons (public tg-cta / tg-btn match these). */
export function buttonClass({ variant = "outline", size = "md", pill, blocked, className }: { variant?: ButtonVariant; size?: "md" | "lg"; pill?: boolean; blocked?: boolean; className?: string }) {
  return cn(
    FONT,
    FOCUS,
    "inline-flex select-none items-center justify-center gap-2 border-[1.5px] font-semibold [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,opacity] duration-150 active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100",
    SPRING,
    variant === "hero" || pill ? "rounded-full" : "rounded-[14px]",
    variant === "hero" && "px-[22px] text-[15px]",
    size === "lg"
      ? cn("min-h-[50px] px-4 text-[17px] tracking-[-0.022em]", variant === "hero" && "min-h-[52px] px-[22px] text-[15px] tracking-normal")
      : cn("min-h-[44px] px-4 text-[15px]", variant === "hero" && "px-[22px]"),
    VARIANT[variant],
    // Primary actions answer the pointer with a 1px lift as well as the darker fill.
    !blocked && (variant === "primary" || variant === "hero") && "[@media(hover:hover)]:hover:-translate-y-px",
    blocked && "opacity-45 shadow-none",
    className,
  );
}
