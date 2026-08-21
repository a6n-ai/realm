import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@realm/ui/button";
import { PlanRows } from "@/components/marketing/plan-rows";
import { Section } from "@/components/marketing/section";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

export const metadata: Metadata = {
  title: "Plans — Tiffin Grab",
  description: "Vegetarian, non-vegetarian, or healthy — pick a nutrition baseline and build your tiffin plan.",
};

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const catalog = await loadCatalogSnapshot();
  return (
    <Section>
      <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">01 — Pick a baseline</p>
      <h2 className="m-0 mb-2.5 text-[clamp(28px,5vw,52px)] font-bold tracking-[-1.5px]">Three ways to eat.</h2>
      <PlanRows plans={catalog.plans} />
      <Button asChild size="lg" className="hover-lift mt-8.5 h-14 rounded-full px-8"><Link href="/subscribe">Start with a plan →</Link></Button>
    </Section>
  );
}
