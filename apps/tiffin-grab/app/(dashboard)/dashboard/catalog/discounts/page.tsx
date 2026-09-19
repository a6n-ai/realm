import { Suspense } from "react";
import { TicketPercentIcon } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { db } from "@/db/client";
import { coupons, mealSizes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { DiscountCapForm, DiscountCapSkeleton } from "./discount-cap-form";
import { AllDiscountsSkeleton, AllDiscountsTable } from "./all-discounts-table";
import { buildRows } from "./build-rows";
import { loadDiscountData } from "./load";

const COUPON_LIMIT = 25;

async function CapData() {
  await requireAdmin();
  const s = await getAppSettings();
  return <DiscountCapForm value={s.maxDiscountPct} />;
}

async function AllDiscounts() {
  await requireAdmin();
  const [{ freqs, durs, dtos }, sizes, cRows] = await Promise.all([
    loadDiscountData(),
    db.select({ publicId: mealSizes.publicId, name: mealSizes.name, type: mealSizes.discountType, value: mealSizes.discountValue }).from(mealSizes),
    db.select({ publicId: coupons.publicId, code: coupons.code, kind: coupons.kind, valuePct: coupons.valuePct, valueAmount: coupons.valueAmount, active: coupons.active, startsAt: coupons.startsAt, expiresAt: coupons.expiresAt })
      .from(coupons).where(eq(coupons.active, true)).orderBy(desc(coupons.createdAt)).limit(COUPON_LIMIT + 1),
  ]);
  const rows = buildRows({
    discounts: dtos,
    frequencies: freqs,
    durations: durs,
    mealSizes: sizes,
    coupons: cRows.slice(0, COUPON_LIMIT),
    now: Date.now(),
  });
  return <AllDiscountsTable rows={rows} options={{ frequencies: freqs, durations: durs }} moreCoupons={cRows.length > COUPON_LIMIT} />;
}

// Static route shadows the dynamic [resource] route for "discounts".
export default function DiscountsPage() {
  return (
    <PageShell>
      <PageHeader icon={TicketPercentIcon} title="Discounts" />
      <SectionCard title="Discount cap">
        <Suspense fallback={<DiscountCapSkeleton />}>
          <CapData />
        </Suspense>
      </SectionCard>
      <SectionCard title="All discounts" subtitle="Every discount and where it is managed.">
        <Suspense fallback={<AllDiscountsSkeleton />}>
          <AllDiscounts />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}
