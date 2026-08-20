import type { Metadata } from "next";
import { DabbaMath } from "@/components/marketing/dabba-math";
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
      <DabbaMath eyebrow="The dabba math" />

      <dl className="border-foreground border-t-[1.5px] text-sm">
        {plans.map((p) => (
          <div key={p.id} className="border-foreground flex justify-between gap-4 border-b-[1.5px] border-dashed py-3">
            <dt className="font-semibold">{p.name}</dt>
            <dd className="text-muted-foreground text-right">{p.description ?? ""}</dd>
          </div>
        ))}
        {frequencies.map((f) => (
          <div key={f.id} className="border-foreground flex justify-between gap-4 border-b-[1.5px] border-dashed py-3">
            <dt className="text-muted-foreground">Frequency</dt>
            <dd>{f.name}</dd>
          </div>
        ))}
        {durations.map((d) => (
          <div key={d.id} className="border-foreground flex justify-between gap-4 border-b-[1.5px] border-dashed py-3">
            <dt className="text-muted-foreground">Commitment</dt>
            <dd>{d.weeks} week{d.weeks > 1 ? "s" : ""}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
