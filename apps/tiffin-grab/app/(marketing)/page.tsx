import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@realm/ui/button";
import { Hero } from "@/components/marketing/hero";
import { Section } from "@/components/marketing/section";
import { WeeklyMenuPoster } from "@/components/marketing/weekly-menu-poster";
import { menuService } from "@/lib/services/menu.service";

export const metadata: Metadata = {
  title: "Tiffin Grab — Customizable tiffin delivery in the GTA",
  description: "Build and subscribe to home-style, customizable tiffin meal plans delivered across the Greater Toronto Area.",
};

// ISR: revalidate every 10 min so the DB isn't hit on every request for the highest-traffic page
export const dynamic = "force-dynamic";

const VALUES = [
  { title: "You customize everything", body: "Nutrition baseline, meal size, schedule, quantity, and duration — your plan, your way." },
  { title: "Fresh & home-style", body: "Balanced thalis and bowls cooked the way you'd make them at home." },
  { title: "Across the GTA", body: "Delivery to eleven regions, with slot windows matched to your postal code." },
];

export default async function LandingPage() {
  const pub = await menuService.getPublishedWeek("tiffin");
  return (
    <>
      <Hero />
      <Section className="grid gap-6 sm:grid-cols-3">
        {VALUES.map((v) => (
          <div key={v.title} className="hover-lift card-glow rounded-lg border p-6">
            <h3 className="font-medium">{v.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm">{v.body}</p>
          </div>
        ))}
      </Section>
      {pub && (
        <Section className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">This week&apos;s menu</h2>
          <WeeklyMenuPoster titlePrefix={pub.theme.titlePrefix} weekStart={pub.weekStart} slots={pub.slots} items={pub.items} accent={pub.theme.accent} />
        </Section>
      )}
      <Section className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-2xl font-semibold">Ready to build your tiffin?</h2>
        <Button asChild size="lg" className="hover-lift animate-pulse-ring"><Link href="/subscribe">Start your plan</Link></Button>
      </Section>
    </>
  );
}
