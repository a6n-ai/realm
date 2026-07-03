import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";
import { WeeklyMenuPoster } from "@/components/marketing/weekly-menu-poster";
import { menuService } from "@/lib/services/menu.service";

export const metadata: Metadata = { title: "This week's menu — Tiffin Grab", description: "Our weekly tiffin menu across the GTA." };
export const dynamic = "force-dynamic";

export default async function WeeklyMenuPage() {
  const pub = await menuService.getPublishedWeek("tiffin");
  return (
    <Section className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">This week&apos;s menu</h1>
        <p className="text-muted-foreground mt-2">Fresh, home-style tiffin — updated every week.</p>
      </div>
      {pub ? (
        <>
          <WeeklyMenuPoster titlePrefix={pub.theme.titlePrefix} weekStart={pub.weekStart} slots={pub.slots} items={pub.items} accent={pub.theme.accent} />
          <a href="/menu/weekly/pdf" className="inline-flex w-fit items-center rounded-md border px-4 py-2 text-sm font-medium hover-lift">Download PDF</a>
        </>
      ) : (
        <p className="text-muted-foreground">Menu coming soon — check back shortly.</p>
      )}
    </Section>
  );
}
