import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryFrequencies, orders, plans } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { currentUserId } from "@/lib/services/session-service";
import {
  myEarliestNewPlanStartDate,
  mySubscriptionsSummary,
} from "@/lib/services/customer-deliveries.service";
import { PageShell } from "@/components/ds";
import { Wizard } from "@/components/wizard/wizard";
import { selectionsFromPriorOrder } from "@/components/wizard/selections";
import type { CurrentPlanSummary } from "@/components/wizard/current-plan-hint";

const LIVE = new Set(["active", "upcoming", "paused", "waitlisted", "pending"]);

export default async function RenewPlanPage() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const [catalog, [lastOrder], earliestStartDate, subs] = await Promise.all([
    loadCatalogSnapshot(),
    db
      .select({
        mealSizeId: orders.mealSizeId,
        planKey: plans.key,
        persons: orders.persons,
        includeSaturday: orders.includeSaturday,
        includeSunday: orders.includeSunday,
        durationWeeks: orders.durationWeeks,
        frequencyKey: deliveryFrequencies.key,
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planId, plans.id))
      .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(1),
    myEarliestNewPlanStartDate(userId),
    mySubscriptionsSummary(userId),
  ]);
  const client = toClientCatalog(catalog);
  const mealSizePublicId = lastOrder
    ? catalog.mealSizes.find((m) => m.id === lastOrder.mealSizeId)?.publicId
    : undefined;
  const initial = selectionsFromPriorOrder(
    client,
    lastOrder
      ? {
          planKey: lastOrder.planKey,
          mealSizePublicId,
          persons: lastOrder.persons,
          includeSaturday: lastOrder.includeSaturday,
          includeSunday: lastOrder.includeSunday,
          durationWeeks: lastOrder.durationWeeks,
          frequencyKey: lastOrder.frequencyKey,
        }
      : null,
  );
  const live = subs.filter((s) => LIVE.has(s.status));
  const currentRow =
    live.find((s) => s.status === "active") ??
    live.find((s) => s.status === "paused") ??
    live[0];
  const current: CurrentPlanSummary | null = currentRow
    ? {
        planName: currentRow.planName,
        mealSizeName: currentRow.mealSizeName,
        daysPerWeek: currentRow.daysPerWeek,
        status: currentRow.status,
        startDate: currentRow.startDate,
      }
    : null;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-3xl">
        <header className="space-y-1 pb-2">
          <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-3xl">
            {current ? "Renew your plan" : "Build your next plan"}
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">
            {current
              ? "Same four steps as subscribe. We'll start this plan after your current one ends."
              : "Four quick steps to your weekly plan — fresh meals, delivered on your schedule."}
          </p>
        </header>
        <Wizard
          catalog={client}
          closeHref="/me"
          exitHref="/me"
          origin="renew"
          initial={initial}
          currentPlan={current}
          minStartDate={earliestStartDate}
          existingStartDates={live.map((s) => s.startDate).filter(Boolean)}
        />
      </div>
    </PageShell>
  );
}
