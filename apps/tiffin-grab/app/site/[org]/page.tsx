import { WEEK_DAYS } from "@/lib/menu/delivery-days";
import { siteOrgId } from "@/lib/tenant/site-org";
import type { Metadata } from "next";
import { Suspense } from "react";
import { preload } from "react-dom";
import { HeroRating, LandingReviews } from "@/components/landing/landing-reviews";
import { FAQS } from "@/components/landing/faqs";
import { DeliverySection } from "@/components/landing/delivery-section";
import { isComingSoon, publicPlans } from "@/lib/landing/plan-options";
import { PromoPopup } from "@/components/landing/promo-popup";
import { PhoneReveal } from "@/components/landing/home/phone-reveal";
import { LazyPauseDemo as PauseDemo } from "@/components/landing/stage/lazy";
import { Bento, Faq, Flex, Hero, MenuRail, OfferBand, ReferBand, Story } from "@/components/landing/home/sections";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { formatDateOnly } from "@/lib/format/datetime";
import { dateTimeFormat } from "@/lib/intl/date-format";
import { foldPicks, popularSince } from "@/lib/menu/customer-week";
import { buildWeekBoard } from "@/lib/landing/week-board";
import { loadLandingPromos } from "@/lib/landing/promos";
import { pageMeta } from "@/lib/landing/meta";
import { deliveryIsFree, hourLabel, lowestRate, trialOffer } from "@/lib/landing/live-figures";
import { getTrialSettings } from "@/lib/services/trial-settings.service";
import { businessJsonLd, jsonLdScript } from "@/lib/landing/business-jsonld";
import { publicOrigin } from "@/lib/routing/apex";
import { getReviewsSummary } from "@foundry/google-reviews";
import { getAppSettings, integrationsConfigReadStore } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";
import { loadReferralOffer } from "@/lib/referrals/offer";
import "@/components/landing/styles/home.css";
// Stock photos of dishes on our menu (Pixabay licence) until the kitchen's own shots arrive.
import homeThali from "@/public/landing/stock/dish-home-thali.jpg";
import paneerPhoto from "@/public/landing/stock/dish-paneer-butter-masala.jpg";
import spreadPhoto from "@/public/landing/stock/dish-spread.jpg";
import { addDaysIso } from "@/lib/dates";

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await loadCatalogSnapshot();
  const free = deliveryIsFree(catalog) ? " free" : "";
  const pause = catalog.cutoffHour != null ? `Pause by ${hourLabel(catalog.cutoffHour)} the night before` : "Pause any day you're away";
  return pageMeta(
    "Home-Style Tiffin Service in Toronto & GTA | Tiffin Grab",
    `Home-style veg and non-veg tiffins, cooked in small batches and delivered${free} across the GTA. Pick your size, days and weeks. ${pause}.`,
    "/",
  );
}
export const revalidate = 300;
export const dynamic = "error";


function weekRange(weekStart: string) {
  return `${formatDateOnly(weekStart, { mode: "short" })} to ${formatDateOnly(addDaysIso(weekStart, 6), { mode: "short" })}`;
}

// Google's rating streams in like the hero line, so the schema waits in Suspense instead of holding the page.
async function BusinessSchema({ catalog, currency }: { catalog: Awaited<ReturnType<typeof loadCatalogSnapshot>>; currency: string }) {
  const s = await getReviewsSummary(integrationsConfigReadStore).catch(() => null);
  const rating = s ? { rating: s.rating, total: s.total, url: s.attributionUrl || undefined } : null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(businessJsonLd(catalog, publicOrigin(), { currency, rating })) }} />;
}

export default async function LandingPage({ params }: { params: Promise<{ org: string }> }) {
  const orgId = await siteOrgId((await params).org);
  // The hero poster is the phone LCP: fetch the right WebP from the head, ahead of CSS and scripts.
  preload("/landing/stock/hero-poster-mobile.webp", { as: "image", type: "image/webp", media: "(max-width: 767px)", fetchPriority: "high" });
  preload("/landing/stock/hero-poster.webp", { as: "image", type: "image/webp", media: "(min-width: 768px)", fetchPriority: "high" });
  const [pub, catalog, { timezone, currency }, promos, referral, trialSettings] = await Promise.all([menuService.getPublishedWeek(), loadCatalogSnapshot(), getAppSettings(), loadLandingPromos(), loadReferralOffer().catch(() => null), getTrialSettings(orgId)]);

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
  // Same figure the Plans page shows as "from", and the one the meta tags quote.
  const fromRate = lowestRate(catalog);
  const cutoff = catalog.cutoffHour != null ? hourLabel(catalog.cutoffHour) : null;
  // The demos say "Changes until Mon 11:00 PM": the real cutoff, never a hard-coded hour.
  const cutoffTime = catalog.cutoffHour != null
    ? dateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(Date.UTC(2026, 0, 1, catalog.cutoffHour)).replace(/\./g, "").toUpperCase()
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
      <Suspense fallback={null}><BusinessSchema catalog={catalog} currency={currency} /></Suspense>
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

      {referral?.on ? <ReferBand offer={referral} /> : null}

      <Bento
        plans={plans.map((p) => ({ key: p.key, name: p.name, description: p.description, soon: isComingSoon(p.key) }))}
        sizes={sizes.map((m) => ({ id: m.publicId, name: m.name.replace(/\s+[—–]\s+/g, " · "), note: m.components.length > 0 ? m.components.join(" + ") : `${m.kcalMin} to ${m.kcalMax} kcal` }))}
        sizePlanKey={firstPlan?.key ?? null}
        fromRate={fromRate}
        trial={trialOffer(catalog, trialSettings)}
        sides={sides.map((a) => ({ key: a.key, name: a.name, note: a.portion ?? null }))}
        frequencies={catalog.frequencies.map((f) => ({ id: f.publicId, name: f.name, days: f.weekdays ?? WEEK_DAYS.slice(0, f.daysPerWeek) }))}
        lengths={lengths}
        cutoff={cutoff}
        photo={homeThali}
      />

      {pub && board.days.length > 0 ? <MenuRail days={board.days} rows={board.rows} weekend={board.weekend} cutoffTime={cutoffTime} range={weekRange(pub.weekStart)} photo={spreadPhoto} /> : null}

      <Flex cutoff={cutoff} demo={<PauseDemo cutoffTime={cutoffTime} />} />

      <section className="lp-section" aria-labelledby="tg-deliver">
        <DeliverySection orgId={orgId} />
      </section>

      {/* External Places fetch: a cache miss must not hold back the rest of the page. */}
      <Suspense fallback={null}>
        <LandingReviews withPhotos />
      </Suspense>

      <Faq items={FAQS} />

      <PhoneReveal />
      {promos.popup ? <PromoPopup promo={promos.popup} fallbackImage={spreadPhoto.src} /> : null}
    </div>
  );
}
