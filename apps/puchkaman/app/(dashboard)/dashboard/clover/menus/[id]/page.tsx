import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { BookOpenIcon } from "lucide-react";
import { NotFoundError } from "@foundry/commons";
import { getCloverConnection } from "@foundry/clover";
import { BackButton, DataTableSkeleton, PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { requirePermission } from "@/lib/auth/guards";
import { integrationsConfigStore, isCloverVisibleInNav } from "@/lib/services/integrations.service";
import { inventoryCatalogService } from "@/lib/services/inventory.service";
import { MenuItemsTable, MENU_ITEM_COLUMNS } from "./menu-items-table";

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
        <MenuItemsTable items={items} />
      </SectionCard>
    </>
  );
}

function MenuDetailSkeleton() {
  return (
    <>
      <PageHeader icon={BookOpenIcon} title="Menu" subtitle="Loading…" />
      <SectionCard title="Items on this menu">
        <DataTableSkeleton columns={MENU_ITEM_COLUMNS} serial={false} />
      </SectionCard>
    </>
  );
}
