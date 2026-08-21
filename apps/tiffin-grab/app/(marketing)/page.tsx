import type { Metadata } from "next";
import { DabbaMath } from "@/components/marketing/dabba-math";
import { GoogleReviewsSection } from "@/components/marketing/google-reviews-section";
import { Hero } from "@/components/marketing/hero";
import { HowItWorksSteps } from "@/components/marketing/how-it-works-steps";
import { PlanRows } from "@/components/marketing/plan-rows";
import { Section } from "@/components/marketing/section";
import { WeeklyMenuPoster } from "@/components/marketing/weekly-menu-poster";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { menuService } from "@/lib/services/menu.service";

export const metadata: Metadata = {
  title: "Tiffin Grab — Customizable tiffin delivery in the GTA",
  description: "Build and subscribe to home-style, customizable tiffin meal plans delivered across the Greater Toronto Area.",
};

// ISR: revalidate every 10 min so the DB isn't hit on every request for the highest-traffic page
export const dynamic = "force-dynamic";

const FAQS = [
  { q: "Where do you deliver?", a: "Across eleven GTA regions. Enter your postal code at checkout to see your slot window — if we don't serve your area yet, you can join the waitlist." },
  { q: "Can I customize my meals?", a: "Yes. You choose a nutrition baseline, meal size, schedule, daily quantity, weekend add-ons, and commitment length." },
  { q: "How does pricing work?", a: "You pay a per-tiffin rate multiplied by your total tiffin count (delivery days per week × weeks × persons). The per-tiffin rate drops with volume — orders of 20 or more tiffins get the best rate with no small-order surcharge. See the Pricing page." },
  { q: "How do I pay?", a: "Checkout currently uses a simulated payment while we finish onboarding our payment provider." },
];

export default async function LandingPage() {
  const [pub, catalog] = await Promise.all([menuService.getPublishedWeek(), loadCatalogSnapshot()]);
  return (
    <>
      <Hero />
      <Section>
        <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">01 — Pick a baseline</p>
        <h2 className="m-0 mb-2.5 text-[clamp(28px,5vw,52px)] font-bold tracking-[-1.5px]">Three ways to eat.</h2>
        <PlanRows plans={catalog.plans} />
      </Section>
      {pub && (
        <Section className="space-y-6">
          <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">02 — This week&apos;s menu</p>
          <h2 className="m-0 text-[clamp(28px,5vw,52px)] font-bold tracking-[-1.5px]">What&apos;s cooking.</h2>
          <WeeklyMenuPoster titlePrefix={pub.theme.titlePrefix} weekStart={pub.weekStart} slots={pub.slots} items={pub.items} accent={pub.theme.accent} />
        </Section>
      )}
      <Section className="space-y-10">
        <HowItWorksSteps eyebrow="03 — How it works" />
        <DabbaMath eyebrow="04 — The dabba math" />
      </Section>
      <GoogleReviewsSection />
      <Section id="faq" className="max-w-2xl scroll-mt-24">
        <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">05 — Questions</p>
        <h2 className="m-0 mb-6.5 text-[clamp(28px,5vw,52px)] font-bold tracking-[-1.5px]">Frequently asked.</h2>
        <dl className="border-foreground border-t-[1.5px]">
          {FAQS.map((f) => (
            <div key={f.q} className="border-foreground border-b-[1.5px] py-6">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}
