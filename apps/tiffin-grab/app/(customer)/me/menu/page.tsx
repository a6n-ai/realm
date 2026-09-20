import { Suspense } from "react";
import { redirect } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import { parseIsoDateUtc, weekdayKey, zonedDateIso } from "@foundry/commons";
import { currentUserId } from "@/lib/services/session-service";
import { browsePublishedWeek } from "@/lib/menu/browse-published-week";
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
        subtitle="Browse what's released — tap a dish for details."
      />

      {MENU_SECTIONS.map((section) =>
        section.key === "menu" ? (
          <Suspense key={section.key} fallback={<ThisWeekMenuSectionSkeleton />}>
            <MenuSectionData />
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

async function MenuSectionData() {
  const { timezone } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();
  const browsed = await browsePublishedWeek(now, timezone);
  // Computed once, server-side, in the app's own timezone — passed down as a plain prop
  // so the client component never has to read the clock itself (which would risk a
  // server/client hydration mismatch on the highlighted "today" column).
  const todayKey = weekdayKey(parseIsoDateUtc(zonedDateIso(now, timezone)));
  return (
    <ThisWeekMenuSection
      week={browsed.week}
      scope={browsed.scope ?? "this"}
      todayKey={browsed.scope === "this" ? todayKey : undefined}
    />
  );
}
