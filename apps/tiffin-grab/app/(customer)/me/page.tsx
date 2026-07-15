import { Suspense } from "react";
import { redirect } from "next/navigation";
import { zonedDateIso } from "@realm/commons";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { myActiveSubscriptions, myWaitlistedSubscriptions, nextDeliveryByOrder } from "@/lib/services/customer-deliveries.service";
import { walletService } from "@/lib/services/wallet.service";
import { SubscriptionSection, SubscriptionSectionSkeleton } from "@/components/customer/home/subscription-section";
import { WalletSection, WalletSectionSkeleton } from "@/components/customer/home/wallet-section";
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
        ) : (
          <Suspense key={section.key} fallback={<WalletSectionSkeleton />}>
            <WalletSectionData userId={userId} />
          </Suspense>
        ),
      )}
    </main>
  );
}

async function SubscriptionSectionData({ userId, timezone }: { userId: bigint; timezone: string }) {
  const today = zonedDateIso(Date.now(), timezone); // reads only — no reconcile/materialize here
  const [subs, nextByOrder, waitlisted] = await Promise.all([
    myActiveSubscriptions(userId),
    nextDeliveryByOrder(userId, today),
    myWaitlistedSubscriptions(userId),
  ]);
  const subscriptions = subs.map((s) => ({ ...s, nextDelivery: nextByOrder.get(s.publicId) ?? null }));
  return <SubscriptionSection subscriptions={subscriptions} waitlisted={waitlisted} />;
}

// Session-scoped wallet read — userId resolved server-side from currentUserId(), never client input.
async function WalletSectionData({ userId }: { userId: bigint }) {
  const [balance, transactions] = await Promise.all([
    walletService.balance(userId),
    walletService.recentTransactions(userId, 10),
  ]);
  return <WalletSection balance={balance} transactions={transactions} />;
}
