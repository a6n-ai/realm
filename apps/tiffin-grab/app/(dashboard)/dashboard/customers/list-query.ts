import { parseSort } from "@foundry/design-system/list-sort";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { withListDates } from "@/lib/list/default-month";
import { CUSTOMER_SORT_KEYS } from "@/lib/services/customers.service";
import { ORDER_STATUS_PILLS } from "../orders/status-pills";

const LATEST_STATUS_OPTIONS = ORDER_STATUS_PILLS.filter((p) => p.value !== "ongoing").map((p) => ({ value: p.value, label: p.label }));

export const CUSTOMER_SPEC: FacetDef[] = [
  { kind: "dateRange", field: "createdAt", label: "Joined" },
  {
    kind: "select",
    field: "planCompletesInDays",
    label: "Plan Completes In",
    options: [
      { value: "3", label: "Next 3 days" },
      { value: "4", label: "Next 4 days" },
      { value: "5", label: "Next 5 days" },
      { value: "7", label: "Next 7 days" },
      { value: "14", label: "Next 14 days" },
    ],
  },
  {
    kind: "select",
    field: "activePlan",
    label: "Active plan",
    options: [
      { value: "yes", label: "Has active plan" },
      { value: "no", label: "No active plan" },
    ],
  },
  {
    kind: "select",
    field: "customerType",
    label: "Customer type",
    options: [
      { value: "none", label: "No orders" },
      { value: "ordered", label: "Has orders (1+)" },
      { value: "new", label: "New (1 order)" },
      { value: "repeat", label: "Repeat (2+ orders)" },
    ],
  },
  { kind: "select", field: "latestStatus", label: "Latest order", options: LATEST_STATUS_OPTIONS },
  { kind: "search", fields: ["name", "phone", "email"] },
];

// Derived values, not columns: the full spec drives the filter UI, the DB condition is
// parsed without them and they go to listCustomersPage as custom filters.
const CUSTOM = ["planCompletesInDays", "activePlan", "customerType", "latestStatus"];
const DB_SPEC = CUSTOMER_SPEC.filter((s) => s.kind !== "select" || !CUSTOM.includes(s.field));

/** The Customers listing's filters, sort and page from the URL. The page and its Excel export share it, so both list the same rows. */
export async function customerListQuery(raw: Record<string, string | undefined>) {
  const sp = await withListDates(raw);
  const sort = parseSort(sp, CUSTOMER_SORT_KEYS, { column: "latestOrder", dir: "desc" });
  const parsed = Number(sp.planCompletesInDays);
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => allowed.find((a) => a === v);
  const { condition, page } = parseFilterState(DB_SPEC, sp);
  return {
    sort,
    condition,
    page,
    custom: {
      planCompletesInDays: sp.planCompletesInDays && Number.isFinite(parsed) ? parsed : undefined,
      activePlan: pick(sp.activePlan, ["yes", "no"] as const),
      customerType: pick(sp.customerType, ["none", "ordered", "new", "repeat"] as const),
      latestStatus: pick(sp.latestStatus, LATEST_STATUS_OPTIONS.map((o) => o.value)),
    },
  };
}
