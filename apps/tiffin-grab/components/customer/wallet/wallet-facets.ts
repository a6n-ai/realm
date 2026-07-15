import type { FacetDef } from "@/components/ds";

export const WALLET_FACETS: FacetDef[] = [
  {
    kind: "pills",
    field: "direction",
    label: "Type",
    options: [
      { value: "credit", label: "Earned" },
      { value: "debit", label: "Spent" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "Date" },
];
