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
import type { CurrentPlanSummary } from "@/components/wizard/current-plan-hint";

const LIVE = new Set(["active", "paused", "waitlisted", "pending"]);

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

  const liveSubs = subs.filter((s) => LIVE.has(s.status));
  const currentPlan: CurrentPlanSummary | null = (() => {
    if (!primary) return null;
    const match = liveSubs.find((s) => s.publicId === primary.publicId) ?? liveSubs[0];
    if (!match) return null;
    return {
      planName: match.planName,
      mealSizeName: match.mealSizeName,
      daysPerWeek: match.daysPerWeek,
      status: match.status,
      startDate: match.startDate,
    };
  })();
  const existingStartDates = liveSubs.map((s) => s.startDate).filter(Boolean);

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 sm:py-10">
      <header className="space-y-1 pb-2">
        <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-3xl">
          Build your tiffin subscription
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          {currentPlan
            ? "You already have a plan — you can start another below. We’ll remind you what’s current on each step."
            : "Four quick steps to your weekly plan — fresh meals, delivered on your schedule."}
        </p>
      </header>

      {subs.length > 0 && (
        <div className="mt-4">
          <ExistingSubscriptions subs={subs} />
        </div>
      )}

      <div className="mt-5">
        <SubscribeCouponsPreview coupons={coupons} />
      </div>
      <div className="mt-4">
        <Wizard
          catalog={toClientCatalog(catalog)}
          closeHref={closeHref}
          existingStartDates={existingStartDates}
          currentPlan={currentPlan}
        />
      </div>
    </main>
  );
}
