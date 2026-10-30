import { Suspense, type ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { PageShell, type FacetDef } from "@/components/ds";
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
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-foreground text-[1.75rem] leading-9 font-semibold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground text-sm">Business performance across the app.</p>
        </div>
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
          <Suspense fallback={<div className="bg-muted/40 h-11 max-w-3xl animate-pulse rounded-xl" />}>
            <SharedFilters visible={visible} />
          </Suspense>
          <div className="min-w-0">{children}</div>
          </>
        )}
      </div>
    </PageShell>
  );
}

async function SharedFilters({ visible }: { visible: "all" | string[] }) {
  const options = await getAnalyticsFilterOptions(visible);
  return (
    <div className="bg-card flex flex-wrap items-center gap-2 rounded-xl p-2 shadow-[0_1px_8px_rgba(0,0,0,0.04)] sm:p-2.5">
      <AnalyticsFilters
        options={options}
        revenueFacets={REVENUE_FACETS}
        complaintFacets={COMPLAINT_FACETS}
      />
    </div>
  );
}
