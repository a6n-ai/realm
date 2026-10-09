import { Suspense, type ReactNode } from "react";
import { BarChart3Icon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { getAnalyticsFilterOptions } from "@/lib/services/analytics/shared-filters";
import { AnalyticsTabs } from "./analytics-tabs";

export default async function AnalyticsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <PageShell>
      <PageHeader icon={BarChart3Icon} title="Analytics" subtitle="Business performance across the app." />
      <Suspense fallback={null}>
        <AnalyticsTabs />
      </Suspense>
      <Suspense fallback={<div className="bg-muted/40 h-10 max-w-3xl animate-pulse rounded-lg" />}>
        <SharedFilters />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}

async function SharedFilters() {
  const options = await getAnalyticsFilterOptions();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AnalyticsFilters options={options} />
    </div>
  );
}
