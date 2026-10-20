import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageIntro } from "@/components/landing/public-shell";
import { isComingSoon, publicPlans } from "@/components/landing/plan-options";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { effectivePrice } from "@/lib/pricing";
import { pageMeta } from "@/lib/landing/meta";

export const metadata: Metadata = pageMeta("Plans | Tiffin Grab", "Compare the vegetarian and non-veg plans: what comes in them, the sizes and the per-tiffin rates.", "/plans");

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toFixed(2)}`;

export default async function PlansPage() {
  const catalog = await loadCatalogSnapshot();
  const sizes = listableMealSizes(catalog.mealSizes);
  const plans = publicPlans(catalog.plans).map((p) => {
    const own = sizes.filter((m) => m.planKey === p.key);
    const rates = own.map((m) => effectivePrice(m.basePrice, m));
    return { ...p, sizes: own, from: rates.length ? Math.min(...rates) : null, to: rates.length ? Math.max(...rates) : null, soon: isComingSoon(p.key) };
  });

  return (
    <div className="tg-wrap tg-section">
      <PageIntro
        eyebrow="Plans"
        title={<>Pick how you <span className="c-accent">eat.</span></>}
        lede="Every plan starts with a diet. Compare them here; size, sides, days and weeks come next, in the plan builder."
      />
      <div className="tg-compare">
        {plans.map((p) => (
          <article key={p.key} className="tg-card tg-compare__plan" aria-disabled={p.soon || undefined}>
            <div className="flex flex-col gap-2">
              <h2 className="m-0 text-2xl font-bold tracking-tight">{p.name}</h2>
              {p.description ? <p className="m-0 text-sm text-muted-foreground">{p.description}</p> : null}
            </div>
            {p.from != null ? (
              <p className="m-0 flex items-baseline gap-1.5">
                <span className="c-caption">from</span>
                <span className="text-3xl font-bold tracking-tight tabular-nums">{money(p.from)}</span>
                <span className="c-caption">a tiffin{p.to != null && p.to > p.from ? `, up to ${money(p.to)}` : ""}</span>
              </p>
            ) : null}
            {p.sizes.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="c-caption">{p.sizes.length} meal {p.sizes.length === 1 ? "size" : "sizes"}</span>
                <ul className="tg-compare__sizes">
                  {p.sizes.map((m) => <li key={m.publicId}>{m.name}</li>)}
                </ul>
              </div>
            ) : null}
            <div className="mt-auto pt-2">
              {p.soon ? (
                <span className="tg-soon">Coming soon</span>
              ) : (
                <Link href={`/subscribe?plan=${p.key}`} className="tg-cta">Start with this plan<ArrowRight className="size-4" strokeWidth={2} /></Link>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="mt-8"><Link href="/pricing" className="tg-link tg-link--tap">Every size and rate</Link></p>
    </div>
  );
}
