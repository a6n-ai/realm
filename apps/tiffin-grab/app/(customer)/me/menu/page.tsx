import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/services/session-service";
import { myActiveSubscriptions } from "@/lib/services/customer-deliveries.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { selectablePlans } from "@/components/wizard/plan-filter";
import { menuService } from "@/lib/services/menu.service";
import { dishesService } from "@/lib/services/dishes.service";
import { ThisWeekMenuSection, ThisWeekMenuSectionSkeleton } from "@/components/customer/home/this-week-menu-section";
import { MealSizesSection, MealSizesSectionSkeleton } from "@/components/customer/home/meal-sizes-section";
import { DishesSection, DishesSectionSkeleton } from "@/components/customer/home/dishes-section";
import { BrowsePlansSection, BrowsePlansSectionSkeleton } from "@/components/customer/home/browse-plans-section";
import { MENU_SECTIONS } from "./menu-sections";

export default async function MenuPage() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login"); // defense in depth — the (customer) layout already gates

  return (
    <main className="space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Menu</h1>
        <p className="text-muted-foreground text-sm text-pretty">Browse this week's menu, sizes, dishes, and plans.</p>
      </header>

      {MENU_SECTIONS.map((section) =>
        section.key === "menu" ? (
          <Suspense key={section.key} fallback={<ThisWeekMenuSectionSkeleton />}>
            <MenuSectionData userId={userId} />
          </Suspense>
        ) : section.key === "mealSizes" ? (
          <Suspense key={section.key} fallback={<MealSizesSectionSkeleton />}>
            <MealSizesSectionData />
          </Suspense>
        ) : section.key === "dishes" ? (
          <Suspense key={section.key} fallback={<DishesSectionSkeleton />}>
            <DishesSectionData />
          </Suspense>
        ) : (
          <Suspense key={section.key} fallback={<BrowsePlansSectionSkeleton />}>
            <BrowsePlansSectionData />
          </Suspense>
        ),
      )}
    </main>
  );
}

// Session-scoped: plan type comes from the customer's active subscription (defaults
// to "tiffin" if none), the published week itself is public catalog data (cached).
async function MenuSectionData({ userId }: { userId: bigint }) {
  const subs = await myActiveSubscriptions(userId);
  const planType = (subs[0]?.planType as "tiffin" | "healthy" | undefined) ?? "tiffin";
  const week = await menuService.getPublishedWeek(planType);
  return <ThisWeekMenuSection week={week} />;
}

// Global catalog + dish-pool reads — public, no userId scoping needed.
async function MealSizesSectionData() {
  const [catalog, dishPool] = await Promise.all([
    toClientCatalog(await loadCatalogSnapshot()),
    dishesService.listActiveWithImages(),
  ]);
  const planNames = Object.fromEntries(catalog.plans.map((p) => [p.key, p.name]));
  return <MealSizesSection mealSizes={catalog.mealSizes} dishPool={dishPool} planNames={planNames} />;
}

// Global dish gallery — public, no userId scoping needed.
async function DishesSectionData() {
  const dishes = await dishesService.listActiveWithImages();
  return <DishesSection dishes={dishes} />;
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
