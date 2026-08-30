import { Suspense } from "react";
import { ContactIcon } from "lucide-react";
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
import { CloverCustomersSyncActions } from "@/components/admin/clover-customers-sync-actions";
import { requirePermission } from "@/lib/auth/guards";
import { cloverCustomersService } from "@/lib/services/clover-customers.service";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

export const dynamic = "force-dynamic";

export default function CloverCustomersPage() {
  return (
    <PageShell>
      <PageHeader
        icon={ContactIcon}
        title="Customers"
        subtitle="Clover's Customer Directory for this franchise — distinct from our own app customers."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All customers">
        <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
          <CustomersTable />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requirePermission({ clover: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");
  return <CloverCustomersSyncActions cloverConnected={Boolean(clover.connected && clover.merchantId)} />;
}

async function CustomersTable() {
  await requirePermission({ clover: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");

  const rows = await cloverCustomersService.listAll();

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No customers yet. Connect Clover and run Sync from Clover.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Marketing</TableHead>
          <TableHead>Clover id</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.publicId}>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>{r.email ?? "—"}</TableCell>
            <TableCell>{r.phone ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={r.marketingAllowed ? "default" : "outline"}>
                {r.marketingAllowed ? "Opted in" : "Opted out"}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">
              {r.cloverCustomerId ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
