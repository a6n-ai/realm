import { BRAND_NAME } from "@/lib/brand";
import { MON_FRI, WEEK_DAYS } from "@/lib/deliveries/schedule/delivery-days";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LandingReviews } from "@/components/landing/landing-reviews";
import Link from "next/link";
import { MealSizePrice } from "@/components/wizard/meal-size-price";
import { PageIntro, dashless } from "@/components/landing/public-shell";
import { ArrowRight, ChevronDown } from "lucide-react";
import { MealParts } from "@/components/landing/meal-parts";
import { PriceMath, type MathFrequency, type MathLength, type MathPlan } from "@/components/landing/price-math";
import type { DayOfWeek } from "@/lib/deliveries/schedule/delivery-days";
import { makeCategoryLook } from "@/components/kit/category-look";
import { isComingSoon, publicPlans } from "@/lib/landing/plan-options";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { effectivePrice } from "@/lib/pricing";
import { APP_DEFAULTS } from "@/db/schema/app-defaults";
import { tiffinBounds } from "@/lib/wizard/selections";
import { savePct } from "@/lib/pricing/discounts";
import { pageMeta } from "@/lib/landing/meta";
import { breadcrumbJsonLd, jsonLdScript, pricingJsonLd } from "@/lib/landing/business-jsonld";
import { publicOrigin } from "@/lib/routing/apex";
import "@/components/landing/styles/pricing.css";
import { PlanPicks } from "@/components/landing/pricing/plan-picks";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import { biggestDurationOff, deliveryIsFree, lowestRate, shortMoney, trialLength, trialOffer } from "@/lib/landing/live-figures";
import { getTrialSettings } from "@/lib/trial/trial-settings.service";
import { getAppSettings, getMoneyFormatter } from "@/lib/services/app-settings.service";
import { isWeekendDay } from "@foundry/commons/util/dates";

// Plans live on this page too (/plans redirects here), so the copy names both.
export async function generateMetadata(): Promise<Metadata> {
  const [catalog, { currency }] = await Promise.all([loadCatalogSnapshot(), getAppSettings()]);
  const rate = lowestRate(catalog);
  const off = biggestDurationOff(catalog);
  const title = rate != null ? `Tiffin Plans & Prices in Toronto, from ${shortMoney(rate, currency)} | ${BRAND_NAME}` : `Tiffin Plans & Prices in Toronto & GTA | ${BRAND_NAME}`;
  const saving = off != null ? `, up to ${off}% off longer plans` : "";
  const delivery = deliveryIsFree(catalog) ? ", and free GTA delivery" : "";
  return pageMeta(title, `Veg and non-veg plans with every meal size, what's in it and its calories. One rate per tiffin${saving}${delivery}.`, "/pricing");
}
export const revalidate = 300;
export const dynamic = "error";


const DIET_LABEL: Record<string, string> = { veg: "Veg", "non-veg": "Non-veg" };
// Rows per plan before "Show N more sizes": the trial plus the cheapest few cover most choices.
const VISIBLE_SIZES = 5;

export default async function PricingPage() {
  const money = await getMoneyFormatter();
  const [catalog, trialSettings, { currency }] = await Promise.all([loadCatalogSnapshot(), getTrialSettings(), getAppSettings()]);
  const origin = publicOrigin();
  const offers = pricingJsonLd(catalog, origin, currency);
  const trial = trialOffer(catalog, trialSettings);
  const sizes = listableMealSizes(catalog.mealSizes);
  const plans = publicPlans(catalog.plans)
    .filter((p) => !isComingSoon(p.key))
    // Trial sizes lead each plan's list (the way in), then the rest cheapest first, so it reads as a ladder.
    .map((p) => ({ ...p, sizes: sizes.filter((m) => m.planKey === p.key).sort((a, b) => Number(b.trial) - Number(a.trial) || effectivePrice(a.basePrice, a) - effectivePrice(b.basePrice, b)) }))
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
  // The calculator prices a plan, as the plan builder does: the trial has its own card (and its own
  // day rules, Mon to Fri), so it stays out, and the calculator opens on a size that serves every day.
  const mathPlans: MathPlan[] = plans.map((p) => ({
    key: p.key,
    label: DIET_LABEL[p.key] ?? p.name,
    sizes: p.sizes.filter((m) => !m.trial).map((m) => ({
      id: m.publicId,
      name: dashless(m.name),
      rate: effectivePrice(m.basePrice, m),
      days: (m.allowedDays && m.allowedDays.length > 0 ? m.allowedDays : WEEK_DAYS).filter((d) => m.servesWeekends || (!isWeekendDay(d))),
    })),
  }));
  const maxPct = catalog.maxDiscountPct ?? APP_DEFAULTS.maxDiscountPct;
  const bounds = tiffinBounds(catalog);
  const weeksList = [...new Set(catalog.durations.map((d) => d.weeks))].sort((a, b) => a - b);
  // Delivery frequencies as the kitchen defines them (fixed weekdays), each with its delivery discount per plan length.
  const frequencies: MathFrequency[] = (catalog.frequencies ?? [])
    .filter((f) => f.weekdays && f.weekdays.length > 0)
    .map((f) => ({
      id: f.publicId,
      key: f.key,
      name: f.name,
      days: f.weekdays!.filter((d): d is DayOfWeek => (WEEK_DAYS as readonly string[]).includes(d)),
      off: Object.fromEntries(weeksList.map((w) => [w, savePct(catalog.discounts, "delivery", f.publicId, w)])),
    }));
  // Like the engine: every duration rule that applies is summed, then capped.
  const lengths: MathLength[] = [...new Map(catalog.durations.map((d) => [d.weeks, d])).values()]
    .sort((a, b) => a.weeks - b.weeks)
    .map((d) => ({
      weeks: d.weeks,
      off: Math.min(maxPct, (catalog.discounts ?? [])
        .filter((x) => x.kind === "duration" && x.percent > 0 && (x.targetPublicId === d.publicId || (x.targetPublicId == null && (x.minWeeks ?? 0) <= d.weeks)))
        .reduce((sum, x) => sum + x.percent, 0)),
    }));

  const from = lowestRate(catalog);
  const weekdayFreq = frequencies.find((f) => f.days.length === 5 && MON_FRI.every((d) => f.days.includes(d)));

  return (
    <>
    {[breadcrumbJsonLd(origin, "Plans and pricing", "/pricing"), offers].map((d, i) => d && <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(d) }} />)}
    <div className="lp-wrap lp-section flex flex-col gap-[clamp(56px,8vw,96px)]">
      <div className="pr-hero">
      <PageIntro
          eyebrow="Plans and pricing"
          title={<>Home cooked lunch from <span className="c-accent">{from != null ? money(from) : "us"}</span></>}
          lede="One rate per tiffin. Pick a ready plan or adjust your own."
      >
        <div className="lp-actions lp-actions--start">
          <a href="#picks" className="lp-cta">See ready plans<ArrowRight aria-hidden className="size-4" strokeWidth={2.2} /></a>
          <BuildTiffinLink href="/subscribe" className="lp-textlink">Build my tiffin<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></BuildTiffinLink>
        </div>
      </PageIntro>
      {/* The trial is the low-commitment way in: shown beside the price, only while one is offered. */}
      {trial ? (
        <aside className="lp-tile pr-trial" aria-labelledby="pr-trial-title">
          <h2 id="pr-trial-title" className="lp-tile__title">Not sure yet?</h2>
          <p className="pr-trial__lead">Try {trialLength(trial)} first.</p>
          <p className="lp-from lp-from--lg"><strong>{money(trial.rate)}</strong><span>a tiffin</span></p>
          <Link prefetch={false} href={trial.href} className="lp-cta">Start a trial</Link>
        </aside>
      ) : null}
      </div>

      <PlanPicks
        plans={plans.map((p) => ({
          key: p.key,
          label: DIET_LABEL[p.key] ?? p.name,
          sizes: p.sizes.filter((m) => !m.trial).map((m) => ({
            id: m.publicId,
            name: dashless(m.name),
            rate: effectivePrice(m.basePrice, m),
            days: (m.allowedDays && m.allowedDays.length > 0 ? m.allowedDays : WEEK_DAYS).filter((d) => m.servesWeekends || (!isWeekendDay(d))),
            parts: m.components,
            kcalMin: m.kcalMin,
            kcalMax: m.kcalMax,
          })),
        }))}
        lengths={lengths}
        weekdayFreq={weekdayFreq}
        maxPct={maxPct}
      />

      <section aria-labelledby="tg-adjust" className="lp-adjust">
        <div className="lp-head lp-head--split">
          <h2 id="tg-adjust" className="lp-h2">Or build your <span className="c-accent">own.</span></h2>
        </div>
        <PriceMath plans={mathPlans} lengths={lengths} frequencies={frequencies} bounds={bounds} maxPct={maxPct} />
      </section>

      {plans.length > 0 ? (
        <details className="lp-all">
        <summary className="lp-all__sum"><h2 className="lp-h2">All sizes and <span className="c-accent">prices.</span></h2><ChevronDown aria-hidden className="lp-all__chev size-5" strokeWidth={2} /></summary>
        <section aria-label="Per tiffin rates" className="lp-rates">
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
                  {(() => {
                    // Every meal size lives here: what is in it, its calories and its rate. Ten-odd rows read
                    // as a wall, so the first few show and the rest open in place (still in the HTML).
                    const row = (m: (typeof p.sizes)[number]) => (
                      <li key={m.publicId} className="lp-list__row lp-size-row">
                        <span>
                          <strong className="flex flex-wrap items-center gap-2">{dashless(m.name)}{m.trial ? <span className="lp-trial">Trial</span> : null}</strong>
                          <MealParts parts={m.components} look={look} />
                          <small>{m.kcalMin} to {m.kcalMax} kcal{m.proteinG != null ? ` · ${m.proteinG} g protein` : ""}</small>
                        </span>
                        <MealSizePrice meal={m} perTiffin priceClassName="text-base font-semibold text-foreground tabular-nums" />
                      </li>
                    );
                    const shown = p.sizes.slice(0, VISIBLE_SIZES), more = p.sizes.slice(VISIBLE_SIZES);
                    return (
                      <>
                        <ul className="lp-list">{shown.map(row)}</ul>
                        {more.length > 0 ? (
                          <details className="group">
                            <summary className="lp-textlink cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                              <span className="group-open:hidden">Show {more.length} more {more.length === 1 ? "size" : "sizes"}</span>
                              <span className="hidden group-open:inline">Show fewer sizes</span>
                              <ChevronDown aria-hidden className="size-4 transition-[rotate] duration-200 group-open:rotate-180 motion-reduce:transition-none" strokeWidth={2} />
                            </summary>
                            <ul className="lp-list mt-2">{more.map(row)}</ul>
                          </details>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </section>
        </details>
      ) : null}

      {weeksOff.length > 0 ? (
        <section aria-labelledby="tg-weeks">
          <div className="lp-head lp-head--split">
            <h2 id="tg-weeks" className="lp-h2">Longer plans, lower <span className="c-accent">rate.</span></h2>
          </div>
          {/* A staircase: each longer plan takes more off every tiffin, read left to right. */}
          <ol className="lp-steps">
            {weeksOff.map((d) => (
              // Weeks first in the markup so the text (search snippets, screen readers) reads "4 weeks 7% off every
              // tiffin"; CSS order still draws it under the number. The {" "} keep the words apart in plain text.
              <li key={d.key} className="lp-tile lp-steps__step">
                <strong className="lp-steps__weeks">{d.label}</strong>{" "}
                <span className="lp-steps__off">{d.percent}%</span>{" "}
                <span className="lp-steps__label">off every tiffin </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section aria-labelledby="tg-band" className="lp-band">
        <h2 id="tg-band" className="lp-h2">Ready when <span className="c-accent">you are.</span></h2>
        <p className="lp-lede">You see the total in the plan builder before you pay.</p>
        <div className="lp-actions lp-actions--start">
          <BuildTiffinLink href="/subscribe" className="lp-cta">Build my tiffin<ArrowRight aria-hidden className="size-4" strokeWidth={2.2} /></BuildTiffinLink>
          {trial ? <Link prefetch={false} href={trial.href} className="lp-textlink">Try {trialLength(trial)} first<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link> : null}
          <Link href="/menu" className="lp-textlink">This week&apos;s menu<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
        </div>
      </section>
    </div>
      {/* External Places fetch: a cache miss must not hold back the page. */}
      <Suspense fallback={null}><LandingReviews /></Suspense>
    </>
  );
}
