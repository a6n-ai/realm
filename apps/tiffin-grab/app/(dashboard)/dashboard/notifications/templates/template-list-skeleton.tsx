import { DataTableSkeleton } from "@/components/ds";
import { TEMPLATE_COLUMNS } from "@/components/notifications/template-list";

// Loading twin is owned by DataTable — same COLUMNS, zero drift. This module is
// a Server Component, so it imports the skeleton by name: dotting into
// DataTable.Skeleton would resolve against a client-reference proxy.
export function TemplateListSkeleton() {
  return <DataTableSkeleton columns={TEMPLATE_COLUMNS} />;
}
