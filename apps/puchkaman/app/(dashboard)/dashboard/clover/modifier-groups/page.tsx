import { Suspense } from "react";
import { LayersIcon } from "lucide-react";
import { getCloverConnection } from "@realm/clover";
import { formatMoney } from "@realm/commons";
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
import { CloverCatalogSyncActions } from "@/components/admin/clover-catalog-sync-actions";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { inventoryCatalogService } from "@/lib/services/inventory.service";

export const dynamic = "force-dynamic";

export default function CloverModifierGroupsPage() {
  return (
    <PageShell>
      <PageHeader
        icon={LayersIcon}
        title="Modifier groups"
        subtitle="Clover modifier groups and modifiers. Checkout modifier UX deferred."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All modifier groups">
        <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
          <GroupsTable />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderActions() {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");
  return (
    <CloverCatalogSyncActions
      cloverConnected={Boolean(clover.connected && clover.merchantId)}
    />
  );
}

async function GroupsTable() {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");

  const rows = await inventoryCatalogService.modifierGroups.listWithModifiers();

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No modifier groups yet. Sync from Clover to pull them.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {rows.map((g) => (
        <div key={g.publicId} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{g.name}</span>
            <Badge variant={g.active ? "default" : "outline"}>
              {g.active ? "Active" : "Inactive"}
            </Badge>
            <span className="text-muted-foreground text-xs">
              min {g.minRequired ?? "—"} / max {g.maxAllowed ?? "—"}
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              {g.cloverModifierGroupId ?? "—"}
            </span>
          </div>
          {g.modifiers.length === 0 ? (
            <p className="text-muted-foreground text-sm">No modifiers in this group.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modifier</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Clover id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.modifiers.map((m) => (
                  <TableRow key={m.publicId}>
                    <TableCell>{m.name}</TableCell>
                    <TableCell>{formatMoney(Number(m.price))}</TableCell>
                    <TableCell>
                      <Badge variant={m.available && m.active ? "default" : "outline"}>
                        {m.available && m.active ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {m.cloverModifierId ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ))}
    </div>
  );
}
