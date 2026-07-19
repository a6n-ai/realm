import { redirect } from "next/navigation";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { Wizard } from "@/components/wizard/wizard";
import { currentUserId } from "@/lib/services/session-service";
import { getSession } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/landing";
import { myPrimarySubscription, mySubscriptionsSummary } from "@/lib/services/customer-deliveries.service";
import { couponsService } from "@/lib/services/coupons.service";
import {
  ExistingSubscriptions,
  SubscribeCouponsPreview,
} from "@/components/customer/subscribe/existing-subscriptions";
import { Button } from "@realm/ui/button";
import Link from "next/link";
import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";

export const dynamic = "force-dynamic";

export default async function SubscribePage() {
  const session = await getSession();
  if (session?.user && isStaffRole(session.user.role)) redirect("/dashboard");

  const userId = await currentUserId();
  const closeHref = userId != null ? "/me" : "/";

  const [catalog, subs, coupons, primary] = await Promise.all([
    loadCatalogSnapshot(),
    userId != null ? mySubscriptionsSummary(userId) : Promise.resolve([]),
    couponsService.listAvailable(),
    userId != null ? myPrimarySubscription(userId) : Promise.resolve(null),
  ]);

  const hasLivePlan = primary != null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 sm:py-10">
      <SubscribeChrome closeHref={closeHref} />

      <header className="space-y-1 pb-2">
        <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-3xl">
          {hasLivePlan ? "Your subscription" : "Build your tiffin subscription"}
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          {hasLivePlan
            ? "You already have a plan. Pick meals and manage deliveries on your calendar — one subscription per account."
            : "Four quick steps to your weekly plan — fresh meals, delivered on your schedule."}
        </p>
      </header>

      {subs.length > 0 && (
        <div className="mt-4">
          <ExistingSubscriptions subs={subs} onePlanMode={hasLivePlan} />
        </div>
      )}

      {hasLivePlan ? (
        <div className="mt-6 space-y-3 rounded-xl border bg-card p-4">
          <p className="text-sm text-pretty">
            Add or change meals for any delivery day on your calendar. Starting a second plan is
            disabled so your schedule stays consistent.
          </p>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/me/deliveries">Open calendar &amp; pick meals</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <SubscribeCouponsPreview coupons={coupons} />
          </div>
          <div className="mt-4">
            <Wizard catalog={toClientCatalog(catalog)} closeHref={closeHref} />
          </div>
        </>
      )}
    </main>
  );
}
