import { Suspense, type ReactNode } from "react";
import { BarChart3Icon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader, type FacetDef } from "@/components/ds";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getAnalyticsFilterOptions } from "@/lib/services/analytics/shared-filters";
import { REVENUE_METHODS } from "@/lib/services/analytics/revenue.service";
import { methodLabel } from "@/lib/analytics/revenue";
import { categoryLabel, SUBCATEGORIES, TICKET_CATEGORIES } from "@/lib/support/ticket-taxonomy";
import { PRIORITY_OPTIONS } from "@/lib/support/ticket-priority";
import { STATUS_OPTIONS } from "@/lib/services/analytics/complaint-filters";
import { AnalyticsTabs } from "./analytics-tabs";

const REVENUE_FACETS: FacetDef[] = [
  {
    kind: "multi",
    field: "method",
    label: "Payment method",
    options: REVENUE_METHODS.map((m) => ({ value: m, label: methodLabel(m) })),
  },
];

const COMPLAINT_FACETS: FacetDef[] = [
  {
    kind: "multi",
    field: "category",
    label: "Category",
    options: TICKET_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) })),
  },
  {
    kind: "multi",
    field: "subcategory",
    label: "Sub-category",
    dependsOn: "category",
    options: TICKET_CATEGORIES.flatMap((c) =>
      SUBCATEGORIES[c].map((s) => ({ value: s.value, label: s.label, parent: c })),
    ),
  },
  { kind: "multi", field: "status", label: "Status", options: STATUS_OPTIONS.map((s) => ({ ...s })) },
  { kind: "multi", field: "priority", label: "Priority", options: PRIORITY_OPTIONS.map((p) => ({ ...p })) },
];

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
  const [options, { timezone }] = await Promise.all([getAnalyticsFilterOptions(), getAppSettings()]);
  return (
    <AnalyticsFilters
      options={options}
      timezone={timezone}
      revenueFacets={REVENUE_FACETS}
      complaintFacets={COMPLAINT_FACETS}
    />
  );
}
