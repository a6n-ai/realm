import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Hero } from "@/components/marketing/hero";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Tiffin Grab — Customizable tiffin delivery in the GTA",
  description: "Build and subscribe to home-style, customizable tiffin meal plans delivered across the Greater Toronto Area.",
};

const VALUES = [
  { title: "You customize everything", body: "Nutrition baseline, meal size, schedule, quantity, and duration — your plan, your way." },
  { title: "Fresh & home-style", body: "Balanced thalis and bowls cooked the way you'd make them at home." },
  { title: "Across the GTA", body: "Delivery to eleven regions, with slot windows matched to your postal code." },
];

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Section className="grid gap-6 sm:grid-cols-3">
        {VALUES.map((v) => (
          <div key={v.title} className="rounded-lg border p-6">
            <h3 className="font-medium">{v.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm">{v.body}</p>
          </div>
        ))}
      </Section>
      <Section className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-2xl font-semibold">Ready to build your tiffin?</h2>
        <Button asChild size="lg"><Link href="/subscribe">Start your plan</Link></Button>
      </Section>
    </>
  );
}
