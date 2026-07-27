import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { BookOpenIcon } from "lucide-react";
import { NotFoundError } from "@realm/commons";
import { getCloverConnection } from "@realm/clover";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { Skeleton } from "@realm/ui/skeleton";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { inventoryCatalogService } from "@/lib/services/inventory.service";
import { MenuDetail } from "./menu-detail";

export const dynamic = "force-dynamic";

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
  await requireAdmin();
  const { id } = await params;

  const clover = await getCloverConnection(integrationsConfigStore);
  if (!clover.installed) redirect("/dashboard/settings/integrations");

  const [menu, categories] = await Promise.all([
    inventoryCatalogService.menus.getDetail(id).catch((e) => {
      if (e instanceof NotFoundError) return null;
      throw e;
    }),
    inventoryCatalogService.listCategoryOptions(),
  ]);

  if (!menu) notFound();

  return (
    <>
      <PageHeader
        icon={BookOpenIcon}
        title={menu.name}
        subtitle="Edit menu sections (categories) and save. Order mirrors Clover Register category sort."
      />
      <MenuDetail
        menu={menu}
        categories={categories}
        cloverConnected={Boolean(clover.connected && clover.merchantId)}
      />
    </>
  );
}

function MenuDetailSkeleton() {
  return (
    <>
      <PageHeader icon={BookOpenIcon} title="Menu" subtitle="Loading…" />
      <SectionCard title="Menu">
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      </SectionCard>
    </>
  );
}
