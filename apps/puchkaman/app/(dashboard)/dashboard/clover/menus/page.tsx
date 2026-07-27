import { Suspense } from "react";
import { BookOpenIcon } from "lucide-react";
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
import { CloverCatalogSyncActions } from "@/components/admin/clover-catalog-sync-actions";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { inventoryCatalogService } from "@/lib/services/inventory.service";

export const dynamic = "force-dynamic";

export default function CloverMenusPage() {
  return (
    <PageShell>
      <PageHeader
        icon={BookOpenIcon}
        title="Menus"
        subtitle="Register menu layout from Clover categories (Clover has no separate Menus inventory API)."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="Menus">
        <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
          <MenusTable />
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

async function MenusTable() {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");

  const rows = await inventoryCatalogService.menus.listWithSections();

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No menus yet. Sync from Clover builds a Register menu from categories.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {rows.map((m) => (
        <div key={m.publicId} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{m.name}</span>
            <Badge variant={m.active ? "default" : "outline"}>
              {m.active ? "Active" : "Inactive"}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {m.sections.length} section{m.sections.length === 1 ? "" : "s"}
            </span>
          </div>
          {m.sections.length === 0 ? (
            <p className="text-muted-foreground text-sm">No sections linked.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section (category)</TableHead>
                  <TableHead>Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.sections.map((s) => (
                  <TableRow key={s.publicId}>
                    <TableCell>{s.categoryName ?? "—"}</TableCell>
                    <TableCell>{s.sortOrder}</TableCell>
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
