import type { FacetDef } from "@/components/ds";

// Run history filters on a job's page. Client-safe: rendered by runs-table.tsx.
export const CRON_RUN_FACETS: FacetDef[] = [
  {
    kind: "pills",
    field: "status",
    label: "Status",
    options: [
      { value: "ok", label: "OK" },
      { value: "failed", label: "Failed" },
      { value: "running", label: "Running" },
    ],
  },
  {
    kind: "pills",
    field: "trigger",
    label: "Started by",
    options: [
      { value: "schedule", label: "Scheduled" },
      { value: "manual", label: "Run now" },
    ],
  },
  { kind: "dateRange", field: "startedAt", label: "When" },
];
