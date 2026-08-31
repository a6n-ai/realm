import { Suspense } from "react";
import { ScrollTextIcon } from "lucide-react";
import {
  PageHeader,
  PageShell,
  SectionCard,
  parseFilterState,
  type FacetDef,
} from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { auditService, type AuditSortColumn } from "@/lib/services/audit.service";
import { LogsTable, LogsTableSkeleton } from "./logs-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const AUDIT_SORT_COLUMNS = [
  "time",
  "entity",
  "operation",
  "actor",
] as const satisfies readonly AuditSortColumn[];

const SPEC: FacetDef[] = [
  {
    kind: "pills",
    field: "operation",
    label: "Operation",
    options: [
      { value: "create", label: "Create" },
      { value: "update", label: "Update" },
      { value: "delete", label: "Delete" },
      { value: "read", label: "Read" },
      { value: "login", label: "Login" },
      { value: "logout", label: "Logout" },
      { value: "login_failed", label: "Login failed" },
    ],
  },
  {
    kind: "pills",
    field: "entity",
    label: "Entity",
    options: [
      { value: "auth", label: "Auth" },
      { value: "products", label: "Products" },
      { value: "orders", label: "Orders" },
      { value: "employees", label: "Employees" },
      { value: "inventory", label: "Inventory" },
      { value: "integrations", label: "Integrations" },
      { value: "product_categories", label: "Categories" },
      { value: "modifier_groups", label: "Modifier groups" },
      { value: "modifiers", label: "Modifiers" },
      { value: "menus", label: "Menus" },
      { value: "discounts", label: "Discounts" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "When" },
  {
    kind: "search",
    fields: ["entityPublicId", "actorEmail", "actorName"],
  },
];

export default function LogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={ScrollTextIcon}
        title="Logs"
        subtitle="Admin actions and entity changes across the app."
      />
      <SectionCard title="Activity">
        <Suspense fallback={<LogsTableSkeleton />}>
          <LogsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function LogsData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ audit: ["read"] });

  const sp = await searchParams;
  const sort = parseSort(sp, AUDIT_SORT_COLUMNS, { column: "time", dir: "desc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  const result = await auditService.queryLogs(condition, page, sort);

  return (
    <LogsTable
      spec={SPEC}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
