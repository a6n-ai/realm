import type { ReactNode } from "react";

/** Section title used on every analytics tab, matching Profitability. */
export function AnalyticsPageHeader({
  section,
  title,
  description,
  action,
}: {
  section: string;
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="text-muted-foreground mb-1 flex items-center gap-2 text-[11px] font-semibold tracking-[0.04em] uppercase">
          <span>Analytics</span>
          <span aria-hidden>/</span>
          <span className="text-primary">{section}</span>
        </div>
        <h2 className="text-foreground text-[1.5rem] leading-8 font-semibold tracking-tight sm:text-[1.75rem] sm:leading-9">
          {title ?? section}
        </h2>
        <p className="text-muted-foreground mt-0.5 max-w-2xl text-sm text-pretty">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
