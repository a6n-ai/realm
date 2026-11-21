import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";

const DOT = { ok: "bg-success", warn: "bg-warning", muted: "bg-muted-foreground" } as const;

/** One sidebar info-card row, like Vercel's Usage card: icon, muted label, right-aligned value, optional status dot. */
export function CardRow({
  icon: Icon,
  label,
  value,
  dot,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  dot?: keyof typeof DOT;
  valueClassName?: string;
}) {
  return (
    <span className="grid min-w-0 grid-cols-[0.875rem_auto_minmax(0,1fr)_0.375rem] items-center gap-x-2 text-xs">
      <Icon aria-hidden className="text-muted-foreground size-3.5" />
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-foreground min-w-0 truncate text-right tabular-nums", valueClassName)}>{value}</span>
      <span aria-hidden className={cn("size-1.5 rounded-full", dot && DOT[dot])} />
    </span>
  );
}
