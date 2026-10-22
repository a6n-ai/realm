import { Suspense } from "react";
import { redirect } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import { currentUserId } from "@/lib/services/session-service";
import { browsePublishedWeek } from "@/lib/menu/browse-published-week";
import { buildWeekBoard } from "@/lib/landing/week-board";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getTrialSettings } from "@/lib/services/trial-settings.service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
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
        title="Weekly menu"
        subtitle="Home-style tiffin, cooked fresh. Pick from this list for each delivery day."
      />

      {MENU_SECTIONS.map((section) =>
        section.key === "menu" ? (
          <Suspense key={section.key} fallback={<ThisWeekMenuSectionSkeleton />}>
            <MenuSectionData />
          </Suspense>
        ) : (
          <Suspense key={section.key} fallback={<PlansCtaSectionSkeleton />}>
            <PlansSection />
          </Suspense>
        ),
      )}
    </PageShell>
  );
}

async function PlansSection() {
  const [settings, catalog] = await Promise.all([resolveRequestOrg().then(getTrialSettings), loadCatalogSnapshot()]);
  const open = settings.maxDays != null && settings.maxDays >= 1 && settings.weekdays.length > 0
    && catalog.mealSizes.some((m) => m.trial && !m.custom && m.priceable !== false);
  return <PlansCtaSection trial={open && settings.maxDays != null ? { href: "/me/renew", maxDays: settings.maxDays } : null} />;
}

async function MenuSectionData() {
  const { timezone } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const browsed = await browsePublishedWeek(Date.now(), timezone);
  // Built server-side in the app timezone, so the client board never reads the clock for "today".
  const board = browsed.week ? buildWeekBoard(browsed.week, timezone) : null;
  return <ThisWeekMenuSection weekStart={browsed.week?.weekStart ?? null} board={board} scope={browsed.scope ?? "this"} />;
}
