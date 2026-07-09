import { DataTableSkeleton } from "@/components/ds";
import { TEMPLATE_COLUMNS } from "@/components/notifications/template-columns";

// Loading twin is owned by DataTable — same COLUMNS, zero drift. This module is a
// Server Component, so it must not reach into "use client" modules: it imports the
// skeleton by name (not DataTable.Skeleton) and the columns from a plain module.
// Both would otherwise resolve to client references and throw at render.
export function TemplateListSkeleton() {
  return <DataTableSkeleton columns={TEMPLATE_COLUMNS} />;
}
