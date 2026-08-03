import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { NotFoundError } from "@realm/commons";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { getCloverConnection } from "@realm/clover";
import { Skeleton } from "@realm/ui/skeleton";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import {
  inventoryCatalogService,
  type ProductAssociations,
} from "@/lib/services/inventory.service";
import { productsService } from "@/lib/services/products.service";
import { ProductDetail } from "./product-detail";

export const dynamic = "force-dynamic";

const EMPTY_ASSOCIATIONS: ProductAssociations = {
  categories: [],
  modifierGroups: [],
  taxRates: [],
  printerLabels: [],
};

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductDetailLoader params={params} />
      </Suspense>
    </PageShell>
  );
}

async function ProductDetailLoader({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const [product, clover] = await Promise.all([
    productsService.getDetail(id).catch((e) => {
      if (e instanceof NotFoundError) return null;
      throw e;
    }),
    getCloverConnection(integrationsConfigStore),
  ]);

  if (!product) notFound();

  // Relations only exist once the Clover plugin is installed — skip both queries
  // otherwise rather than render four empty "Assign …" cards.
  const [associations, associationOptions] = clover.installed
    ? await Promise.all([
        inventoryCatalogService.associationsForProductPublicId(id),
        inventoryCatalogService.associationOptions(),
      ])
    : [EMPTY_ASSOCIATIONS, EMPTY_ASSOCIATIONS];

  return (
    <>
      <PageHeader
        icon={PackageIcon}
        title={product.name}
        subtitle={
          clover.installed
            ? "Product detail · Clover inventory fields"
            : "Product detail"
        }
      />
      <ProductDetail
        product={product}
        associations={associations}
        associationOptions={associationOptions}
        cloverEnabled={Boolean(clover.installed)}
        cloverConnected={Boolean(clover.connected && clover.merchantId)}
      />
    </>
  );
}

function ProductDetailSkeleton() {
  return (
    <>
      <PageHeader icon={PackageIcon} title="Product" subtitle="Loading…" />
      <div className="space-y-4">
        <SectionCard title="Details">
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
            <Skeleton className="h-11 w-full" />
          </div>
        </SectionCard>
        <SectionCard title="Online ordering">
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </SectionCard>
        <SectionCard title="Taxes and fees">
          <Skeleton className="h-24 w-full" />
        </SectionCard>
      </div>
    </>
  );
}
