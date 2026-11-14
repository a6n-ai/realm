import { requireCustomerIdOrRedirect } from "@/lib/account/customer";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { myRenewalWindow, mySubscriptionsSummary } from "@/lib/deliveries/customer-deliveries.service";
import { loadBuilderInputs, withFirstStart } from "@/lib/wizard/builder-inputs";
import { PageShell } from "@/components/ds";
import { RenewCheckout } from "./quick-renew-client";
import { CheckoutUnavailable } from "@/components/checkout/checkout-unavailable";
import { loadCheckoutProps } from "@/lib/checkout/load-props";
import { UnpaidRenewalNotice } from "@/components/renew/unpaid-renewal-notice";
import { findUnpaidRenewalForOwner, loadPriorSelections, loadQuickRenewForCustomer } from "@/lib/renewals/quick-renew.service";
import { renewPageMode } from "@/lib/renewals/renew-selections";
import { Wizard } from "@/components/wizard/wizard";
import { quoteCodes, quoteCoins, selectionsFromQuote, type QuoteParams } from "@/lib/wizard/selections";
import type { CurrentPlanSummary } from "@/components/wizard/current-plan-hint";
import { LIVE, inOrderStatuses } from "@/lib/orders/status";

export default async function RenewPlanPage({ searchParams }: { searchParams: Promise<QuoteParams & { full?: string }> }) {
  const userId = await requireCustomerIdOrRedirect();
  const params = await searchParams;
  const quoteParams = Boolean(params.p);
  const full = params.full === "1";
  const orgId = await resolveRequestOrg();
  const unpaid = quoteParams || full ? null : await findUnpaidRenewalForOwner(userId);
  if (unpaid) return <PageShell><UnpaidRenewalNotice payPublicId={unpaid.payPublicId} /></PageShell>;
  const data = quoteParams || full ? null : await loadQuickRenewForCustomer(userId, orgId);
  if (data && renewPageMode({ quoteParams, full, data }) === "quick") {
    const checkout = await loadCheckoutProps(orgId);
    if (!checkout) return <CheckoutUnavailable />;
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-5xl">
          <RenewCheckout data={data} checkout={checkout} />
        </div>
      </PageShell>
    );
  }

  const [{ client, today, holidayDates, popular, trial }, { earliestStart: earliestStartDate, lastTiffin }, subs, checkout] = await Promise.all([
    loadBuilderInputs(orgId),
    myRenewalWindow(userId),
    mySubscriptionsSummary(userId),
    loadCheckoutProps(orgId),
  ]);
  const prior = await loadPriorSelections(userId, client);
  // A renewal keeps its length and lands on its start date already picked: the first day
  // the plan starts on after the running plan's last tiffin (or tomorrow when none runs).
  // A staff estimate link wins over the last order: it is what the customer just agreed to.
  const quoted = selectionsFromQuote(client, params);
  const base = quoted ?? prior;
  const initial = withFirstStart(client, base, today, earliestStartDate, holidayDates);
  const live = subs.filter((s) => inOrderStatuses(LIVE, s.status));
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
          checkout={checkout ?? undefined}
          quote={quoted ? { picks: initial, codes: quoteCodes(params), coins: quoteCoins(params) } : null}
          // Promo links carry only ?c=CODE (lib/landing/promos.ts subscribeHref); without this the code was lost at sign-in.
          promoCodes={quoted ? [] : quoteCodes(params)}
          currentPlan={current}
          minStartDate={earliestStartDate}
          lastTiffin={lastTiffin}
          holidayDates={holidayDates}
          popular={popular}
          existingStartDates={live.map((s) => s.startDate).filter(Boolean)}
          trial={trial}
        />
      </div>
    </PageShell>
  );
}
