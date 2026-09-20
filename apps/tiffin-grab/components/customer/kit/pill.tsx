import type { HTMLAttributes, ReactNode } from "react";
import { cn, FONT } from "./cn";

export type Tone = "neutral" | "brand" | "ok" | "up" | "hold" | "vac" | "swap";

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--muted)] text-[var(--foreground)]",
  brand: "bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] dark:text-[#FFB877]",
  ok: "bg-[var(--s-delivered-bg)] text-[var(--s-delivered-fg)]",
  up: "bg-[var(--s-upcoming-bg)] text-[var(--s-upcoming-fg)]",
  hold: "bg-[var(--s-hold-bg)] text-[var(--s-hold-fg)]",
  vac: "bg-[var(--s-vac-bg)] text-[var(--s-vac-fg)]",
  swap: "bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] dark:text-[#FFB877]",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  icon?: ReactNode;
}

export function Pill({ tone = "neutral", icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={cn(FONT, "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold", TONE[tone], className)}
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
