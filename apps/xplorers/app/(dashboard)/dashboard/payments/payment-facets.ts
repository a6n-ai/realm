import type { FacetDef } from "@foundry/design-system";
import { PAYMENT_STATUSES } from "@/db/schema";
import { PAYMENT_STATUS_LABEL } from "@/lib/payments/labels";

const METHOD_FACET: FacetDef = {
  kind: "pills",
  field: "method",
  label: "Method",
  options: [
    { value: "cash", label: "Cash" },
    { value: "etransfer", label: "e-Transfer" },
  ],
};
const DATE_FACET: FacetDef = { kind: "dateRange", field: "createdAt", label: "Date" };
const SEARCH_FACET: FacetDef = { kind: "search", fields: ["name", "email", "reference"] };

export const ALL_PAYMENTS_SPEC: FacetDef[] = [
  {
    kind: "pills",
    field: "status",
    label: "Status",
    options: PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] ?? s })),
  },
  METHOD_FACET,
  DATE_FACET,
  SEARCH_FACET,
];

/** Pending tab: status is fixed by the page, so no status pills. */
export const PENDING_PAYMENTS_SPEC: FacetDef[] = [METHOD_FACET, DATE_FACET, SEARCH_FACET];

export const PAYMENT_SORT_COLUMNS = ["time", "amount", "status"] as const;
