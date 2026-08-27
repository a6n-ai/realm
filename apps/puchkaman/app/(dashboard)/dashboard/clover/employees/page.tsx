import { Suspense } from "react";
import { UsersIcon } from "lucide-react";
import { getCloverConnection } from "@realm/clover";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@realm/ui/table";
import { redirect } from "next/navigation";
import { CloverEmployeesSyncActions } from "@/components/admin/clover-employees-sync-actions";
import { SyncOneEmployeeButton } from "@/components/admin/sync-one-employee-button";
import { requirePermission } from "@/lib/auth/guards";
import { employeesService } from "@/lib/services/employees.service";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

export const dynamic = "force-dynamic";

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
        <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
          <EmployeesTable />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requirePermission({ clover: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");
  return (
    <CloverEmployeesSyncActions
      cloverConnected={Boolean(clover.connected && clover.merchantId)}
    />
  );
}

async function EmployeesTable() {
  await requirePermission({ clover: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");

  const rows = await employeesService.listAll();

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No employees yet. Connect Clover and run Sync from Clover.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Nickname</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Clover id</TableHead>
          <TableHead className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.publicId}>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
