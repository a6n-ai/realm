import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "Pricing — Tiffin Grab", description: "Plans, add-ons, delivery frequencies, and loyalty discounts. Pricing is built from your selections." };

// Read live so admin catalog edits surface without a rebuild.
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const { plans, addons, frequencies, durations } = await loadCatalogSnapshot();
  return (
    <Section className="space-y-10">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground mt-2">
          Your weekly fee is built from your meal size × quantity × billable days, plus add-ons,
          minus courier, student, and loyalty discounts.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-medium">Nutrition baselines</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="rounded-lg border p-5">
              <h3 className="font-medium">{p.name}</h3>
              {p.description ? <p className="text-muted-foreground mt-1 text-sm">{p.description}</p> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-8 sm:grid-cols-3">
        <div>
          <h2 className="text-xl font-medium">Add-ons</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            {addons.map((a) => <li key={a.key} className="flex justify-between"><span>{a.name}</span><span>+${a.pricePerWeek.toFixed(2)}/wk</span></li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-medium">Frequencies</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            {frequencies.map((f) => <li key={f.id} className="flex justify-between"><span>{f.name}</span>{f.courierDiscountPct ? <span>-{f.courierDiscountPct}%</span> : null}</li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-medium">Commitment</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            {durations.map((d) => <li key={d.id} className="flex justify-between"><span>{d.weeks} week{d.weeks > 1 ? "s" : ""}</span>{d.discountPct ? <span>-{d.discountPct}%</span> : null}</li>)}
          </ul>
        </div>
      </div>

      <Button asChild size="lg"><Link href="/subscribe">Start your plan</Link></Button>
    </Section>
  );
}
