import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";

export type PulseItem = {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone: "sky" | "blush" | "sunshine";
  icon: LucideIcon;
};

const TONE: Record<PulseItem["tone"], string> = {
  sky: "xl-pulse-sky",
  blush: "xl-pulse-blush",
  sunshine: "xl-pulse-sunshine",
};

export function PulseStrip({ items }: { items: PulseItem[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2.5 sm:gap-3" aria-label="Your week at a glance">
      {items.map((item) => {
        const Icon = item.icon;
        const body = (
          <>
            <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase sm:text-xs">
              <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden />
              {item.label}
            </span>
            <span
              className="mt-1.5 block text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {item.value}
            </span>
            {item.hint ? <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{item.hint}</span> : null}
          </>
        );
        const className = cn("xl-pulse block h-full sm:px-4", TONE[item.tone]);
        return (
          <li key={item.label}>
            {item.href ? (
              <Link href={item.href} className={className}>
                {body}
              </Link>
            ) : (
              <div className={className}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
