import { Suspense } from "react";
import Link from "next/link";
import { TicketPercentIcon } from "lucide-react";
import { count, eq, ne } from "drizzle-orm";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { Skeleton } from "@foundry/ui/skeleton";
import { db } from "@/db/client";
import { coupons, mealSizes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { CatalogData, type SearchParams } from "../[resource]/page";
import { ResourceEditorSkeleton } from "../[resource]/resource-editor";
import { DiscountCapForm, DiscountCapSkeleton } from "./discount-cap-form";

async function CapData() {
  await requireAdmin();
  const s = await getAppSettings();
  return <DiscountCapForm value={s.maxDiscountPct} />;
}

async function OtherDiscounts() {
  await requireAdmin();
  const [sizes, [{ n: activeCoupons }]] = await Promise.all([
    db.select({ publicId: mealSizes.publicId, name: mealSizes.name, type: mealSizes.discountType, value: mealSizes.discountValue })
      .from(mealSizes).where(ne(mealSizes.discountType, "none")),
    db.select({ n: count() }).from(coupons).where(eq(coupons.active, true)),
  ]);
  return (
    <div className="grid gap-4 text-sm">
      <div>
        <p className="font-medium">Meal-size list-price discounts</p>
        {sizes.length === 0 ? (
          <p className="text-muted-foreground">None set.</p>
        ) : (
          <ul className="mt-1 divide-y">
            {sizes.map((m) => (
              <li key={m.publicId} className="flex items-center justify-between gap-3 py-1.5">
                <Link href="/dashboard/catalog/meal-sizes" className="hover:underline">{m.name}</Link>
                <span className="text-muted-foreground tabular-nums">
                  {m.type === "percent" ? `${Number(m.value)}% off` : `$${Number(m.value)} off`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p><span className="font-medium">Coupons</span> <span className="text-muted-foreground">{activeCoupons} active</span></p>
        <Link href="/dashboard/discounts/coupons" className="text-primary hover:underline">Manage coupons</Link>
      </div>
    </div>
  );
}

function OtherDiscountsSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
      <Skeleton className="h-5 w-full" />
    </div>
  );
}

// Static route shadows the dynamic [resource] route for "discounts".
export default function DiscountsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader icon={TicketPercentIcon} title="Discounts" />
      <SectionCard title="Discount cap">
        <Suspense fallback={<DiscountCapSkeleton />}>
          <CapData />
        </Suspense>
      </SectionCard>
      <SectionCard title="Catalog discounts">
        <Suspense fallback={<ResourceEditorSkeleton resource="discounts" />}>
          <CatalogData resource="discounts" searchParams={searchParams} />
        </Suspense>
      </SectionCard>
      <SectionCard title="Other discounts" subtitle="Managed elsewhere; read-only here.">
        <Suspense fallback={<OtherDiscountsSkeleton />}>
          <OtherDiscounts />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}
