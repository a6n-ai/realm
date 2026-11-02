import type { ReactNode } from "react";
import { Card } from "@/components/ds";
import { ChartBoundary } from "@/components/analytics/chart-boundary";
import { InfoTip } from "@/components/analytics/chart-tip";

/**
 * Shared titled card around a chart or list so every analytics tab lines up.
 * The subtitle is one truncated line so side-by-side cards share a header height;
 * longer notes go in `info`, behind an icon. Loading is the caller's Suspense
 * fallback (`ChartSkeleton`); a throw inside shows an inline error with Retry;
 * empty data is each chart's `ChartEmpty`. `fill` stretches the card to its grid row.
 */
export function ChartCard({
  title,
  subtitle,
  info,
  action,
  children,
  fill = true,
}: {
  title: string;
  subtitle?: string;
  info?: string;
  action?: ReactNode;
  children: ReactNode;
  fill?: boolean;
}) {
  return (
    <div className={fill ? "h-full min-w-0 [&>*]:h-full" : "min-w-0"}>
      <Card variant="glow" className="p-5">
        <header className="mb-3 flex items-start justify-between gap-3 md:mb-4">
          <div className="min-w-0 space-y-0.5 md:space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-balance md:text-lg">{title}</h2>
            {subtitle ? (
              <div className="flex items-center gap-1.5">
                <p className="text-muted-foreground min-w-0 truncate text-sm" title={subtitle}>
                  {subtitle}
                </p>
                {info ? <InfoTip>{info}</InfoTip> : null}
              </div>
            ) : null}
          </div>
          {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
        </header>
        <ChartBoundary>{children}</ChartBoundary>
      </Card>
    </div>
  );
}
