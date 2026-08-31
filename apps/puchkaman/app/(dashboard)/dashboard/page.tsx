import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon, LayoutDashboardIcon } from "lucide-react";
import {
  PageHeader,
  PageShell,
  SectionCard,
  SkeletonStatCards,
  StatGrid,
} from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { getSession } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/guards";
import { productsService, type ProductListRow } from "@/lib/services/products.service";
import { CATEGORIES, type CategoryId } from "@/lib/menu-categories";

export default function DashboardHomePage() {
  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboardIcon}
        title="Dashboard"
        subtitle="Your catalog at a glance."
        actions={
          <Button asChild size="sm">
            <Link href="/dashboard/products">
              Manage products <ArrowRightIcon className="size-4" />
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData />
      </Suspense>
    </PageShell>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <SkeletonStatCards count={4} />
      <div className="grid gap-4 md:grid-cols-2">
        <ProductListSkeleton />
        <ProductListSkeleton />
      </div>
    </>
  );
}

function ProductListSkeleton() {
  return (
    <div className="bg-card space-y-3 rounded-xl border p-5 shadow-sm">
      <Skeleton className="h-5 w-36" />
      <div className="grid gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-12 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

async function DashboardData() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  // Every stat and list on this page is product data (counts, recents,
  // featured) — there's no order/finance card here yet, so one permission
  // covers the whole page. Fetch nothing at all if the viewer lacks it,
  // rather than fetching and hiding it in the markup.
  const canProducts = roleCan(session.user.role, { product: ["read"] });
  if (!canProducts) return null;

  const [stats, recent, featured] = await Promise.all([
    productsService.productStats(),
    productsService.recentProducts(6),
    productsService.featuredProducts(6),
  ]);

  return (
    <>
      <StatGrid
        cols={4}
        items={[
          { label: "Total products", value: stats.total },
          { label: "Featured", value: stats.featured },
          { label: "Categories", value: stats.categories },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <ProductList title="Recent products" empty="No products yet." rows={recent} />
        <ProductList title="Featured products" empty="No featured products yet." rows={featured} />
      </div>
    </>
  );
}

function ProductList({ title, empty, rows }: { title: string; empty: string; rows: ProductListRow[] }) {
  return (
    <SectionCard title={title}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((p) => (
            <div
              key={p.publicId}
              className="flex items-center justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {CATEGORIES[p.category as CategoryId]?.name ?? p.category}
                </p>
              </div>
              <p className="shrink-0 text-sm font-medium tabular-nums">
                ${Number(p.price).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
