import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { currentUserId } from "@/lib/services/session-service";
import { myEarliestNewPlanStartDate } from "@/lib/services/customer-deliveries.service";
import { RenewSelector } from "@/components/customer/renew/renew-selector";

export const dynamic = "force-dynamic";

export default function RenewPlanPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Renew your plan</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Pick a meal size, choose your schedule, and pick a start date.
        </p>
      </header>
      <RenewData />
    </main>
  );
}

async function RenewData() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  // Every currently-active meal size in the admin catalog is offered here — not just
  // ones this customer has ordered before. loadCatalogSnapshot() already excludes
  // retired meal sizes, so no further filtering is needed.
  const [catalog, [lastOrder], earliestStartDate] = await Promise.all([
    loadCatalogSnapshot(),
    db
      .select({ mealSizeId: orders.mealSizeId })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(1),
    myEarliestNewPlanStartDate(userId),
  ]);
  const client = toClientCatalog(catalog);
  // Pre-select whatever meal size they most recently ordered — renewing is almost always
  // "get me the same thing again," not a fresh browse. Falls back to no selection when the
  // customer has no order history, or that meal size has since been retired from the catalog.
  const defaultMealSizeId = lastOrder
    ? catalog.mealSizes.find((m) => m.id === lastOrder.mealSizeId)?.publicId
    : undefined;

  return (
    <RenewSelector
      mealSizes={client.mealSizes}
      catalog={client}
      defaultMealSizeId={defaultMealSizeId}
      earliestStartDate={earliestStartDate}
    />
  );
}
