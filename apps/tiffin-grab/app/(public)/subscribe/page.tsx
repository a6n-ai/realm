import { redirect } from "next/navigation";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { Wizard } from "@/components/wizard/wizard";
import { currentUserId } from "@/lib/services/session-service";
import { getSession } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/landing";
import { mySubscriptionsSummary } from "@/lib/services/customer-deliveries.service";
import { ExistingSubscriptions } from "@/components/customer/subscribe/existing-subscriptions";

// Reads the live catalog — render per request, don't prerender at build.
export const dynamic = "force-dynamic";

export default async function SubscribePage() {
  // Staff self-subscribing would attach a customer order to their staff account
  // (provisionCustomerByPhone dedupes by phone) — send them to the dashboard,
  // where they create customer orders on a customer's behalf instead.
  const session = await getSession();
  if (session?.user && isStaffRole(session.user.role)) redirect("/dashboard");

  const userId = await currentUserId();
  const [catalog, subs] = await Promise.all([
    loadCatalogSnapshot(),
    userId != null ? mySubscriptionsSummary(userId) : Promise.resolve([]),
  ]);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Build your tiffin subscription</h1>
      <p className="mt-1.5 text-sm text-muted-foreground text-pretty">Four quick steps to your weekly plan — fresh meals, delivered on your schedule.</p>
      {subs.length > 0 && (
        <div className="mt-6">
          <ExistingSubscriptions subs={subs} />
        </div>
      )}
      {subs.length > 0 && <h2 className="mt-8 text-sm font-semibold">Start a new plan</h2>}
      <div className="mt-8">
        <Wizard catalog={toClientCatalog(catalog)} />
      </div>
    </main>
  );
}
