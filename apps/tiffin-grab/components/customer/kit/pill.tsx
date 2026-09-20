import type { HTMLAttributes, ReactNode } from "react";
import { cn, FONT } from "./cn";

export type Tone = "neutral" | "brand" | "ok" | "up" | "hold" | "vac" | "swap";

const wash = (v: string, fb: string, pct = 15) =>
  `bg-[color-mix(in_oklch,var(${v},${fb})_${pct}%,transparent)]`;

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--muted)] text-[var(--foreground)]",
  brand: "bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] dark:text-[#FFB877]",
  ok: `${wash("--s-delivered", "#10b981", 16)} text-[#105030] dark:text-[#6ee7b7]`,
  up: `${wash("--s-upcoming", "#0ea5e9", 14)} text-[#0369a1] dark:text-[#7dd3fc]`,
  hold: `${wash("--s-hold", "#f43f5e", 14)} text-[#be123c] dark:text-[#fda4af]`,
  vac: `${wash("--s-vacation", "#d98a00", 16)} text-[#92600a] dark:text-[#fcd34d]`,
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
