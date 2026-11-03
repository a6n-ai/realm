import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import type { Metadata } from "next";
import { Suspense } from "react";
import { parseIsoDateUtc } from "@foundry/commons";
import { HeroRating, LandingReviews } from "@/components/landing/landing-reviews";
import { FAQS } from "@/components/landing/faqs";
import { DeliverySection } from "@/components/landing/delivery-section";
import { isComingSoon, publicPlans } from "@/components/landing/plan-options";
import { PromoPopup } from "@/components/landing/promo-popup";
import { LazyPauseDemo as PauseDemo } from "@/components/landing/stage/lazy";
import { Bento, Faq, Flex, Hero, MenuRail, OfferBand, Story } from "@/components/landing/home/sections";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { effectivePrice } from "@/lib/pricing";
import { formatDateOnly } from "@/lib/format/datetime";
import { foldPicks, popularSince } from "@/lib/menu/customer-week";
import { buildWeekBoard } from "@/lib/landing/week-board";
import { loadLandingPromos } from "@/lib/landing/promos";
import { pageMeta } from "@/lib/landing/meta";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";
import "@/components/landing/home/home.css";
import "@/components/landing/home/motion.css";
// Stock photos of dishes on our menu (Pixabay licence) until the kitchen's own shots arrive.
import homeThali from "@/public/landing/stock/dish-home-thali.jpg";
import paneerPhoto from "@/public/landing/stock/dish-paneer-butter-masala.jpg";
import spreadPhoto from "@/public/landing/stock/dish-spread.jpg";

export const metadata: Metadata = pageMeta("Tiffin Grab: home-style Indian tiffins delivered across the GTA", "Home-style Indian tiffin meals delivered across the Greater Toronto Area. Choose the diet, the size, the sides, the days and how many weeks.", "/");

// Rendered per request: the image build has no database to prerender against.
export const dynamic = "force-dynamic";

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const hourLabel = (h: number) =>
  new Intl.DateTimeFormat("en-CA", { hour: "numeric", timeZone: "UTC" }).format(Date.UTC(2026, 0, 1, h)).replace(/\./g, "").toUpperCase();

function weekRange(weekStart: string) {
  const end = parseIsoDateUtc(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${formatDateOnly(weekStart, { mode: "short" })} to ${formatDateOnly(end.toISOString().slice(0, 10), { mode: "short" })}`;
}

export default async function LandingPage() {
  const [pub, catalog, { timezone }, promos] = await Promise.all([menuService.getPublishedWeek(), loadCatalogSnapshot(), getAppSettings(), loadLandingPromos()]);

  const plans = publicPlans(catalog.plans);
  const firstPlan = plans.find((p) => !isComingSoon(p.key));
  const sizes = listableMealSizes(catalog.mealSizes).filter((m) => m.planKey === firstPlan?.key).slice(0, 4);
  const sides = [...new Map(Object.values(catalog.addonsByCategory ?? {}).flat().map((a) => [a.name, a])).values()].slice(0, 6);
  const lengths = [...new Map(catalog.durations.map((d) => [d.weeks, d])).values()]
    .sort((a, b) => a.weeks - b.weeks)
    .map((d) => ({
      weeks: d.weeks,
      off: Math.max(0, ...(catalog.discounts ?? [])
        .filter((x) => x.kind === "duration" && (x.targetPublicId === d.publicId || (x.targetPublicId == null && (x.minWeeks ?? 0) <= d.weeks)))
        .map((x) => x.percent)),
    }));
  // Lowest live per-tiffin rate across orderable plans, the same figure the Plans page shows as "from".
  const rates = listableMealSizes(catalog.mealSizes).filter((m) => plans.some((p) => p.key === m.planKey && !isComingSoon(p.key))).map((m) => effectivePrice(m.basePrice, m));
  const fromRate = rates.length ? Math.min(...rates) : null;
  const cutoff = catalog.cutoffHour != null ? hourLabel(catalog.cutoffHour) : null;
  // The demos say "Changes until Mon 11:00 PM": the real cutoff, never a hard-coded hour.
  const cutoffTime = catalog.cutoffHour != null
    ? new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(Date.UTC(2026, 0, 1, catalog.cutoffHour)).replace(/\./g, "").toUpperCase()
    : null;
  const board = pub ? buildWeekBoard(pub, timezone, await menuService.dishPickCounts(popularSince(pub.weekStart)).then(foldPicks)) : { days: [], rows: [], weekend: null };
  const todayDay = board.days.find((d) => d.today) ?? board.days[0] ?? null;
  // Rows with 2+ dishes are the day's choices; single-dish rows come with every tiffin.
  const todayRows = todayDay ? board.rows.filter((r) => (todayDay.dishes[r] ?? []).length > 0).map((r) => ({ row: r, dishes: todayDay.dishes[r]! })) : [];
  const today = todayDay && todayRows.length > 0
    ? { day: todayDay.label, isToday: todayDay.today, choices: todayRows.filter((x) => x.dishes.length > 1), fixed: todayRows.filter((x) => x.dishes.length === 1).map((x) => x.dishes[0]!) }
    : null;

  return (
    <div className="lp">
      <Hero
        video="/landing/stock/hero.mp4"
        poster="/landing/stock/hero-poster.jpg"
        offer={promos.sticker}
        today={today}
        ctaHref={promos.sticker?.href ?? "/subscribe"}
        hasMenu={board.days.length > 0}
        // The Google line streams in above the headline; hold its 44px row so the hero does not jump (CLS).
        rating={<Suspense fallback={<div aria-hidden className="min-h-11" />}><HeroRating /></Suspense>}
      />

      <Story />

      {promos.sections.length > 0 ? <OfferBand promos={promos.sections} photo={paneerPhoto} /> : null}

      <Bento
        plans={plans.map((p) => ({ key: p.key, name: p.name, description: p.description, soon: isComingSoon(p.key) }))}
        sizes={sizes.map((m) => ({ id: m.publicId, name: m.name.replace(/\s+[—–]\s+/g, " · "), note: m.components.length > 0 ? m.components.join(" + ") : `${m.kcalMin} to ${m.kcalMax} kcal` }))}
        sizePlanKey={firstPlan?.key ?? null}
        fromRate={fromRate}
        sides={sides.map((a) => ({ key: a.key, name: a.name, note: a.portion ?? null }))}
        frequencies={catalog.frequencies.map((f) => ({ id: f.publicId, name: f.name, days: f.weekdays ?? WEEK.slice(0, f.daysPerWeek) }))}
        lengths={lengths}
        cutoff={cutoff}
        photo={homeThali}
      />

      {pub && board.days.length > 0 ? <MenuRail days={board.days} rows={board.rows} weekend={board.weekend} cutoffTime={cutoffTime} range={weekRange(pub.weekStart)} photo={spreadPhoto} /> : null}

      <Flex cutoff={cutoff} demo={<PauseDemo cutoffTime={cutoffTime} />} />

      <section className="lp-section" aria-labelledby="tg-deliver">
        <DeliverySection orgId={await resolveRequestOrg()} />
      </section>

      {/* External Places fetch: a cache miss must not hold back the rest of the page. */}
      <Suspense fallback={null}>
        <LandingReviews withPhotos />
      </Suspense>

      <Faq items={FAQS} />

      {promos.popup ? <PromoPopup promo={promos.popup} fallbackImage={spreadPhoto.src} /> : null}
    </div>
  );
}
