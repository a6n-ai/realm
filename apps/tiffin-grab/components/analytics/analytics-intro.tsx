import type { ReactNode } from "react";

/** One-line description of the tab, with the tab's own controls (live stamp, month nav) beside it. */
export function AnalyticsIntro({ description, action }: { description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-muted-foreground max-w-2xl text-sm text-pretty">{description}</p>
      {action}
    </div>
  );
}
