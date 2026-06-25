import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "Pricing — Tiffin Grab", description: "Plans, delivery frequencies, and volume-based per-tiffin pricing. Pricing is built from your selections." };

// Catalog is cached (loadCatalogSnapshot) and admin edits revalidate this path,
// so the page can be static with a 10m ISR safety net instead of force-dynamic.
export const revalidate = 600;

export default async function PricingPage() {
  const { plans, frequencies, durations } = await loadCatalogSnapshot();
  return (
    <Section className="space-y-10">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground mt-2">
          Your total is your per-tiffin rate × total tiffins (delivery days × weeks × persons).
          The per-tiffin rate drops with volume — orders of 20 or more tiffins get the best rate
          with no small-order surcharge.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-medium">Nutrition baselines</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="hover-lift card-glow rounded-lg border p-5">
              <h3 className="font-medium">{p.name}</h3>
              {p.description ? <p className="text-muted-foreground mt-1 text-sm">{p.description}</p> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-8 sm:grid-cols-3">
        <div>
          <h2 className="text-xl font-medium">Weekend delivery</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            <li>Saturday &amp; Sunday delivery available — billed per tiffin, same as weekdays.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-medium">Frequencies</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            {frequencies.map((f) => <li key={f.id} className="flex justify-between"><span>{f.name}</span></li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-medium">Commitment</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            {durations.map((d) => <li key={d.id} className="flex justify-between"><span>{d.weeks} week{d.weeks > 1 ? "s" : ""}</span></li>)}
          </ul>
        </div>
      </div>

      <Button asChild size="lg" className="hover-lift group w-fit"><Link href="/subscribe">Start your plan<ArrowRight className="icon-pop size-4" /></Link></Button>
    </Section>
  );
}
