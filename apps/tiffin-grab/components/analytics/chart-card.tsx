import type { ReactNode } from "react";
import { AnalyticsPanel, AnalyticsPanelHeader } from "@/components/analytics/analytics-panel";

/** Shared titled panel around a chart or list so every analytics tab lines up. */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AnalyticsPanel padding="lg" className="flex flex-col gap-4">
      <AnalyticsPanelHeader title={title} subtitle={subtitle} action={action} />
      <div className="min-w-0">{children}</div>
    </AnalyticsPanel>
  );
}
