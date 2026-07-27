import { Suspense } from "react";
import { FolderTreeIcon } from "lucide-react";
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
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { inventoryCatalogService } from "@/lib/services/inventory.service";
import {
  ColorSwatch,
  CloverCatalogSyncActions,
} from "@/components/admin/clover-catalog-sync-actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CloverCategoriesPage() {
  return (
    <PageShell>
      <PageHeader
        icon={FolderTreeIcon}
        title="Categories"
        subtitle="Clover Register categories (inventory SoT). colorCode kept for swatches."
        actions={
          <Suspense fallback={null}>
            <HeaderActions />
          </Suspense>
        }
      />
      <SectionCard title="All categories">
        <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
          <CategoriesTable />
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
      showPushCategories
    />
  );
}

async function CategoriesTable() {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");

  const rows = await inventoryCatalogService.categories.listAll();

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No categories yet. Connect Clover and run Sync from Clover.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Color</TableHead>
          <TableHead>Order</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Clover id</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.publicId}>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>
              <ColorSwatch colorCode={r.colorCode} />
            </TableCell>
            <TableCell>{r.sortOrder}</TableCell>
            <TableCell>
              <Badge variant={r.active ? "default" : "outline"}>
                {r.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">
              {r.cloverCategoryId ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
