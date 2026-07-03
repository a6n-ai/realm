import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { Section } from "@/components/marketing/section";
import { MealCard } from "@/components/marketing/cards";

export const metadata: Metadata = { title: "Menu — Tiffin Grab", description: "Browse meal sizes by tier, with calories and macros, available across the GTA." };

// Catalog is cached (loadCatalogSnapshot) and admin edits revalidate this path,
// so the page can be static with a 10m ISR safety net instead of force-dynamic.
export const dynamic = "force-dynamic";

const TIERS = [
  { key: "budget", label: "Budget" },
  { key: "medium", label: "Medium" },
  { key: "premium", label: "Premium" },
] as const;

export default async function MenuPage() {
  const { mealSizes } = await loadCatalogSnapshot();
  return (
    <Section className="space-y-10">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Our menu</h1>
        <p className="text-muted-foreground mt-2">Meal sizes across three tiers — pick what fits your appetite and macros.</p>
      </div>
      {TIERS.map((tier) => {
        const meals = mealSizes.filter((m) => m.tier === tier.key);
        if (meals.length === 0) return null;
        return (
          <div key={tier.key} className="space-y-4">
            <h2 className="text-xl font-medium">{tier.label}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {meals.map((m) => <div key={m.id} className="hover-lift card-glow rounded-lg"><MealCard meal={m} /></div>)}
            </div>
          </div>
        );
      })}
      <Button asChild size="lg" className="hover-lift group w-fit"><Link href="/subscribe">Build your plan<ArrowRight className="icon-pop size-4" /></Link></Button>
    </Section>
  );
}
