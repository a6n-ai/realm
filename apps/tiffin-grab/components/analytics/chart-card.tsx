import type { ReactNode } from "react";
import { SectionCard } from "@/components/ds";
import { ChartBoundary } from "@/components/analytics/chart-boundary";

/**
 * Shared titled card around a chart or list so every analytics tab lines up.
 * Loading is the caller's Suspense fallback (`ChartSkeleton`); a throw inside
 * shows an inline error with Retry; empty data is each chart's `ChartEmpty`.
 * `fill` stretches the card to its grid row so side-by-side cards match heights.
 */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
  fill = true,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  fill?: boolean;
}) {
  return (
    <div className={fill ? "h-full min-w-0 [&>*]:h-full" : "min-w-0"}>
      <SectionCard title={title} subtitle={subtitle} action={action}>
        <ChartBoundary>{children}</ChartBoundary>
      </SectionCard>
    </div>
  );
}
