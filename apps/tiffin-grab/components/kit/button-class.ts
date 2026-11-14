// Plain module (no "use client") so server components can style links as kit buttons.
import { cn, FOCUS, FONT, SPRING } from "./cn";

export type ButtonVariant = "primary" | "outline" | "quiet" | "ghost" | "danger" | "hero" | "glass" | "glass-prominent";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "c-surface border-transparent bg-primary text-[var(--primary-foreground,#fff)] hover:bg-[color-mix(in_oklch,var(--primary)_86%,black)]",
  hero:
    "border-primary bg-primary text-[var(--primary-foreground,#fff)] shadow-[0_12px_30px_-8px_color-mix(in_oklch,var(--primary)_70%,transparent)] hover:bg-[color-mix(in_oklch,var(--primary)_86%,black)]",
  // No outlines: secondary buttons are filled and bevelled (Apple style).
  // No outlines: secondary buttons are filled and bevelled (Apple style). The fill is a wash of the text colour,
  // so it always reads a step off whatever it sits on: lighter on the dark green ground, darker on cream.
  outline: "c-surface border-transparent bg-foreground/11 text-foreground hover:bg-foreground/16",
  quiet: "c-surface border-transparent bg-foreground/8 text-foreground hover:bg-foreground/13",
  ghost: "border-transparent bg-transparent text-foreground hover:bg-muted",
  // Floating controls over content (above the tab bar): liquid glass, see .c-liquid in globals.css.
  glass: "c-liquid text-foreground",
  "glass-prominent": "c-liquid-tint text-[var(--primary-foreground,#fff)]",
  danger: "border-[#be123c] bg-transparent text-[#be123c] hover:bg-[#be123c1a] dark:border-[#fda4af] dark:text-[#fda4af] dark:hover:bg-[#fda4af1a]",
};

/** The kit button's classes, for links that must look like buttons (public tg-cta / tg-btn match these). */
export function buttonClass({ variant = "outline", size = "md", pill, blocked, className }: { variant?: ButtonVariant; size?: "md" | "lg"; pill?: boolean; blocked?: boolean; className?: string }) {
  const hero = variant === "hero";
  return cn(
    FONT,
    FOCUS,
    "inline-flex select-none items-center justify-center gap-2 border-[1.5px] font-semibold [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,opacity] duration-150 active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100",
    SPRING,
    // Every customer button is a capsule, the same shape as the tab bar.
    "rounded-full",
    hero ? "px-[22px] text-subhead" : "px-4",
    size === "lg"
      ? (hero ? "min-h-[52px] tracking-normal" : "min-h-[50px] text-body tracking-[-0.022em]")
      : (hero ? "min-h-[44px]" : "min-h-[44px] text-subhead"),
    VARIANT[variant],
    // Primary actions answer the pointer with a 1px lift as well as the darker fill.
    !blocked && (variant === "primary" || variant === "hero") && "hover:-translate-y-px",
    blocked && "opacity-45 shadow-none",
    className,
  );
}
