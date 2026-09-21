import type { HTMLAttributes, ReactNode } from "react";
import { cn, FONT } from "./cn";

export type Tone = "neutral" | "brand" | "ok" | "up" | "hold" | "vac" | "swap" | "save" | "wash" | "solid" | "soft";

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--muted)] text-[var(--foreground)]",
  brand: "bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] dark:text-[#FFB877]",
  ok: "bg-[var(--s-delivered-bg)] text-[var(--s-delivered-fg)]",
  up: "bg-[var(--s-upcoming-bg)] text-[var(--s-upcoming-fg)]",
  hold: "bg-[var(--s-hold-bg)] text-[var(--s-hold-fg)]",
  vac: "bg-[var(--s-vac-bg)] text-[var(--s-vac-fg)]",
  swap: "bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] dark:text-[#FFB877]",
  /** Savings and offers: saffron text on a 15% saffron wash. */
  save: "bg-[color-mix(in_oklch,var(--primary)_15%,transparent)] text-[var(--primary)]",
  wash: "bg-[color-mix(in_oklch,var(--primary)_10%,transparent)] text-[var(--primary)]",
  solid: "bg-[var(--primary)] text-[var(--primary-foreground,#fff)]",
  soft: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  icon?: ReactNode;
}

interface PillProps extends BadgeProps {
  /** sm: compact 20px tag for dense cards (nutrition, schedule days). */
  size?: "md" | "sm";
}

export function Pill({ tone = "neutral", icon, size = "md", className, children, ...rest }: PillProps) {
  return (
    <span
      {...rest}
      className={cn(FONT, "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full text-xs font-semibold", size === "sm" ? "px-2.5 py-0.5" : "h-7 px-3", TONE[tone], className)}
    >
      {icon}
      {children}
    </span>
  );
}

export function Chip({ tone = "neutral", icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={cn(FONT, "inline-flex h-7 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] tabular-nums", TONE[tone], className)}
    >
      {icon}
      {children}
    </span>
  );
}
