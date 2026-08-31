import { Suspense } from "react";
import { UsersIcon } from "lucide-react";
import { getCloverConnection } from "@realm/clover";
import { DataTableSkeleton, PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { redirect } from "next/navigation";
import { CloverEmployeesSyncActions } from "@/components/admin/clover-employees-sync-actions";
import { requirePermission } from "@/lib/auth/guards";
import { employeesService } from "@/lib/services/employees.service";
import { integrationsConfigStore, isCloverVisibleInNav } from "@/lib/services/integrations.service";
import { EmployeesTable, EMPLOYEE_COLUMNS } from "./employees-table";

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
        <Suspense fallback={<DataTableSkeleton columns={EMPLOYEE_COLUMNS} serial={false} />}>
          <EmployeesData />
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

async function EmployeesData() {
  await requirePermission({ clover: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");

  const rows = await employeesService.listAll();
  return <EmployeesTable rows={rows} />;
}
