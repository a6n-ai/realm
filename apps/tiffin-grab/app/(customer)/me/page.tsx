import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SectionCard } from "@realm/design-system";
import { zonedDateIso } from "@realm/commons";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { myActiveSubscriptions, nextDeliveryByOrder } from "@/lib/services/customer-deliveries.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { selectablePlans } from "@/components/wizard/plan-filter";
import { SubscriptionSection, SubscriptionSectionSkeleton } from "@/components/customer/home/subscription-section";
import { BrowsePlansSection, BrowsePlansSectionSkeleton } from "@/components/customer/home/browse-plans-section";
import { HOME_SECTIONS } from "./home-sections";
import { SectionSkeleton } from "./section-skeleton";

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
        ) : (
          <Suspense key={section.key} fallback={<SectionSkeleton title={section.title} />}>
            <SectionSlot title={section.title} />
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
// the public /subscribe wizard uses).
async function BrowsePlansSectionData() {
  const catalog = toClientCatalog(await loadCatalogSnapshot());
  return <BrowsePlansSection plans={selectablePlans(catalog)} />;
}

// Placeholder slot — Tasks 10–12 swap this for each section's real async data
// component (coupons · wallet · analytics).
function SectionSlot({ title }: { title: string }) {
  return (
    <SectionCard title={title}>
      <p className="text-muted-foreground text-sm">Coming soon.</p>
    </SectionCard>
  );
}
