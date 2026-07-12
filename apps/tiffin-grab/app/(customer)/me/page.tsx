import { Suspense } from "react";
import { redirect } from "next/navigation";
import { zonedDateIso } from "@realm/commons";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { myActiveSubscriptions, myDeliveries, nextDeliveryByOrder } from "@/lib/services/customer-deliveries.service";
import { couponsService } from "@/lib/services/coupons.service";
import { ledgerService } from "@/lib/services/ledger.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { selectablePlans } from "@/components/wizard/plan-filter";
import { walletService } from "@/lib/services/wallet.service";
import { SubscriptionSection, SubscriptionSectionSkeleton } from "@/components/customer/home/subscription-section";
import { BrowsePlansSection, BrowsePlansSectionSkeleton } from "@/components/customer/home/browse-plans-section";
import { CouponsSection, CouponsSectionSkeleton } from "@/components/customer/home/coupons-section";
import { WalletSection, WalletSectionSkeleton } from "@/components/customer/home/wallet-section";
import { AnalyticsTiles, AnalyticsTilesSkeleton } from "@/components/customer/home/analytics-tiles";
import { monthWindow } from "@/components/customer/home/analytics-month-window";
import { HOME_SECTIONS } from "./home-sections";

// The consumer-app home: a single scroll of session-scoped sections. Each is its
// own Suspense island so a slow read never blocks the rest of the page. Tasks
// 8–12 replace the placeholder <SectionSlot> with each section's real async data
// component (userId + timezone are already threaded for them).
export default async function MePage() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login"); // defense in depth — the (customer) layout already gates

  const { timezone } = await getAppSettings();

  return (
    <main className="space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Home</h1>
        <p className="text-muted-foreground text-sm text-pretty">Everything for your meals, all in one place.</p>
      </header>

      {HOME_SECTIONS.map((section) =>
        section.key === "subscription" ? (
          <Suspense key={section.key} fallback={<SubscriptionSectionSkeleton />}>
            <SubscriptionSectionData userId={userId} timezone={timezone} />
          </Suspense>
        ) : section.key === "browse" ? (
          <Suspense key={section.key} fallback={<BrowsePlansSectionSkeleton />}>
            <BrowsePlansSectionData />
          </Suspense>
        ) : section.key === "coupons" ? (
          <Suspense key={section.key} fallback={<CouponsSectionSkeleton />}>
            <CouponsSectionData />
          </Suspense>
        ) : section.key === "wallet" ? (
          <Suspense key={section.key} fallback={<WalletSectionSkeleton />}>
            <WalletSectionData userId={userId} />
          </Suspense>
        ) : (
          <Suspense key={section.key} fallback={<AnalyticsTilesSkeleton />}>
            <AnalyticsTilesData userId={userId} timezone={timezone} />
          </Suspense>
        ),
      )}
    </main>
  );
}

async function SubscriptionSectionData({ userId, timezone }: { userId: bigint; timezone: string }) {
  const today = zonedDateIso(Date.now(), timezone); // reads only — no reconcile/materialize here
  const [subs, nextByOrder] = await Promise.all([
    myActiveSubscriptions(userId),
    nextDeliveryByOrder(userId, today),
  ]);
  const subscriptions = subs.map((s) => ({ ...s, nextDelivery: nextByOrder.get(s.publicId) ?? null }));
  return <SubscriptionSection subscriptions={subscriptions} />;
}

// Global catalog data — safely public, no userId scoping needed (same filter
// the public /subscribe wizard uses). priceFrom is the min meal-size basePrice
// per plan, computed server-side (never trust a client amount).
async function BrowsePlansSectionData() {
  const catalog = toClientCatalog(await loadCatalogSnapshot());
  const plans = selectablePlans(catalog).map((p) => {
    const prices = catalog.mealSizes.filter((m) => m.planKey === p.key && !m.trial).map((m) => m.basePrice);
    return { ...p, priceFrom: prices.length ? Math.min(...prices) : null };
  });
  return <BrowsePlansSection plans={plans} />;
}

// Catalog-wide coupon list — active, non-rep coupons in window. Not user-owned data,
// so no userId gate (mirrors browse plans above).
async function CouponsSectionData() {
  const coupons = await couponsService.listAvailable();
  return <CouponsSection coupons={coupons} />;
}

// Session-scoped wallet read — userId resolved server-side from currentUserId(), never client input.
async function WalletSectionData({ userId }: { userId: bigint }) {
  const [balance, transactions] = await Promise.all([
    walletService.balance(userId),
    walletService.recentTransactions(userId, 10),
  ]);
  return <WalletSection balance={balance} transactions={transactions} />;
}

// Session-scoped: the month window is computed from the APP timezone (never the
// server's UTC clock — spec 6), and every read below is scoped to `userId`.
async function AnalyticsTilesData({ userId, timezone }: { userId: bigint; timezone: string }) {
  const { from, until } = monthWindow(Date.now(), timezone);
  const [deliveriesThisMonth, totalSpend, totalSavings] = await Promise.all([
    myDeliveries(userId, from, until),
    ledgerService.totalSpent(userId),
    ledgerService.totalSavings(userId),
  ]);
  return (
    <AnalyticsTiles
      deliveriesThisMonth={deliveriesThisMonth.length}
      totalSpend={totalSpend}
      totalSavings={totalSavings}
    />
  );
}
