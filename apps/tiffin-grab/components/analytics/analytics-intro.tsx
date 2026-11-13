import type { ReactNode } from "react";
import { ManualRefresh } from "@/components/analytics/manual-refresh";

/** One-line description of the tab, with the tab's own controls beside it (the Refresh button unless a tab brings its own). */
export function AnalyticsIntro({ description, action = <ManualRefresh /> }: { description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-muted-foreground max-w-2xl text-sm text-pretty">{description}</p>
      {action}
    </div>
  );
}
