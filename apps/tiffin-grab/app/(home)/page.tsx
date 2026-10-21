import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { preload } from "react-dom";
import { parseIsoDateUtc } from "@foundry/commons";
import { LandingMotion } from "@/components/landing/landing-motion";
import { LandingReviews } from "@/components/landing/landing-reviews";
import { WeekBend } from "@/components/landing/week-bend";
import { FrequencyPicker } from "@/components/landing/frequency-picker";
import { WeeksPicker } from "@/components/landing/weeks-picker";
import { TIFFIN_LABEL } from "@/components/landing/tiffin-art.generated";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { formatDateOnly } from "@/lib/format/datetime";
import { buildWeekBoard } from "@/lib/landing/week-board";
import { WeekBoard } from "@/components/landing/week-board";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";
import { FAQS } from "@/components/landing/faqs";
import { DeliverySection } from "@/components/landing/delivery-section";
import { PlanOptions, isComingSoon, publicPlans } from "@/components/landing/plan-options";
import { pageMeta } from "@/lib/landing/meta";
import { FIGURE_RASTER, FIGURE_SIZES, FIGURE_SRCSET } from "@/lib/landing/figure";

export const metadata: Metadata = pageMeta("Tiffin Grab: home-style tiffins, packed the way you eat", "Home-style tiffin meals delivered across the Greater Toronto Area. You choose the diet, the size, the sides, the days and how many weeks.", "/");

// Rendered per request: the image build has no database to prerender against, and
// with the catalog/menu reads cached the render is ~50ms on the box.
export const dynamic = "force-dynamic";


const hourLabel = (h: number) =>
  new Intl.DateTimeFormat("en-CA", { hour: "numeric", timeZone: "UTC" }).format(Date.UTC(2026, 0, 1, h)).replace(/\./g, "").toUpperCase();

const weeksLabel = (weeks: number[]) => {
  const w = [...new Set(weeks)].sort((a, b) => a - b);
  if (w.length === 0) return null;
  if (w.length === 1) return `${w[0]} ${w[0] === 1 ? "week" : "weeks"}`;
  return `${w.slice(0, -1).join(", ")} or ${w[w.length - 1]} weeks`;
};

function weekRange(weekStart: string) {
  const end = parseIsoDateUtc(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${formatDateOnly(weekStart, { mode: "short" })} to ${formatDateOnly(end.toISOString().slice(0, 10), { mode: "short" })}`;
}

function Chapter({ step, children }: { step: number; children: ReactNode }) {
  return (
    <div className="tg-chapter" data-step={step}>
      <div className="tg-stack">{children}</div>
    </div>
  );
}

function Rows({ rows }: { rows: { key: string; title: string; note: string | null }[] }) {
  return (
    <ul className="tg-card tg-rows">
      {rows.map((r) => (
        <li key={r.key}>
          <strong>{r.title}</strong>
          {r.note ? <span>{r.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export default async function LandingPage() {
  // The figure is the LCP element: a light WebP, fetched alongside the CSS, not after it.
  preload(FIGURE_RASTER[1], { as: "image", fetchPriority: "high", imageSrcSet: FIGURE_SRCSET, imageSizes: FIGURE_SIZES });
  const [pub, catalog, { timezone }] = await Promise.all([menuService.getPublishedWeek(), loadCatalogSnapshot(), getAppSettings()]);

  const plans = publicPlans(catalog.plans);
  const firstPlan = plans.find((p) => !isComingSoon(p.key));
  const sizes = listableMealSizes(catalog.mealSizes).filter((m) => m.planKey === firstPlan?.key).slice(0, 4);
  const addons = [...new Map(Object.values(catalog.addonsByCategory ?? {}).flat().map((a) => [a.name, a])).values()].slice(0, 4);
  const durationOff = Math.max(0, ...(catalog.discounts ?? []).filter((d) => d.kind === "duration").map((d) => d.percent));
  const weeks = weeksLabel(catalog.durations.map((d) => d.weeks));
  // Each sold length with the best duration discount that reaches it: one aimed at
  // that length, a minimum-weeks floor it clears, or one for every length.
  const lengths = [...new Map(catalog.durations.map((d) => [d.weeks, d])).values()]
    .sort((a, b) => a.weeks - b.weeks)
    .map((d) => ({
      weeks: d.weeks,
      off: Math.max(0, ...(catalog.discounts ?? [])
        .filter((x) => x.kind === "duration" && (x.targetPublicId === d.publicId || (x.targetPublicId == null && (x.minWeeks ?? 0) <= d.weeks)))
        .map((x) => x.percent)),
    }));
  const firstWeeks = lengths.find((l) => l.weeks === 4)?.weeks ?? lengths[0]?.weeks ?? 0;
  const cutoff = catalog.cutoffHour != null ? hourLabel(catalog.cutoffHour) : null;

  const board = pub ? buildWeekBoard(pub, timezone) : { days: [], rows: [], weekend: null };

  return (
    <>
        <section className="tg-wrap tg-story" aria-label="How a tiffin is packed">
          <div className="tg-story__stage">
            <figure className="tg-plate m-0">
              <span className="tg-plate__corner" data-c="tl">Fig 1</span>
              <span className="tg-plate__corner" data-c="tr">Your tiffin</span>
              {/* The packed pose as a plain image, so the figure shows before (and without) the script; LandingMotion swaps in the live SVG. */}
              <div className="tf-figure" data-tiffin-stage role="img" aria-label={TIFFIN_LABEL}>
                {/* eslint-disable-next-line @next/next/no-img-element -- an SVG the script replaces with inline markup */}
                <img src={FIGURE_RASTER[1]} srcSet={FIGURE_SRCSET} sizes={FIGURE_SIZES} alt="" width={720} height={640} fetchPriority="high" />
              </div>
              <span className="tg-plate__corner" data-c="bl" data-tiffin-step>Step 1 of 7</span>
              <span className="tg-plate__corner" data-c="br" data-tiffin-readout aria-live="polite">Packed</span>
            </figure>
          </div>

          <div className="tg-story__chapters">
            <div className="tg-chapter" data-step={0}>
              <div className="flex flex-col gap-6">
                <span className="c-eyebrow !mb-0">Tiffin Grab · Greater Toronto Area</span>
                <h1 className="tg-display">Home‑style food, packed the way you <span className="c-accent">eat.</span></h1>
                <p className="tg-lede">A steel tiffin of home-style Indian food, brought to your door. You choose the diet, the size, the sides, the days and how many weeks.</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link prefetch={false} href="/subscribe" className="tg-cta">Build my tiffin</Link>
                  {pub ? <a href="#menu" className="tg-btn">This week&apos;s menu</a> : null}
                </div>
              </div>
            </div>

            <Chapter step={1}>
              <h2 className="tg-h2">Cooked the way home <span className="c-accent">cooks.</span></h2>
              <p className="tg-lede">Dal, rice, sabzi and rotis, made in small batches the way a home kitchen does it.</p>
            </Chapter>

            <Chapter step={2}>
              <h2 className="tg-h2">Packed to how you <span className="c-accent">eat.</span></h2>
              <PlanOptions plans={plans} />
            </Chapter>

            <Chapter step={3}>
              <h2 className="tg-h2">As much as you <span className="c-accent">need.</span></h2>
              {sizes.length > 0 ? (
                <Rows rows={sizes.map((m) => ({ key: m.publicId, title: m.name, note: m.components.length > 0 ? m.components.join(" + ") : `${m.kcalMin} to ${m.kcalMax} kcal` }))} />
              ) : (
                <p className="tg-lede">Pick a meal size with its calories, protein, carbs and fat shown before you choose.</p>
              )}
            </Chapter>

            <Chapter step={4}>
              <h2 className="tg-h2">A little <span className="c-accent">extra</span> on the side.</h2>
              {addons.length > 0 ? (
                <Rows rows={addons.map((a) => ({ key: a.key, title: a.name, note: a.portion ?? null }))} />
              ) : (
                <p className="tg-lede">Raita and salad come through the week&apos;s menu, next to the tiffin.</p>
              )}
            </Chapter>

            <Chapter step={5}>
              <h2 className="tg-h2">On the days you <span className="c-accent">choose.</span></h2>
              <FrequencyPicker frequencies={catalog.frequencies.map(({ publicId, name, daysPerWeek, weekdays }) => ({ publicId, name, daysPerWeek, weekdays }))} />
            </Chapter>

            <Chapter step={6}>
              <h2 className="tg-h2">For as long as you <span className="c-accent">like.</span></h2>
              <p className="tg-lede">
                {weeks ? `Plans run ${weeks}.` : "Choose how many weeks your plan runs."}
                {durationOff > 0 ? ` Longer plans take up to ${durationOff}% off every tiffin.` : ""}
              </p>
              {lengths.length > 0 ? <WeeksPicker lengths={lengths} initial={firstWeeks} /> : null}
              <div><Link prefetch={false} href="/subscribe" className="tg-cta">Build my tiffin</Link></div>
            </Chapter>
          </div>
        </section>

        {(board.days.length > 0 || board.weekend) && pub ? (
          <section id="menu" className="tg-section scroll-mt-16" aria-labelledby="tg-menu">
            <div className="tg-wrap">
              <div className="tg-deliver__head">
                <h2 id="tg-menu" className="tg-h2">On the menu this <span className="c-accent">week.</span></h2>
                <p className="tg-lede">{weekRange(pub.weekStart)}. Subscribers pick from this list for each day.</p>
              </div>
              <WeekBoard days={board.days} rows={board.rows} weekend={board.weekend} />
              <p className="mt-8"><Link href="/menu/weekly" className="tg-link tg-link--tap">The menu page, with the PDF</Link></p>
            </div>
          </section>
        ) : null}

        <section className="tg-section" aria-labelledby="tg-deliver">
          <DeliverySection />
        </section>

        <section className="tg-section" aria-labelledby="tg-bend">
          <div className="tg-wrap tg-bend">
            <div>
              <h2 id="tg-bend" className="tg-h2">A week that bends, not <span className="c-accent">breaks.</span></h2>
              <p className="tg-lede">
                Away on Wednesday? Hold it{cutoff ? ` before ${cutoff} the day before` : " before the cutoff the day before"}. A held day is not lost: it is added after your last delivery, on your usual weekdays.
              </p>
            </div>
            <div className="tg-card tg-bend__card"><WeekBend /></div>
          </div>
        </section>

        <section className="tg-section" aria-labelledby="tg-sum">
          <div className="tg-wrap flex flex-col gap-8">
            <div>
              <h2 id="tg-sum" className="tg-h2">No packages. Just <span className="c-accent">math.</span></h2>
            </div>
            <p className="tg-sum">
              <span className="tg-sum__term">per-tiffin rate</span><span className="tg-sum__op">×</span>
              <span className="tg-sum__term">days a week</span><span className="tg-sum__op">×</span>
              <span className="tg-sum__term">weeks</span><span className="tg-sum__op">=</span>
              <span className="tg-sum__term tg-sum__total">your total</span>
            </p>
            <p className="tg-lede">The rate drops as your plan grows{durationOff > 0 ? `, and longer plans take up to ${durationOff}% off` : ""}. You see the total before you pay.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link prefetch={false} href="/subscribe" className="tg-cta">See my price</Link>
              <Link href="/pricing" className="tg-btn">The pricing table</Link>
            </div>
          </div>
        </section>

        {/* External Places fetch: a cache miss must not hold back the rest of the page. */}
        <Suspense fallback={null}>
          <LandingReviews />
        </Suspense>

        <section className="tg-section" aria-labelledby="tg-faq">
          <div className="tg-wrap">
            <div className="tg-deliver__head">
              <h2 id="tg-faq" className="tg-h2">Before you <span className="c-accent">order.</span></h2>
              <p className="tg-lede"><Link href="/faq" className="tg-link tg-link--tap">Every question we get</Link></p>
            </div>
            <div className="tg-card tg-faq">
              {FAQS.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      <LandingMotion />
    </>
  );
}
