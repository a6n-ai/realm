"use client";

import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";

/**
 * Generic Integrations catalog card chrome (installable plugin tile).
 * Clover-specific status/actions live in `@foundry/clover/ui`; payment and
 * other plugins compose this shell from the CRM package.
 */
export function IntegrationPluginCard({
  icon,
  label,
  description,
  statusLabel,
  children,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  /** e.g. "Installed" / "Connected" — omit when not installed. */
  statusLabel?: string | null;
  /** Action row (Add / Remove / Configure). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          {icon}
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{label}</p>
            {statusLabel ? (
              <span className="text-ok inline-flex items-center gap-1 text-xs font-medium">
                <CheckIcon className="size-3.5" />
                {statusLabel}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function IntegrationPluginCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="bg-muted size-9 shrink-0 animate-pulse rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="bg-muted h-4 w-24 animate-pulse rounded" />
          <div className="bg-muted h-3 w-full max-w-56 animate-pulse rounded" />
        </div>
      </div>
      <div className="bg-muted h-8 w-28 animate-pulse rounded-md" />
    </div>
  );
}
