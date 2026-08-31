import { Suspense } from "react";
import { UsersIcon } from "lucide-react";
import { getCloverConnection } from "@realm/clover";
import { DataTable, PageHeader, PageShell, SectionCard, type Column } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
import { redirect } from "next/navigation";
import { CloverEmployeesSyncActions } from "@/components/admin/clover-employees-sync-actions";
import { SyncOneEmployeeButton } from "@/components/admin/sync-one-employee-button";
import { requirePermission } from "@/lib/auth/guards";
import { employeesService } from "@/lib/services/employees.service";
import { integrationsConfigStore, isCloverVisibleInNav } from "@/lib/services/integrations.service";

const COLUMNS: readonly Column<"name" | "nickname" | "email" | "role" | "status" | "cloverId" | "actions">[] = [
  { key: "name", label: "Name" },
  { key: "nickname", label: "Nickname" },
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status" },
  { key: "cloverId", label: "Clover id" },
  { key: "actions", label: "" },
];

export default function CloverEmployeesPage() {
  return (
    <PageShell>
      <PageHeader
        icon={UsersIcon}
        title="Employees"
        subtitle="Clover Register staff. Assign them to pickup orders for POS ownership."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All employees">
        <Suspense fallback={<DataTable.Skeleton columns={COLUMNS} serial={false} />}>
          <EmployeesTable />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requirePermission({ clover: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");
  return (
    <CloverEmployeesSyncActions
      cloverConnected={Boolean(clover.connected && clover.merchantId)}
    />
  );
}

async function EmployeesTable() {
  await requirePermission({ clover: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");

  const rows = await employeesService.listAll();

  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      serial={false}
      search={{
        keys: ["name", "nickname", "email"],
        placeholder: "Search name, nickname or email…",
        shortPlaceholder: "Search…",
      }}
      emptyIcon={UsersIcon}
      emptyMessage="No employees yet. Connect Clover and run Sync from Clover."
      emptySearchMessage="No employees match your search."
      renderRow={(r) => (
        <>
          <TableCell className="font-medium">
            {r.name}
            {r.isOwner ? (
              <Badge variant="secondary" className="ml-2">
                Owner
              </Badge>
            ) : null}
          </TableCell>
          <TableCell>{r.nickname ?? "—"}</TableCell>
          <TableCell>{r.email ?? "—"}</TableCell>
          <TableCell className="text-muted-foreground text-xs uppercase">
            {r.role ?? "—"}
          </TableCell>
          <TableCell>
            <Badge variant={r.active ? "default" : "outline"}>
              {r.active ? "Active" : "Inactive"}
            </Badge>
          </TableCell>
          <TableCell className="text-muted-foreground font-mono text-xs">
            {r.cloverEmployeeId ?? "—"}
          </TableCell>
          <TableCell className="text-right">
            <SyncOneEmployeeButton publicId={r.publicId} disabled={!r.cloverEmployeeId} />
          </TableCell>
        </>
      )}
    />
  );
}
