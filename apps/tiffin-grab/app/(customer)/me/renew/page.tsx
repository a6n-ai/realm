import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryFrequencies, orders, plans } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { getTrialSettings } from "@/lib/services/trial-settings.service";
import { popularMealSizeIds } from "@/lib/services/popular-meal-sizes.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { toClientCatalog } from "@/lib/catalog/types";
import { currentUserId } from "@/lib/services/session-service";
import { myRenewalWindow, mySubscriptionsSummary } from "@/lib/services/customer-deliveries.service";
import { checkoutHolidayDates } from "@/lib/services/holidays.service";
import { appToday, earliestPlanStart } from "@/lib/services/start-date";
import { PageShell } from "@/components/ds";
import { RenewCheckout } from "./quick-renew-client";
import { CheckoutUnavailable } from "@/components/checkout/checkout-unavailable";
import { loadCheckoutProps } from "@/lib/checkout/load-checkout-props";
import { getSession } from "@/lib/auth/session";
import { UnpaidRenewalNotice } from "@/components/renew/unpaid-renewal-notice";
import { findUnpaidRenewalForOwner, loadQuickRenewForCustomer } from "@/lib/services/quick-renew.service";
import { renewPageMode } from "@/components/renew/renew-selections";
import { Wizard } from "@/components/wizard/wizard";
import { quoteCodes, selectionsFromPriorOrder, selectionsFromQuote, type QuoteParams } from "@/components/wizard/selections";
import type { CurrentPlanSummary } from "@/components/wizard/current-plan-hint";

const LIVE = new Set(["active", "upcoming", "paused", "waitlisted", "pending"]);

export default async function RenewPlanPage({ searchParams }: { searchParams: Promise<QuoteParams & { full?: string }> }) {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");
  const params = await searchParams;
  const quoteParams = Boolean(params.p);
  const full = params.full === "1";
  const orgId = await resolveRequestOrg();
  const unpaid = quoteParams || full ? null : await findUnpaidRenewalForOwner(userId);
  if (unpaid) return <PageShell><UnpaidRenewalNotice payPublicId={unpaid.payPublicId} /></PageShell>;
  const data = quoteParams || full ? null : await loadQuickRenewForCustomer(userId, orgId);
  if (data && renewPageMode({ quoteParams, full, data }) === "quick") {
    const checkout = await getSession().then((session) => loadCheckoutProps(userId, session!.user.id, orgId));
    if (!checkout) return <CheckoutUnavailable />;
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-5xl">
          <RenewCheckout data={data} checkout={checkout} />
        </div>
      </PageShell>
    );
  }

  const [catalog, trialSettings, [lastOrder], { earliestStart: earliestStartDate, lastTiffin }, subs, popular] = await Promise.all([
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
    // Ranked across every plan; the Bundle step keeps the top two on the chosen one.
    popularMealSizeIds(orgId, 12),
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
        {/* No page header: the wizard's own top bar and step questions say where you are, same as the quick renew screen. */}
        <Wizard
          catalog={client}
          closeHref="/me"
          exitHref="/me"
          origin={full ? "subscribe" : "renew"}
          initial={initial}
          quote={quoted ? { picks: initial, codes: quoteCodes(params) } : null}
          currentPlan={current}
          minStartDate={earliestStartDate}
          lastTiffin={lastTiffin}
          holidayDates={holidayDates}
          popular={popular}
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
