import type { Column } from "@/components/ds";

// Single source of truth for the table's columns: TemplateList renders the header
// and DataTableSkeleton renders the loading twin from this same array, so the two
// can never drift.
//
// Deliberately NOT in template-list.tsx: that module is "use client", so its
// exports reach the RSC graph as client references. The server-rendered skeleton
// iterates these columns, which would throw on a reference.
export type TemplateSortColumn = "event" | "channels" | "updated";

export const TEMPLATE_COLUMNS: readonly Column<TemplateSortColumn | "actions">[] = [
  { key: "event", label: "Event", sortable: true },
  { key: "channels", label: "Channels", sortable: true },
  { key: "updated", label: "Updated", sortable: true, align: "right" },
  { key: "actions", label: "Actions", align: "right", width: "w-16" },
];
