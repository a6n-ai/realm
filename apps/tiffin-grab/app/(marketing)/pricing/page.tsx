import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@realm/ui/button";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "Pricing — Tiffin Grab", description: "Plans, delivery frequencies, and volume-based per-tiffin pricing. Pricing is built from your selections." };

// Catalog is cached (loadCatalogSnapshot) and admin edits revalidate this path,
// so the page can be static with a 10m ISR safety net instead of force-dynamic.
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const { plans, frequencies, durations } = await loadCatalogSnapshot();
  return (
    <Section className="space-y-10">
      <div className="max-w-2xl">
        <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">The dabba math</p>
        <h1 className="m-0 text-[clamp(30px,5vw,54px)] font-bold tracking-[-1.5px]">No packages. Just math.</h1>
        <p className="text-muted-foreground mt-3">
          Your total is your per-tiffin rate × total tiffins (delivery days × weeks × persons).
          The per-tiffin rate drops with volume — orders of 20 or more tiffins get the best rate
          with no small-order surcharge.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Nutrition baselines</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="rounded-2xl border-[1.5px] border-foreground p-6">
              <h3 className="font-bold">{p.name}</h3>
              {p.description ? <p className="text-muted-foreground mt-1 text-sm">{p.description}</p> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-8 border-y-[1.5px] border-dashed border-foreground py-8 sm:grid-cols-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Weekend delivery</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            <li>Saturday &amp; Sunday delivery available — billed per tiffin, same as weekdays.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">Frequencies</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            {frequencies.map((f) => <li key={f.id} className="flex justify-between"><span>{f.name}</span></li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">Commitment</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            {durations.map((d) => <li key={d.id} className="flex justify-between"><span>{d.weeks} week{d.weeks > 1 ? "s" : ""}</span></li>)}
          </ul>
        </div>
      </div>

      <Button asChild size="lg" className="hover-lift group w-fit rounded-full"><Link href="/subscribe">See my price<ArrowRight className="icon-pop size-4" /></Link></Button>
    </Section>
  );
}
