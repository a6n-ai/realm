import type { FacetDef } from "@/components/ds";
import type { OrderFacetField } from "@/lib/services/analytics/metrics/orders";
import { ORDER_STATUS_PILLS } from "./status-pills";

// Typed against ORDER_FACET_FIELDS so analytics drill links cannot name a filter the listing lacks.
type Option = { value: string; label: string };
const field = (f: OrderFacetField) => f;

/**
 * The Orders listing's facets. plan / mealSize / zone / org are `multi` (comma list in the URL parses
 * to an IN), so analytics drill links can carry several values. Status stays a single-value pill.
 */
export function buildOrdersSpec(o: { planOptions: Option[]; sizeOptions: Option[]; zoneOptions: Option[]; orgOptions: Option[] }): FacetDef[] {
  return [
    { kind: "pills", field: field("status"), label: "Status", options: ORDER_STATUS_PILLS.map((p) => ({ value: p.value, label: p.label })) },
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
    { kind: "dateRange", field: field("createdAt"), label: "Created" },
    { kind: "select", field: "missed", label: "Deliveries", options: [{ value: "yes", label: "Has missed deliveries" }] },
    { kind: "search", fields: ["fullName", "deploymentId", "email"] },
  ];
}
