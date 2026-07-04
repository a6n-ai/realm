import { Suspense } from "react";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { UtensilsCrossedIcon } from "lucide-react";
import { db } from "@/db/client";
import { deliveryFrequencies, orders, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@/components/ds";
import { buildMealsGrid } from "@/lib/menu/meals-grid";
import { MealsGrid } from "./meals-grid";

export type { GridCell } from "@/lib/menu/meals-grid";

export default function MealsPage() {
  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title="My Meals" />
      <Suspense fallback={<MealsGrid.Skeleton />}>
        <MealsData />
      </Suspense>
    </PageShell>
  );
}

async function MealsData() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  // One join keyed on users.public_id instead of a publicId→id lookup then a
  // second filtered query (two serial round trips on the customer's main page).
  const [orderRow] = await db
    .select({
      id: orders.id,
      publicId: orders.publicId,
      userId: orders.userId,
      planId: orders.planId,
      persons: orders.persons,
      mealSlots: orders.mealSlots,
      includeSaturday: orders.includeSaturday,
      includeSunday: orders.includeSunday,
      startDate: orders.startDate,
      durationWeeks: orders.durationWeeks,
      status: orders.status,
      frequencyKey: deliveryFrequencies.key,
      pausedFrom: orders.pausedFrom,
      pausedUntil: orders.pausedUntil,
    })
    .from(orders)
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(users.publicId, session.user.id))
    .orderBy(desc(orders.createdAt))
    .limit(1);

  const activeOrder = orderRow?.status === "active" ? orderRow : null;

  if (!activeOrder) {
    return (
      <EmptyState
        icon={UtensilsCrossedIcon}
        message="You don't have an active order yet."
        action={<a href="/subscribe" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Subscribe now</a>}
      />
    );
  }

  const settings = await getAppSettings();
  const result = await buildMealsGrid(activeOrder, settings);

  if (result.empty !== null) {
    const message =
      result.empty === "no-week"
        ? "The menu for the coming week hasn't been published yet. Check back soon."
        : "No deliveries are scheduled for the coming week on your order.";
    return <EmptyState icon={UtensilsCrossedIcon} message={message} />;
  }

  const { releasedWeek, weekDatesView, grid, enabledSlots, persons } = result;

  return (
    <SectionCard title={`Coming week — meals for ${releasedWeek.weekStart}`}>
      <MealsGrid
        orderId={activeOrder.publicId}
        menuWeekId={releasedWeek.publicId}
        grid={grid}
        persons={persons}
        weekDates={weekDatesView}
        enabledSlots={enabledSlots}
        timezone={settings.timezone}
      />
    </SectionCard>
  );
}
