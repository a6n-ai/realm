import { Suspense } from "react";
import { redirect } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import { parseIsoDateUtc, weekdayKey, zonedDateIso } from "@foundry/commons";
import { currentUserId } from "@/lib/services/session-service";
import { myActiveSubscriptions } from "@/lib/services/customer-deliveries.service";
import { menuService } from "@/lib/services/menu.service";
import { thisWeekStartIso } from "@/lib/menu/delivery-dates";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { PageShell, PageHeader } from "@/components/ds";
import { ThisWeekMenuSection, ThisWeekMenuSectionSkeleton } from "@/components/customer/home/this-week-menu-section";
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
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();
  const thisMonday = thisWeekStartIso(now, timezone);
  // Exact this Monday only — same getReleasedWeek gate Deliveries uses (no cross-week fallback).
  const week = await menuService.getPublishedWeek(thisMonday);
  // Computed once, server-side, in the app's own timezone — passed down as a plain prop
  // so the client component never has to read the clock itself (which would risk a
  // server/client hydration mismatch on the highlighted "today" column).
  const todayKey = weekdayKey(parseIsoDateUtc(zonedDateIso(now, timezone)));
  return <ThisWeekMenuSection week={week} todayKey={todayKey} />;
}
