import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "@/components/landing/styles/menu.css";
// The kitchen's own studio shots.
import thaliPhoto from "@/public/landing/meals/5-items-thali.jpg";
import { ArrowRight, Download } from "lucide-react";
import { BuildTiffinLink } from "@/components/landing/build-tiffin-link";
import { DayTiffin } from "@/components/landing/menu/day-tiffin";
import { PageIntro } from "@/components/landing/public-shell";
import { WeekBoard } from "@/components/landing/week-board";
import { MetaViewContent } from "@/components/meta/meta-view-content";
import { foldPicks, popularSince } from "@/lib/menu/customer-week";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { lowestRate } from "@/lib/landing/live-figures";
import { buildWeekBoard, dateOf } from "@/lib/landing/week-board";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";
import { siteOrgId } from "@/lib/tenant/site-org";
import { pageMeta } from "@/lib/landing/meta";
import { breadcrumbJsonLd, jsonLdScript, menuJsonLd } from "@/lib/landing/business-jsonld";
import { publicOrigin } from "@/lib/routing/apex";

export const metadata: Metadata = pageMeta("This Week's Tiffin Menu: Dal, Sabzi, Roti | Tiffin Grab", "See this week's home-style tiffin menu day by day: sabzi, dal, rice, roti, raita and salad, plus the weekend dish. Subscribers pick their sabzi in the app.", "/menu");
export const revalidate = 300;
export const dynamic = "error";

export default async function MenuPage({ params }: { params: Promise<{ org: string }> }) {
  const organizationId = await siteOrgId((await params).org);
  const [pub, { timezone }, catalog] = await Promise.all([menuService.getPublishedWeek(undefined, organizationId), getAppSettings(), loadCatalogSnapshot(organizationId)]);
  const fromRate = lowestRate(catalog);
  const { days, rows, weekend } = pub ? buildWeekBoard(pub, timezone, await menuService.dishPickCounts(popularSince(pub.weekStart)).then(foldPicks)) : { days: [], rows: [], weekend: null };

  const tiffinDays = days.map((d) => ({ key: d.key, label: d.label, short: d.short, date: d.date, today: d.today, popular: d.popular ?? [], tiers: rows.filter((r) => (d.dishes[r]?.length ?? 0) > 0).map((r) => ({ row: r, dishes: d.dishes[r]! })) }));

  const dishNames = [
    ...new Set([
      ...days.flatMap((d) => Object.values(d.dishes).flat()),
      ...(weekend?.dishes ?? []),
    ]),
  ];

  const origin = publicOrigin();
  const schemas = [breadcrumbJsonLd(origin, "Menu", "/menu"), pub ? menuJsonLd(days, origin) : null];

  return (
    <div className="lp-wrap lp-section">
      {schemas.map((d, i) => d && <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(d) }} />)}
      <MetaViewContent contentIds={dishNames.length ? dishNames : ["weekly-menu"]} contentName="Weekly menu" />
      <PageIntro
        eyebrow={pub ? `${dateOf(pub.weekStart, 0)} to ${dateOf(pub.weekStart, 6)}` : "This week"}
        title={<>What we’re cooking this <span className="c-accent">week.</span></>}
        lede="Subscribers pick their dishes each week from this list."
      >
        <div className="lp-actions lp-actions--start">
          <BuildTiffinLink className="lp-cta">Build my tiffin</BuildTiffinLink>
          <Link href="/pricing" className="lp-textlink">Sizes and rates<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link>
        </div>
      </PageIntro>
      {days.length > 0 || weekend ? (
        <>
          <div className="mn-main">
          {days.length > 0 ? <DayTiffin days={tiffinDays} /> : null}
          <section className="mn-close" aria-label="Start a plan">
            <figure className="mn-card">
              <Image src={thaliPhoto} alt="The 5 Item Thali: rice, rotis, two curries and dal in steel bowls on a wooden board" placeholder="blur" sizes="(max-width: 1023px) 100vw, 480px" />
              <div className="mn-card__band">
                {fromRate != null ? <p className="lp-from lp-from--lg"><span>From</span><strong>${fromRate.toFixed(2)}</strong><span>a tiffin</span></p> : <p className="lp-from lp-from--lg"><strong>Your tiffin, your way.</strong></p>}
                <BuildTiffinLink className="lp-cta">Build my tiffin</BuildTiffinLink>
              </div>
            </figure>
          </section>
          </div>
          <details className="mn-week">
            <summary>See the whole week</summary>
            <a href="/menu/weekly/pdf" className="lp-textlink mn-week__pdf">Download PDF<Download aria-hidden className="size-4" strokeWidth={2} /></a>
            <WeekBoard days={days} rows={rows} weekend={weekend} />
          </details>
        </>
      ) : (
        <p className="lp-lede">The next menu is on its way. Check back shortly.</p>
      )}
    </div>
  );
}
