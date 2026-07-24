import type { FacetDef } from "@/components/ds";

export const MONEY_LEDGER_FACETS: FacetDef[] = [
  {
    kind: "pills",
    field: "type",
    label: "Type",
    options: [
      { value: "payment", label: "Payment" },
      { value: "refund", label: "Refund" },
      { value: "discount", label: "Discount" },
      { value: "adjustment", label: "Adjustment" },
    ],
  },
];
