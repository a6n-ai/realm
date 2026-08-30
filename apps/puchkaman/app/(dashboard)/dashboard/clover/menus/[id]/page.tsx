import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookOpenIcon } from "lucide-react";
import { NotFoundError } from "@realm/commons";
import { getCloverConnection } from "@realm/clover";
import { BackButton, PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { Skeleton } from "@realm/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@realm/ui/table";
import { requirePermission } from "@/lib/auth/guards";
import { integrationsConfigStore, isCloverVisibleInNav } from "@/lib/services/integrations.service";
import { inventoryCatalogService } from "@/lib/services/inventory.service";

export default function MenuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <Suspense fallback={<MenuDetailSkeleton />}>
        <MenuDetailLoader params={params} />
      </Suspense>
    </PageShell>
  );
}

async function MenuDetailLoader({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ product: ["read"] });
  const clover = await getCloverConnection(integrationsConfigStore);
  if (!(await isCloverVisibleInNav())) redirect("/dashboard/settings/integrations");

  const { id } = await params;
  const data = await inventoryCatalogService.menus.menuWithItems(id).catch((e) => {
    if (e instanceof NotFoundError) return null;
    throw e;
  });
  if (!data) notFound();

  const { menu, items } = data;
  const markups = items.filter((i) => i.basePrice != null && i.price !== i.basePrice).length;

  return (
    <>
      <PageHeader
        icon={BookOpenIcon}
        title={menu.name}
        subtitle="Clover online-ordering menu. Items and prices are managed in Clover."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BackButton href="/dashboard/clover/menus" label="Menus" />
        <Badge variant={menu.cloverPublishedAt ? "secondary" : "outline"}>
          {menu.cloverPublishedAt ? "Published" : "Draft"}
        </Badge>
        {menu.cloverMenuType ? <Badge variant="outline">{menu.cloverMenuType}</Badge> : null}
        {menu.cloverFallbackMenu ? <Badge variant="outline">Fallback</Badge> : null}
        {menu.cloverProviderIds?.length ? (
          <span className="text-muted-foreground font-mono text-xs">
            {menu.cloverProviderIds.join(", ")}
          </span>
        ) : null}
      </div>

      <SectionCard
        title="Items on this menu"
        subtitle={
          markups
            ? `${items.length} item${items.length === 1 ? "" : "s"} · ${markups} priced above the register`
            : `${items.length} item${items.length === 1 ? "" : "s"}`
        }
      >
        {items.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">
            No items on this menu yet. Run Sync from Clover.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Register price</TableHead>
                <TableHead className="text-right">Menu price</TableHead>
                <TableHead className="text-right">Markup</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const markup =
                  item.basePrice == null ? null : Number((item.price - item.basePrice).toFixed(2));
                return (
                  <TableRow key={item.publicId}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/products/${item.productPublicId}`}
                        className="hover:underline"
                      >
                        {item.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {item.basePrice == null ? "—" : `$${item.basePrice.toFixed(2)}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${item.price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {markup == null || markup === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        `${markup > 0 ? "+" : ""}$${markup.toFixed(2)}`
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.enabled ? "default" : "outline"}>
                        {item.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </>
  );
}

function MenuDetailSkeleton() {
  return (
    <>
      <PageHeader icon={BookOpenIcon} title="Menu" subtitle="Loading…" />
      <SectionCard title="Items on this menu">
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
        </div>
      </SectionCard>
    </>
  );
}
