import type { Metadata } from "next";
import { Suspense } from "react";
import { LandingReviews } from "@/components/landing/landing-reviews";
import Link from "next/link";
import { MealSizePrice } from "@/components/wizard/meal-size-price";
import { PageIntro, dashless } from "@/components/landing/public-shell";
import { ArrowRight } from "lucide-react";
import { MealParts } from "@/components/landing/meal-parts";
import { PriceMath, type MathFrequency, type MathLength, type MathPlan } from "@/components/landing/price-math";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { makeCategoryLook } from "@/components/customer/meals/category-look";
import { isComingSoon, publicPlans } from "@/components/landing/plan-options";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { effectivePrice } from "@/lib/pricing";
import { pageMeta } from "@/lib/landing/meta";
import "@/components/landing/styles/pricing.css";

export const metadata: Metadata = pageMeta("Plans and pricing | Tiffin Grab", "The vegetarian and non-veg plans, every meal size with what is in it, its calories and per-tiffin rate, and what longer plans take off each tiffin.", "/pricing");
export const revalidate = 300;
export const dynamic = "error";


const money = (n: number) => `$${n.toFixed(2)}`;
const DIET_LABEL: Record<string, string> = { veg: "Veg", "non-veg": "Non-veg" };

export default async function PricingPage() {
  const catalog = await loadCatalogSnapshot();
  const sizes = listableMealSizes(catalog.mealSizes);
  const plans = publicPlans(catalog.plans)
    .filter((p) => !isComingSoon(p.key))
    // Trial sizes lead each plan's list: the cheapest way in comes first.
    .map((p) => ({ ...p, sizes: sizes.filter((m) => m.planKey === p.key).sort((a, b) => Number(b.trial) - Number(a.trial)) }))
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

  // Live calculator data: each size's real rate and the days it can be eaten (its allowed days; no
  // weekend for sizes without a weekend dish), and each plan length's best duration discount (Home's rule).
  const ALL_DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const mathPlans: MathPlan[] = plans.map((p) => ({
    key: p.key,
    label: DIET_LABEL[p.key] ?? p.name,
    sizes: p.sizes.map((m) => ({
      id: m.publicId,
      name: dashless(m.name),
      rate: effectivePrice(m.basePrice, m),
      days: (m.allowedDays && m.allowedDays.length > 0 ? m.allowedDays : ALL_DAYS).filter((d) => m.servesWeekends || (d !== "sat" && d !== "sun")),
    })),
  }));
  // Delivery frequencies as the kitchen defines them: fixed weekdays, or the first N days of the week.
  const frequencies: MathFrequency[] = (catalog.frequencies ?? []).map((f) => ({
    id: f.publicId,
    name: f.name,
    days: (f.weekdays && f.weekdays.length > 0 ? f.weekdays : ALL_DAYS.slice(0, f.daysPerWeek)).filter((d): d is DayOfWeek => (ALL_DAYS as string[]).includes(d)),
  }));
  const lengths: MathLength[] = [...new Map(catalog.durations.map((d) => [d.weeks, d])).values()]
    .sort((a, b) => a.weeks - b.weeks)
    .map((d) => ({
      weeks: d.weeks,
      off: Math.max(0, ...(catalog.discounts ?? [])
        .filter((x) => x.kind === "duration" && (x.targetPublicId === d.publicId || (x.targetPublicId == null && (x.minWeeks ?? 0) <= d.weeks)))
        .map((x) => x.percent)),
    }));

  return (
    <>
    <div className="lp-wrap lp-section flex flex-col gap-[clamp(56px,8vw,96px)]">
      <div className="lp-price-hero">
        <PageIntro
          eyebrow="Plans and pricing"
          title={<>No packages. Just <span className="c-accent">math.</span></>}
          lede="Pick a diet, then a size. You see the total in the plan builder before you pay."
        />
        <PriceMath plans={mathPlans} lengths={lengths} frequencies={frequencies} />
      </div>

      {plans.length > 0 ? (
        <section aria-labelledby="tg-rates" className="lp-rates">
          <div className="lp-head lp-head--split">
            <h2 id="tg-rates" className="lp-h2">The per-tiffin <span className="c-accent">rate.</span></h2>
          </div>
          {/* Phones show one diet at a time; the switch is native radios, so it needs no script, works by
              keyboard and keeps every size in the HTML. Desktop shows both cards side by side. */}
          {plans.length > 1 ? (
            <div className="lp-diet" role="radiogroup" aria-label="Diet">
              {plans.map((p, i) => (
                <label key={p.key} className="lp-diet__opt" data-plan={p.key}>
                  <input type="radio" name="diet" value={p.key} defaultChecked={i === 0} className="sr-only" />
                  <span>{DIET_LABEL[p.key] ?? p.name}</span>
                </label>
              ))}
            </div>
          ) : null}
          <div className="lp-plans">
            {plans.map((p) => {
              const look = makeCategoryLook();
              const rates = p.sizes.map((m) => effectivePrice(m.basePrice, m));
              const from = Math.min(...rates), to = Math.max(...rates);
              return (
                // One card per diet: what it is, where its rates start, the way in, then every size.
                <div key={p.key} className="lp-tile lp-plan" data-plan={p.key}>
                  <div className="flex flex-col gap-2">
                    <h3 className="lp-tile__title">{p.name}</h3>
                    {p.description ? <p className="lp-note !mt-0">{p.description}</p> : null}
                  </div>
                  <p className="lp-price">
                    <small>from</small>
                    <strong>{money(from)}</strong>
                    <small>a tiffin{to > from ? `, up to ${money(to)}` : ""}</small>
                  </p>
                  <div className="lp-plan__go">
                    <Link prefetch={false} href={`/subscribe?plan=${p.key}`} className="lp-cta">Start with this plan<ArrowRight aria-hidden className="size-4" strokeWidth={2.2} /></Link>
                  </div>
                  <ul className="lp-list">
                    {p.sizes.map((m) => (
                      // Every meal size lives here now: what is in it, its calories and its rate.
                      <li key={m.publicId} className="lp-list__row lp-size-row">
                        <span>
                          <strong className="flex flex-wrap items-center gap-2">{dashless(m.name)}{m.trial ? <span className="lp-trial">Trial</span> : null}</strong>
                          <MealParts parts={m.components} look={look} />
                          <small>{m.kcalMin} to {m.kcalMax} kcal{m.proteinG != null ? ` · ${m.proteinG} g protein` : ""}</small>
                        </span>
                        <MealSizePrice meal={m} perTiffin priceClassName="text-base font-semibold text-foreground tabular-nums" />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {weeksOff.length > 0 ? (
        <section aria-labelledby="tg-weeks">
          <div className="lp-head lp-head--split">
            <h2 id="tg-weeks" className="lp-h2">Longer plans, lower <span className="c-accent">rate.</span></h2>
          </div>
          {/* A staircase: each longer plan takes more off every tiffin, read left to right. */}
          <ol className="lp-steps">
            {weeksOff.map((d) => (
              <li key={d.key} className="lp-tile lp-steps__step">
                <span className="lp-steps__off">{d.percent}%</span>
                <span className="lp-steps__label">off every tiffin</span>
                <strong className="lp-steps__weeks">{d.label}</strong>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="lp-actions lp-actions--start">
        <Link prefetch={false} href="/subscribe" className="lp-cta">See my price<ArrowRight aria-hidden className="size-4" strokeWidth={2.2} /></Link>
        <Link href="/menu" className="lp-textlink">This week&apos;s menu<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
      </div>
    </div>
      {/* External Places fetch: a cache miss must not hold back the page. */}
      <Suspense fallback={null}><LandingReviews /></Suspense>
    </>
  );
}
