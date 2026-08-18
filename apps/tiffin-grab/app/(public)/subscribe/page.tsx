import { redirect } from "next/navigation";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { Wizard } from "@/components/wizard/wizard";
import { currentUserId } from "@/lib/services/session-service";
import { getSession } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/landing";
import { couponsService } from "@/lib/services/coupons.service";
import { SubscribeCouponsPreview } from "@/components/customer/subscribe/existing-subscriptions";

export const dynamic = "force-dynamic";

export default async function SubscribePage() {
  const session = await getSession();
  if (session?.user && isStaffRole(session.user.role)) redirect("/dashboard");

  // Logged-in customers already have an account — send them through the same
  // four-step wizard on /me/renew (prefilled from their current plan). Checkout
  // still auto-provisions an account by phone for anonymous first-time signup.
  const userId = await currentUserId();
  if (userId != null) redirect("/me/renew");

  const [catalog, coupons] = await Promise.all([loadCatalogSnapshot(), couponsService.listAvailable()]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 sm:py-10">
      <header className="space-y-1 pb-2">
        <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-3xl">
          Build your tiffin subscription
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Four quick steps to your weekly plan — fresh meals, delivered on your schedule.
        </p>
      </header>

      <div className="mt-5">
        <SubscribeCouponsPreview coupons={coupons} />
      </div>
      <div className="mt-4">
        <Wizard catalog={toClientCatalog(catalog)} closeHref="/" />
      </div>
    </main>
  );
}
