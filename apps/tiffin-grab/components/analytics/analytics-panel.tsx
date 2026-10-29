import type { ReactNode } from "react";
import { cn } from "@foundry/ui/cn";

/**
 * Soft enterprise panel used across analytics — white surface, light shadow,
 * rounded-xl. Visual shell only; callers keep their own titles and data.
 */
export function AnalyticsPanel({
  children,
  className,
  padding = "md",
}: {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}) {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground rounded-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]",
        padding === "sm" && "p-3",
        padding === "md" && "p-4 sm:p-5",
        padding === "lg" && "p-5 sm:p-6",
        padding === "none" && "p-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AnalyticsPanelHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-muted-foreground mt-0.5 text-xs text-pretty">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Uppercase micro-label used on scorecards and toolbars. */
export function AnalyticsEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "text-muted-foreground text-[11px] font-semibold tracking-[0.04em] uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Soft pill for status / grain / filter chips inside analytics. */
export function AnalyticsBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "brand" | "primary";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "ok" && "bg-[color-mix(in_oklab,var(--accent-badge)_16%,transparent)] text-[var(--accent-badge)]",
        tone === "warn" && "bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-[var(--warning-foreground)]",
        tone === "brand" && "bg-[var(--primary-wash)] text-[var(--sidebar-accent-foreground)]",
        tone === "primary" && "bg-primary text-primary-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
