import { DataTable } from "@/components/ds";
import { TEMPLATE_COLUMNS } from "@/components/notifications/template-list";

// Loading twin is owned by DataTable — same COLUMNS, zero drift.
export function TemplateListSkeleton() {
  return <DataTable.Skeleton columns={TEMPLATE_COLUMNS} />;
}
