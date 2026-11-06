import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { postalArea } from "@foundry/delivery/fsa";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import { DeliveryCheck } from "@/components/landing/delivery-check";
import { FaqAccordion, type FaqItem } from "@/components/landing/faq-accordion";
import { AreaReviews, HeroRating } from "@/components/landing/landing-reviews";
import { isComingSoon, publicPlans } from "@/components/landing/plan-options";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes, type CatalogSnapshot } from "@/lib/catalog/types";
import { zonePickCounts } from "@/lib/landing/area-picks";
import { areaSlug, areaZones, neighbours, parseWindow, sharedPrefixes, type Window } from "@/lib/landing/areas";
import { jsonLdScript } from "@/lib/landing/business-jsonld";
import { biggestDurationOff, deliveryIsFree, hourLabel, shortMoney, trialLength, trialOffer } from "@/lib/landing/live-figures";
import { pageMeta } from "@/lib/landing/meta";
import { publicPagesCache } from "@/lib/landing/public-cache";
import { foldPicks, popularSince, popularThisWeek } from "@/lib/menu/customer-week";
import { effectivePrice } from "@/lib/pricing";
import { publicOrigin } from "@/lib/routing/apex";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { deliveryService } from "@/lib/services/delivery.service";
import { menuService } from "@/lib/services/menu.service";
import { getTrialSettings } from "@/lib/services/trial-settings.service";
import { siteOrgId } from "@/lib/tenant/site-org";
import "@/components/landing/styles/area.css";

// Zones change rarely and picks weekly; an hour keeps both close to live (edge cache sits in front).
export const revalidate = 3600;
export const dynamic = "error";

type Params = { params: Promise<{ org: string; area: string }> };
type Zone = CatalogSnapshot["zones"][number];

async function zoneFor(slug: string, orgId: string | null) {
  const catalog = await loadCatalogSnapshot(orgId);
  const zone = areaZones(catalog.zones).find((z) => areaSlug(z.name) === slug);
  return { catalog, zone };
}

const listCodes = (codes: string[], n: number) =>
  codes.length <= n ? codes.join(", ") : `${codes.slice(0, n).join(", ")} and ${codes.length - n} more`;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { org, area } = await params;
  const { catalog, zone } = await zoneFor(area, await siteOrgId(org));
  if (!zone) return {};
  const win = parseWindow(zone.slotWindow);
  const when = win ? ` between ${win.from} and ${win.to}` : "";
  const pause = catalog.cutoffHour != null ? ` Pause by ${hourLabel(catalog.cutoffHour)} the night before.` : "";
  return pageMeta(
    `Home-Style Tiffin Service in ${zone.name} | Tiffin Grab`,
    `Home-style veg and non-veg tiffins delivered in ${zone.name}${when}. Covers ${listCodes(zone.postalPrefixes, 3)}.${pause}`,
    `/locations/${area}`,
  );
}

export default async function AreaPage({ params }: Params) {
  const { org, area } = await params;
  const orgId = await siteOrgId(org);
  const { catalog, zone } = await zoneFor(area, orgId);
  if (!zone) notFound();

  const [pub, { currency }, trialSettings, origin] = await Promise.all([
    menuService.getPublishedWeek(undefined, orgId),
    getAppSettings(),
    getTrialSettings(orgId),
    publicPagesCache.getOrSet(`origin:${orgId ?? "brand"}`, () => deliveryService.getStoreOrigin(orgId)).catch(() => null),
  ]);
  const near = neighbours(zone, catalog.zones);
  const picked: string[] = pub ? await zonePickCounts(zone.id, popularSince(pub.weekStart)).then((c) => [...popularThisWeek(pub.items, foldPicks(c))]).catch(() => []) : [];

  const name = zone.name;
  const win = parseWindow(zone.slotWindow);
  const cutoff = catalog.cutoffHour != null ? hourLabel(catalog.cutoffHour) : null;
  const free = deliveryIsFree(catalog);
  const shared = sharedPrefixes(zone, catalog.zones);
  const trial = trialOffer(catalog, trialSettings);
  const off = biggestDurationOff(catalog);
  const rates = dietRates(catalog);
  const site = publicOrigin();
  const url = `${site}/locations/${area}`;

  const faqs: FaqItem[] = [
    { q: `Do you deliver to my postal code in ${name}?`, a: `Yes, if it starts with ${listCodes(zone.postalPrefixes, 8)}. Type your full postal code above and we show your delivery window.` },
    ...(win ? [{ q: `What time does my tiffin arrive in ${name}?`, a: `Between ${win.from} and ${win.to}, on the days in your plan.` }] : []),
    ...(cutoff ? [{ q: "Can I pause or change a day?", a: `Yes. Change, pause or move any day until ${cutoff} the night before. A paused day is never lost: move it, or it goes to the end of your plan.` }] : []),
    ...(free ? [{ q: `Is delivery free in ${name}?`, a: "Yes. Every tiffin comes to your door at no charge." }] : []),
  ];

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${url}#service`,
        name: `Tiffin delivery in ${name}`,
        serviceType: "Home-style meal delivery",
        url,
        provider: { "@id": `${site}/#business` },
        areaServed: [{ "@type": "Place", name: `${name}, Ontario` }, ...zone.postalPrefixes.map((p) => ({ "@type": "PostalCodeRangeSpecification", postalCodeBegin: p, postalCodeEnd: p, addressCountry: "CA" }))],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Delivery areas", item: `${site}/locations` },
          { "@type": "ListItem", position: 2, name, item: url },
        ],
      },
      { "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };

  return (
    <div className="lp-wrap lp-section lp-area">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(schema) }} />

      <nav aria-label="Breadcrumb" className="lp-crumbs">
        <Link href="/locations">Delivery areas</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{name}</span>
      </nav>

      <header className="lp-area__hero">
        <h1 className="lp-display">Home&#8209;style tiffins in <span className="c-accent">{name}.</span></h1>
        <p className="lp-lede">
          {win ? `Delivered ${win.from} to ${win.to} across ${name}` : `Delivered across ${name} on the days you choose`}
          {free ? ", at no charge." : "."}
          {cutoff ? ` Change or pause by ${cutoff} the night before.` : ""}
        </p>
        <div className="lp-actions lp-actions--start">
          <BuildTiffinLink className="lp-cta">Build my {name} tiffin</BuildTiffinLink>
          <a href="#check" className="lp-textlink">Check my postal code<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></a>
        </div>
        <Suspense fallback={<div aria-hidden className="min-h-11" />}><HeroRating /></Suspense>
      </header>

      {win ? <DayRibbon name={name} win={win} cutoffHour={catalog.cutoffHour ?? null} cutoff={cutoff} /> : null}

      <section id="check" className="lp-area__block" aria-labelledby="lp-area-check">
        <h2 id="lp-area-check" className="lp-h2">Check your <span className="c-accent">postal code.</span></h2>
        <DeliveryCheck
          origin={origin ? { lat: origin.lat, lng: origin.lng } : null}
          rings={[]}
          areas={[zone, ...near].map((z) => ({ name: z.name, slotWindow: z.slotWindow, point: z.lat != null && z.lng != null ? { lat: z.lat, lng: z.lng } : null }))}
        />
      </section>

      <section className="lp-area__block" aria-labelledby="lp-area-codes">
        <div className="lp-area__head">
          <h2 id="lp-area-codes" className="lp-h2">Postal codes we <span className="c-accent">cover.</span></h2>
          <p className="lp-lede">If yours starts with one of these, we deliver to you in {name}.</p>
        </div>
        <ul className="lp-codes">
          {zone.postalPrefixes.map((p) => {
            const place = postalArea(p);
            const also = shared.get(p);
            return (
              <li key={p}>
                <strong className="tabular-nums">{p}</strong>
                {place ? <span>{place.neighbourhoods ?? place.name}</span> : null}
                {also ? <small>{alsoNote(also)}</small> : null}
              </li>
            );
          })}
        </ul>
      </section>

      {picked.length > 0 ? (
        <section className="lp-area__block" aria-labelledby="lp-area-picks">
          <div className="lp-area__head">
            <h2 id="lp-area-picks" className="lp-h2">Picked most in <span className="c-accent">{name}.</span></h2>
            <p className="lp-lede">The dishes {name} subscribers chose most from this week&apos;s menu.</p>
          </div>
          <ul className="lp-dishes">{picked.map((d) => <li key={d}>{d}</li>)}</ul>
          <div className="lp-actions lp-actions--start">
            <Link href="/menu" className="lp-textlink">See this week&apos;s menu<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
          </div>
        </section>
      ) : null}

      <Reveal lines={[`Cooked the morning it reaches ${name}.`, "Paused the night you tell us."]} />

      {rates.length > 0 ? (
        <section className="lp-area__block" aria-labelledby="lp-area-cost">
          <div className="lp-area__head">
            <h2 id="lp-area-cost" className="lp-h2">What a tiffin <span className="c-accent">costs.</span></h2>
            <p className="lp-lede">One rate per tiffin, times your days and weeks.{off != null ? ` Longer plans take up to ${off}% off.` : ""}</p>
          </div>
          <ul className="lp-rates-short">
            {rates.map((r) => (
              <li key={r.key}><span>{r.name}</span><strong className="tabular-nums">from {shortMoney(r.rate, currency)}</strong></li>
            ))}
          </ul>
          <div className="lp-actions lp-actions--start">
            <Link href="/pricing" className="lp-textlink">Every size and rate<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
            {trial ? <Link prefetch={false} href={trial.href} className="lp-textlink">Try {trialLength(trial)} first<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link> : null}
          </div>
        </section>
      ) : null}

      {/* External Places fetch: a cache miss must not hold back the page. */}
      <Suspense fallback={null}><AreaReviews area={name} /></Suspense>

      <section className="lp-area__block" aria-labelledby="lp-area-faq">
        <h2 id="lp-area-faq" className="lp-h2">Before you <span className="c-accent">order.</span></h2>
        <FaqAccordion items={faqs} name="area-faq" />
      </section>

      {near.length > 0 ? (
        <nav className="lp-area__block" aria-labelledby="lp-area-near">
          <h2 id="lp-area-near" className="lp-h2">Nearby <span className="c-accent">areas.</span></h2>
          <ul className="lp-near">
            {near.map((z) => {
              const w = parseWindow(z.slotWindow);
              return (
                <li key={z.name}>
                  <Link href={`/locations/${areaSlug(z.name)}`}>
                    <strong>{z.name}</strong>
                    {w ? <span>{w.from} to {w.to}</span> : null}
                    <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

function alsoNote(others: Zone[]) {
  const runs = others.map((o) => {
    const w = parseWindow(o.slotWindow);
    return w ? `${o.name} (${w.from} to ${w.to})` : o.name;
  });
  return `Also on the ${runs.join(" and ")} run. Your full postal code decides which.`;
}

/** Lowest regular (non-trial) rate per orderable diet. */
function dietRates(catalog: CatalogSnapshot) {
  const sizes = listableMealSizes(catalog.mealSizes).filter((m) => !m.trial);
  return publicPlans(catalog.plans)
    .filter((p) => !isComingSoon(p.key))
    .flatMap((p) => {
      const r = sizes.filter((m) => m.planKey === p.key).map((m) => effectivePrice(m.basePrice, m));
      return r.length ? [{ key: p.key, name: p.name, rate: Math.min(...r) }] : [];
    });
}

/** The signature: one area's tiffin day on a single line, from the change cutoff the night before
 *  to the delivery window. Built from live settings, so each area draws a different day. */
function DayRibbon({ name, win, cutoffHour, cutoff }: { name: string; win: Window; cutoffHour: number | null; cutoff: string | null }) {
  // Hours counted from midnight the day before delivery: the cutoff falls on day one, the window on day two.
  const start = (cutoffHour ?? 20) - 1;
  const end = 24 + win.toHour + 1;
  const at = (h: number) => `${(((h - start) / (end - start)) * 100).toFixed(2)}%`;
  const morning = 24 + Math.max(5, win.fromHour - 3);
  const style = { "--cut": at(cutoffHour ?? start + 1), "--cook": at(morning), "--from": at(24 + win.fromHour), "--to": at(24 + win.toHour) } as CSSProperties;
  return (
    <section className="lp-area__block lp-ribbon" aria-labelledby="lp-area-day" style={style}>
      <h2 id="lp-area-day" className="lp-h2">A {name} tiffin <span className="c-accent">day.</span></h2>
      <div className="lp-ribbon__track" aria-hidden>
        <span className="lp-ribbon__line" />
        <span className="lp-ribbon__night" />
        {cutoff ? <span className="lp-ribbon__dot lp-ribbon__dot--cut" /> : null}
        <span className="lp-ribbon__dot lp-ribbon__dot--cook" />
        <span className="lp-ribbon__band" />
        {cutoff ? <span className="lp-ribbon__tick" style={{ left: "var(--cut)" }}>{cutoff}</span> : null}
        <span className="lp-ribbon__tick lp-ribbon__tick--win" style={{ left: "var(--from)" }}>{win.from}</span>
        <span className="lp-ribbon__tick lp-ribbon__tick--win" style={{ left: "var(--to)" }}>{win.to}</span>
      </div>
      <ol className="lp-ribbon__steps">
        {cutoff ? <li><strong>By {cutoff}, the night before</strong><span>Change, pause or pick your sabzi in the app.</span></li> : null}
        <li><strong>That morning</strong><span>Dal, sabzi and rotis cooked in small batches, then packed.</span></li>
        <li className="lp-ribbon__step--win"><strong>{win.from} to {win.to}</strong><span>At your door in {name}.</span></li>
      </ol>
    </section>
  );
}

/** Two-line statement whose words brighten in reading order as it scrolls in (CSS scroll timeline;
 *  browsers without one, and reduced motion, show it at full colour). */
function Reveal({ lines }: { lines: string[] }) {
  let i = 0;
  return (
    <p className="lp-h2 lp-reveal">
      {lines.map((line, l) => (
        <span key={l} className="lp-reveal__line">
          {line.split(" ").map((w, k) => <span key={k} className="lp-reveal__word" style={{ "--i": i++ } as CSSProperties}>{w} </span>)}
        </span>
      ))}
    </p>
  );
}
