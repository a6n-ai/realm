import type { Metadata } from "next";
import { Suspense } from "react";
import { LandingReviews } from "@/components/landing/landing-reviews";
import Link from "next/link";
import { MealSizePrice } from "@/components/wizard/meal-size-price";
import { PageIntro } from "@/components/landing/public-shell";
import { isComingSoon, publicPlans } from "@/components/landing/plan-options";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { pageMeta } from "@/lib/landing/meta";

export const metadata: Metadata = pageMeta("Pricing | Tiffin Grab", "Per-tiffin rates for every meal size on the vegetarian and non-veg plans, and what longer plans take off each tiffin.", "/pricing");

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const catalog = await loadCatalogSnapshot();
  const sizes = listableMealSizes(catalog.mealSizes);
  const plans = publicPlans(catalog.plans)
    .filter((p) => !isComingSoon(p.key))
    .map((p) => ({ ...p, sizes: sizes.filter((m) => m.planKey === p.key) }))
    .filter((p) => p.sizes.length > 0);
  // A duration discount names either a floor (minWeeks) or one duration row.
  const weeksOff = (catalog.discounts ?? [])
    .filter((d) => d.kind === "duration" && d.percent > 0)
    .map((d) => {
      const weeks = d.minWeeks ?? catalog.durations.find((x) => x.publicId === d.targetPublicId)?.weeks;
      return weeks == null ? null : { key: d.key, percent: d.percent, label: d.minWeeks != null ? `${weeks} weeks or more` : `${weeks} weeks` };
    })
    .filter((d) => d != null)
    .sort((a, b) => parseInt(a.label) - parseInt(b.label));

  return (
    <>
    <div className="tg-wrap tg-section flex flex-col gap-16">
      <div>
        <PageIntro
          eyebrow="Pricing"
          title={<>No packages. Just <span className="c-accent">math.</span></>}
          lede="You see the total in the plan builder before you pay."
        />
        <p className="tg-sum">
          <span className="tg-sum__term">per-tiffin rate</span><span className="tg-sum__op">×</span>
          <span className="tg-sum__term">days a week</span><span className="tg-sum__op">×</span>
          <span className="tg-sum__term">weeks</span><span className="tg-sum__op">=</span>
          <span className="tg-sum__term tg-sum__total">your total</span>
        </p>
      </div>

      {plans.length > 0 ? (
        <section aria-labelledby="tg-rates" className="tg-stack">
          <h2 id="tg-rates" className="tg-h2">The per-tiffin <span className="c-accent">rate.</span></h2>
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((p) => (
              <div key={p.key} className="tg-card">
                <h3 className="m-0 px-5 pt-5 text-lg font-bold tracking-tight">{p.name}</h3>
                <ul className="tg-rows">
                  {p.sizes.map((m) => (
                    <li key={m.publicId}>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <strong>{m.name}</strong>
                        {m.components.length > 0 ? <span>{m.components.join(" + ")}</span> : null}
                      </span>
                      <MealSizePrice meal={m} perTiffin priceClassName="text-base font-semibold text-foreground" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {weeksOff.length > 0 ? (
        <section aria-labelledby="tg-weeks" className="tg-stack">
          <h2 id="tg-weeks" className="tg-h2">Longer plans, lower <span className="c-accent">rate.</span></h2>
          <ul className="tg-card tg-rows max-w-[520px]">
            {weeksOff.map((d) => (
              <li key={d.key}>
                <strong>{d.label}</strong>
                <span>{d.percent}% off every tiffin</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Link prefetch={false} href="/subscribe" className="tg-cta">See my price</Link>
        <Link href="/plans" className="tg-btn">Compare the plans</Link>
      </div>
    </div>
      {/* External Places fetch: a cache miss must not hold back the page. */}
      <Suspense fallback={null}><LandingReviews /></Suspense>
    </>
  );
}
