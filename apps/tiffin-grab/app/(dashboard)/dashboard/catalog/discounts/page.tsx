/* eslint-disable react-hooks/purity */
import { Suspense } from "react";
import { TicketPercentIcon } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { db } from "@/db/client";
import { coupons } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { DiscountCapForm, DiscountCapSkeleton } from "./discount-cap-form";
import { AllDiscountsSkeleton, AllDiscountsTable } from "./all-discounts-table";
import { WaiversTable } from "./waivers-table";
import { GroupedResourceTabs } from "../grouped-resource-tabs";
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
  const [{ freqs, durs, sizes, strategies, dtos }, cRows] = await Promise.all([
    loadDiscountData(),
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
  return (
    <GroupedResourceTabs
      tabs={[
        {
          value: "discounts",
          label: "Discounts",
          content: <AllDiscountsTable rows={rows} options={{ frequencies: freqs, durations: durs, mealSizes: sizes }} moreCoupons={cRows.length > COUPON_LIMIT} />,
        },
        {
          value: "waivers",
          label: "Waivers",
          content: <WaiversTable waivers={dtos.filter((d) => d.kind.startsWith("waiver_"))} strategies={strategies} now={Date.now()} />,
        },
      ]}
    />
  );
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
      <SectionCard title="All discounts" subtitle="Discounts take money off the food; waivers remove fees or cover the tax.">
        <Suspense fallback={<AllDiscountsSkeleton />}>
          <AllDiscounts />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}
