import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryFrequencies, orders, plans } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { getTrialSettings } from "@/lib/services/trial-settings.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { toClientCatalog } from "@/lib/catalog/types";
import { currentUserId } from "@/lib/services/session-service";
import { myRenewalWindow, mySubscriptionsSummary } from "@/lib/services/customer-deliveries.service";
import { checkoutHolidayDates } from "@/lib/services/holidays.service";
import { appToday, earliestPlanStart } from "@/lib/services/start-date";
import { PageShell } from "@/components/ds";
import { Wizard } from "@/components/wizard/wizard";
import { quoteCodes, selectionsFromPriorOrder, selectionsFromQuote, type QuoteParams } from "@/components/wizard/selections";
import type { CurrentPlanSummary } from "@/components/wizard/current-plan-hint";

const LIVE = new Set(["active", "upcoming", "paused", "waitlisted", "pending"]);

export default async function RenewPlanPage({ searchParams }: { searchParams: Promise<QuoteParams> }) {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");
  const params = await searchParams;

  const [catalog, trialSettings, [lastOrder], { earliestStart: earliestStartDate, lastTiffin }, subs] = await Promise.all([
    loadCatalogSnapshot(),
    resolveRequestOrg().then(getTrialSettings),
    db
      .select({
        mealSizeId: orders.mealSizeId,
        planKey: plans.key,
        persons: orders.persons,
        eatingDays: orders.eatingDays,
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
    myRenewalWindow(userId),
    mySubscriptionsSummary(userId),
  ]);
  const client = toClientCatalog(catalog);
  const today = appToday(client.timezone, client.cutoffHour);
  const holidayDates = await checkoutHolidayDates(today.toISOString().slice(0, 10));
  const mealSizePublicId = lastOrder
    ? catalog.mealSizes.find((m) => m.id === lastOrder.mealSizeId)?.publicId
    : undefined;
  const prior = selectionsFromPriorOrder(
    client,
    lastOrder
      ? {
          planKey: lastOrder.planKey,
          mealSizePublicId,
          persons: 1,
          eatingDays: lastOrder.eatingDays,
          includeSaturday: lastOrder.includeSaturday,
          includeSunday: lastOrder.includeSunday,
          durationWeeks: lastOrder.durationWeeks,
          frequencyKey: lastOrder.frequencyKey,
        }
      : null,
  );
  // A renewal keeps its length and lands on its start date already picked: the first day
  // the plan starts on after the running plan's last tiffin (or tomorrow when none runs).
  // A staff estimate link wins over the last order: it is what the customer just agreed to.
  const quoted = selectionsFromQuote(client, params);
  const base = quoted ?? prior;
  const basePlan = client.plans.find((p) => p.key === base.planKey);
  const initial = basePlan
    ? { ...base, startDate: earliestPlanStart(today, basePlan.allowedStartDays, earliestStartDate, new Set(holidayDates)) }
    : base;
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
              ? "We'll start this plan after your current one ends. A trial skips the schedule step."
              : "Pick a baseline and a meal. A weekly plan sets its schedule; a trial goes straight to a start date."}
          </p>
        </header>
        <Wizard
          catalog={client}
          closeHref="/me"
          exitHref="/me"
          origin="renew"
          initial={initial}
          quote={quoted ? { picks: initial, codes: quoteCodes(params) } : null}
          currentPlan={current}
          minStartDate={earliestStartDate}
          lastTiffin={lastTiffin}
          holidayDates={holidayDates}
          existingStartDates={live.map((s) => s.startDate).filter(Boolean)}
          trial={
            trialSettings.maxDays != null && trialSettings.maxDays >= 1 && trialSettings.weekdays.length > 0
              ? { maxDays: trialSettings.maxDays, weekdays: trialSettings.weekdays }
              : null
          }
        />
      </div>
    </PageShell>
  );
}
