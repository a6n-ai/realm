import type { FacetDef } from "@/components/ds";
import type { OrderFacetField } from "@/lib/analytics/metrics/orders";
import { ORDER_STATUS_PILLS } from "@/lib/orders/status-pills";
import { UNASSIGNED_OWNER } from "@/lib/list/presets";

// Typed against ORDER_FACET_FIELDS so analytics drill links cannot name a filter the listing lacks.
type Option = { value: string; label: string };
const field = (f: OrderFacetField) => f;

/**
 * The Orders listing's facets. plan / mealSize / zone / org are `multi` (comma list in the URL parses
 * to an IN), so analytics drill links can carry several values. Status stays a single-value pill.
 */
/**
 * `?starts=N`: first delivery from today through the next N calendar days (inclusive of
 * today). So `7` is today..today+6 — the same window as the "Starting soon" KPI.
 * Applied by the page, not parseFilterState.
 */
export const STARTS_FIELD = "starts";
export const STARTS_DAYS = [0, 7, 14] as const;
const STARTS_OPTIONS = STARTS_DAYS.map((d) => ({ value: String(d), label: d === 0 ? "Today" : `Next ${d} days` }));

export function buildOrdersSpec(o: { planOptions: Option[]; sizeOptions: Option[]; zoneOptions: Option[]; orgOptions: Option[]; ownerOptions?: Option[]; frequencyOptions?: Option[] }): FacetDef[] {
  return [
    { kind: "pills", field: field("status"), label: "Status", options: ORDER_STATUS_PILLS.map((p) => ({ value: p.value, label: p.label })) },
    ...(o.ownerOptions?.length
      ? [{ kind: "select" as const, field: "owner", label: "Owner", options: [{ value: UNASSIGNED_OWNER, label: "Unassigned" }, ...o.ownerOptions] }]
      : []),
    { kind: "multi", field: field("plan"), label: "Plan", options: o.planOptions },
    { kind: "multi", field: field("mealSize"), label: "Meal size", options: o.sizeOptions },
    { kind: "multi", field: field("zone"), label: "Zone", options: o.zoneOptions },
    ...(o.orgOptions.length > 1 ? [{ kind: "multi" as const, field: field("org"), label: "Franchise", options: o.orgOptions }] : []),
    {
      kind: "select",
      field: field("tier"),
      label: "Size tier",
      options: [
        { value: "budget", label: "Budget" },
        { value: "medium", label: "Medium" },
        { value: "premium", label: "Premium" },
      ],
    },
    { kind: "select", field: "planType", label: "Plan type", options: [{ value: "paid", label: "Paid plan" }, { value: "trial", label: "Trial" }] },
    ...(o.frequencyOptions?.length ? [{ kind: "multi" as const, field: "frequency", label: "Frequency", options: o.frequencyOptions }] : []),
    { kind: "select", field: STARTS_FIELD, label: "Starts", options: STARTS_OPTIONS },
    { kind: "dateRange", field: field("createdAt"), label: "Created" },
    { kind: "select", field: "missed", label: "Deliveries", options: [{ value: "yes", label: "Has missed deliveries" }] },
    { kind: "search", fields: ["fullName", "deploymentId", "email"] },
  ];
}
