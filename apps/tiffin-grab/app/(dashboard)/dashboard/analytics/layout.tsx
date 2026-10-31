import { Suspense, type ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { Skeleton } from "@foundry/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { BarChart3Icon } from "lucide-react";
import { PageShell, PageHeader, type FacetDef } from "@/components/ds";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { getAnalyticsFilterOptions } from "@/lib/services/analytics/shared-filters";
import { REVENUE_METHODS } from "@/lib/services/analytics/revenue.service";
import { methodLabel } from "@/lib/analytics/revenue";
import { categoryLabel, SUBCATEGORIES, TICKET_CATEGORIES } from "@/lib/support/ticket-taxonomy";
import { PRIORITY_OPTIONS } from "@/lib/support/ticket-priority";
import { STATUS_OPTIONS } from "@/lib/services/analytics/complaint-filters";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
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
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  const noAccess = visible !== "all" && visible.length === 0;

  return (
    <PageShell>
      <PageHeader icon={BarChart3Icon} title="Analytics" subtitle="Business performance across the app." />
      {noAccess ? (
        <Alert variant="destructive">
          <AlertTitle>No franchise access</AlertTitle>
          <AlertDescription>
            Your account isn&apos;t linked to any franchise, so there is no analytics to show. Ask an admin to add
            you to a franchise.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Suspense fallback={null}>
            <AnalyticsTabs />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-10 w-64" />}>
            <SharedFilters visible={visible} />
          </Suspense>
          <div className="flex min-w-0 flex-col gap-6">{children}</div>
        </>
      )}
    </PageShell>
  );
}

async function SharedFilters({ visible }: { visible: "all" | string[] }) {
  const options = await getAnalyticsFilterOptions(visible);
  return (
    <AnalyticsFilters
      options={options}
      revenueFacets={REVENUE_FACETS}
      complaintFacets={COMPLAINT_FACETS}
    />
  );
}
