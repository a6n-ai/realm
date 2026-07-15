import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryFrequencies, orders } from "@/db/schema";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { myActiveSubscriptions } from "@/lib/services/customer-deliveries.service";
import { buildMealsGrid, type MealOrder } from "@/lib/menu/meals-grid";
import { LottieEmptyState } from "@/components/motion";
import { CutoffBanner } from "@/components/customer/meals/cutoff-banner";
import { MealPicker, MealPickerSkeleton } from "@/components/customer/meals/meal-picker";
import { pickPrimaryActive } from "./pick-primary-active";

export default function MyMealsPage() {
  return (
    <main className="space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Meals</h1>
        <p className="text-muted-foreground text-sm text-pretty">Pick this week's meals before the cutoff.</p>
      </header>
      <Suspense fallback={<MealPickerSkeleton />}>
        <MyMealsData />
      </Suspense>
    </main>
  );
}

async function MyMealsData() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  // Same columns MealOrder needs, keyed directly on orders.userId — no publicId
  // join is needed here since currentUserId() already resolves the bigint id.
  const rows = await db
    .select({
      id: orders.id,
      publicId: orders.publicId,
      planId: orders.planId,
      persons: orders.persons,
      categoryCounts: orders.categoryCounts,
      mealSlots: orders.mealSlots,
      includeSaturday: orders.includeSaturday,
      includeSunday: orders.includeSunday,
      startDate: orders.startDate,
      durationWeeks: orders.durationWeeks,
      frequencyKey: deliveryFrequencies.key,
      status: orders.status,
    })
    .from(orders)
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));

  const activeOrder = pickPrimaryActive(rows) as (MealOrder & { status: string }) | null;

  if (!activeOrder) {
    return (
      <LottieEmptyState
        animation="empty-box"
        title="Subscribe to plan your meals"
        body="Once you have an active subscription, you'll be able to pick your meals for the week here."
        action={
          <Link href="/subscribe" className="bg-primary text-primary-foreground inline-block rounded-md px-4 py-2 text-sm font-medium">
            Browse plans
          </Link>
        }
      />
    );
  }

  const settings = await getAppSettings();
  const result = await buildMealsGrid(activeOrder, settings);

  if (result.empty !== null) {
    const title =
      result.empty === "no-week" ? "This week's menu isn't out yet" : "No deliveries are scheduled for the coming week";
    const body =
      result.empty === "no-week"
        ? "Check back soon — the coming week's menu hasn't been published yet."
        : "There are no deliveries scheduled on your subscription for the coming week.";
    return <LottieEmptyState animation="empty-box" title={title} body={body} />;
  }

  // Multi-order deferral (spec non-goal): a customer with more than one active/paused
  // subscription only picks meals for the primary one here — surface that plainly.
  const otherActiveSubs = await myActiveSubscriptions(userId);
  const hasMultiple = otherActiveSubs.filter((s) => s.publicId !== activeOrder.publicId).length > 0;
  const planName = otherActiveSubs.find((s) => s.publicId === activeOrder.publicId)?.planName;

  return (
    <div className="space-y-4">
      {hasMultiple && planName && (
        <p className="text-muted-foreground text-xs">
          Showing {planName} — more coming soon
        </p>
      )}
      <CutoffBanner days={result.weekDatesView.map((d) => ({ dateIso: d.dateIso, dayOfWeek: d.dayOfWeek, lockMs: d.lockMs }))} />
      <MealPicker
        grid={result.grid}
        categories={result.categories}
        orderPublicId={activeOrder.publicId}
        menuWeekId={result.releasedWeek.publicId}
      />
    </div>
  );
}
