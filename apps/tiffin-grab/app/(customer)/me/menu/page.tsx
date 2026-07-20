import { Suspense } from "react";
import { redirect } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import { currentUserId } from "@/lib/services/session-service";
import { myActiveSubscriptions } from "@/lib/services/customer-deliveries.service";
import { menuService } from "@/lib/services/menu.service";
import { dishesService } from "@/lib/services/dishes.service";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { zonedDateIso } from "@realm/commons";
import { PageShell, PageHeader } from "@/components/ds";
import { ThisWeekMenuSection, ThisWeekMenuSectionSkeleton } from "@/components/customer/home/this-week-menu-section";
import { DishesSection, DishesSectionSkeleton } from "@/components/customer/home/dishes-section";
import { PlansCtaSection, PlansCtaSectionSkeleton } from "@/components/customer/home/plans-cta-section";
import { MENU_SECTIONS } from "./menu-sections";

export default async function MenuPage() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  return (
    <PageShell>
      <PageHeader
        icon={UtensilsCrossedIcon}
        title="Menu"
        subtitle="See this week's dishes — tap a photo for details."
      />

      {MENU_SECTIONS.map((section) =>
        section.key === "menu" ? (
          <Suspense key={section.key} fallback={<ThisWeekMenuSectionSkeleton />}>
            <MenuSectionData userId={userId} />
          </Suspense>
        ) : section.key === "dishes" ? (
          <Suspense key={section.key} fallback={<DishesSectionSkeleton />}>
            <DishesSectionData userId={userId} />
          </Suspense>
        ) : (
          <Suspense key={section.key} fallback={<PlansCtaSectionSkeleton />}>
            <PlansCtaSection />
          </Suspense>
        ),
      )}
    </PageShell>
  );
}

async function MenuSectionData({ userId }: { userId: bigint }) {
  const subs = await myActiveSubscriptions(userId);
  const planType = (subs[0]?.planType as "tiffin" | "healthy" | undefined) ?? "tiffin";
  const { timezone } = await getAppSettings();
  const thisMonday = mondayOfIso(zonedDateIso(Date.now(), timezone));
  // Exact this Monday only — same getReleasedWeek gate Deliveries uses (no cross-week fallback).
  const week = await menuService.getPublishedWeek(planType, thisMonday);
  return <ThisWeekMenuSection week={week} />;
}

async function DishesSectionData({ userId }: { userId: bigint }) {
  const [dishes, subs] = await Promise.all([
    dishesService.listActive(),
    myActiveSubscriptions(userId),
  ]);
  const planType = (subs[0]?.planType as "tiffin" | "healthy" | undefined) ?? "tiffin";
  const { timezone } = await getAppSettings();
  const thisMonday = mondayOfIso(zonedDateIso(Date.now(), timezone));
  const week = await menuService.getPublishedWeek(planType, thisMonday);

  const daysByDish: Record<string, string[]> = {};
  if (week) {
    const DAY_LABEL: Record<string, string> = {
      mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
    };
    for (const item of week.items) {
      if (!item.dishPublicId) continue;
      const label = DAY_LABEL[item.dayOfWeek] ?? item.dayOfWeek;
      const list = daysByDish[item.dishPublicId] ?? [];
      if (!list.includes(label)) list.push(label);
      daysByDish[item.dishPublicId] = list;
    }
  }

  return <DishesSection dishes={dishes} daysByDish={daysByDish} dense />;
}
