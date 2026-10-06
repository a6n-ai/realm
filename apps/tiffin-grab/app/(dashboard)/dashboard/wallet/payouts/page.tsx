import { Suspense } from "react";
import { and, asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { durationPackages, eventPayout, mealPayout, mealSizes } from "@/db/schema";
import { EventPayoutGrid, EventPayoutGridSkeleton } from "@foundry/crm";
import { savePayoutRow } from "../actions";
import { MealPayoutGrid, type MealPayoutRow } from "../meal-payout-grid";
import { CustomerPayoutPanel } from "../customer-payout-panel";
import { listOrderCities } from "@/lib/services/customer-payouts.service";

/**
 * The only business events that pay coins (every other app_event is a
 * notification and never awards). Coins are paid only when money was paid.
 */
const PAYOUT_EVENTS = {
  order_activated: {
    label: "Order paid",
    description: "Each order, once its payment is received. Orders covered entirely by coins or a coupon earn nothing.",
  },
} as const;

export default function PayoutsPage() {
  return (
    <Suspense fallback={<EventPayoutGridSkeleton />}>
      <PayoutsData />
    </Suspense>
  );
}

async function PayoutsData() {
  await requireAdmin();

  const [payouts, mealPayoutRows, mealSizeOptions, durationOptions, cities] = await Promise.all([
    db
      .select({
        eventType: eventPayout.eventType,
        enabled: eventPayout.enabled,
        coins: eventPayout.coins,
      })
      .from(eventPayout)
      .orderBy(eventPayout.eventType),
    db
      .select({
        id: mealPayout.publicId,
        mealSizePublicId: mealSizes.publicId,
        mealSizeName: mealSizes.name,
        durationPackagePublicId: durationPackages.publicId,
        durationWeeks: durationPackages.weeks,
        coins: mealPayout.coins,
      })
      .from(mealPayout)
      .leftJoin(mealSizes, eq(mealPayout.mealSizeId, mealSizes.id))
      .leftJoin(durationPackages, eq(mealPayout.durationPackageId, durationPackages.id))
      // MealPayoutGrid partitions default-vs-override itself, so ordering here just
      // needs overrides to read alphabetically; Postgres sorts the default row's NULL
      // name last by default, which MealPayoutGrid ignores anyway.
      .orderBy(asc(mealSizes.name)),
    db
      .select({ publicId: mealSizes.publicId, name: mealSizes.name })
      .from(mealSizes)
      .where(and(eq(mealSizes.active, true), eq(mealSizes.custom, false)))
      .orderBy(asc(mealSizes.name)),
    db
      .select({ publicId: durationPackages.publicId, weeks: durationPackages.weeks })
      .from(durationPackages)
      .where(eq(durationPackages.active, true))
      .orderBy(asc(durationPackages.weeks)),
    listOrderCities(),
  ]);

  return (
    <div className="grid gap-6">
      <EventPayoutGrid
        rows={payouts
          .filter((p) => p.eventType in PAYOUT_EVENTS)
          .map((p) => ({ event: p.eventType, ...PAYOUT_EVENTS[p.eventType as keyof typeof PAYOUT_EVENTS], enabled: p.enabled, coins: p.coins }))}
        onSave={savePayoutRow}
        emptyMessage="No payout rows — run db:seed:wallet to seed them."
      />
      <MealPayoutGrid
        rows={mealPayoutRows as MealPayoutRow[]}
        mealSizes={mealSizeOptions}
        durationPackages={durationOptions}
      />
      <CustomerPayoutPanel cities={cities} />
    </div>
  );
}
