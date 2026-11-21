import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";

/** One row of the sidebar clock card: icon, text that truncates, optional trailing status dot. */
export function CardRow({
  icon: Icon,
  label,
  dot,
  className,
  children,
}: {
  icon: LucideIcon;
  /** Accessible name for the icon's meaning, read before the text. */
  label: string;
  dot?: "ok" | "warn" | "muted";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("text-muted-foreground grid min-w-0 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2 text-xs", className)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 truncate">{children}</span>
      {dot ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[dot])} /> : <span aria-hidden />}
    </span>
  );
}

const DOT = { ok: "bg-success", warn: "bg-warning", muted: "bg-muted-foreground" } as const;
