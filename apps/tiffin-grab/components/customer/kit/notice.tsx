import { AlertCircle, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn, FONT } from "./cn";

/** Icon + plain-words line. Explanations are visible text, never tooltips. */
export function Reason({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn(FONT, "flex items-start gap-2 text-[13px] text-[var(--muted-foreground,#6E6558)]", className)}>
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "error"; children: ReactNode; className?: string }) {
  const error = tone === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        FONT,
        "flex items-start gap-2 rounded-2xl px-4 py-3 text-sm",
        error
          ? "bg-[color-mix(in_oklch,var(--s-hold,#f43f5e)_14%,transparent)] text-[#be123c] dark:text-[#fda4af]"
          : "bg-[var(--muted)] text-[var(--foreground)]",
        className,
      )}
    >
      {error ? <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Info aria-hidden className="mt-0.5 size-4 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}
