import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { NotFoundError } from "@realm/commons";
import { getCloverConnection } from "@realm/clover";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { Skeleton } from "@realm/ui/skeleton";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { productsService } from "@/lib/services/products.service";
import { ProductDetail } from "./product-detail";

export const dynamic = "force-dynamic";

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
      <SectionCard title="Catalog">
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      </SectionCard>
    </>
  );
}
