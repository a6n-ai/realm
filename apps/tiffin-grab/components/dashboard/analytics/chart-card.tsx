import type { ReactNode } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { ChartBoundary } from "@/components/dashboard/analytics/chart-boundary";
import { InfoTip } from "@/components/dashboard/analytics/chart-tip";

/**
 * Shared titled card around a chart or list so every analytics tab lines up.
 * Title only, like Vercel: the subtitle and `info` live behind the info icon,
 * so side-by-side cards share a header height. Loading is the caller's Suspense
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
      <Card>
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-1.5">
            <h2 className="min-w-0 truncate">{title}</h2>
            {subtitle || info ? <InfoTip>{[subtitle, info].filter(Boolean).join(". ")}</InfoTip> : null}
          </CardTitle>
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
        <CardContent className={fill ? "flex min-h-0 flex-1 flex-col" : undefined}>
          <ChartBoundary>{children}</ChartBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
