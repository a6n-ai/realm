import { BRAND_NAME } from "@/lib/brand";
import { BreadcrumbSchema } from "@/components/landing/breadcrumb-schema";
import type { Metadata } from "next";
import { ReferContent } from "@/components/landing/refer/refer-content";
import type { ReferExtras } from "@/components/landing/refer/refer-types";
import { referHeadline } from "@/lib/referrals/headline";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { lowestRate, shortMoney } from "@/lib/landing/live-figures";
import { pageMeta } from "@/lib/landing/meta";
import { loadLandingPromos } from "@/lib/landing/promos";
import { buildWeekBoard } from "@/lib/landing/week-board";
import { loadReferralOffer } from "@/lib/referrals/offer";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/menu/menu.service";
import { siteOrgId } from "@/lib/tenant/site-org";
import "@/components/landing/styles/refer.css";

// Reward settings change rarely; five minutes keeps the figures close to live without a DB read per view.
export const revalidate = 300;
export const dynamic = "error";

export async function generateMetadata(): Promise<Metadata> {
  const offer = await loadReferralOffer();
  const description = offer.on ? `${referHeadline(offer)} Share your ${BRAND_NAME} link; when a friend pays for their first plan, you both get coins.` : "TiffinGrab referrals are paused right now.";
  const title = offer.on ? `Refer a Friend: ${referHeadline(offer).replace(/\.$/, "")} | ${BRAND_NAME}` : `Refer a Friend | ${BRAND_NAME}`;
  return pageMeta(title, description, "/refer");
}

/** The food proof a stranger needs: this week's dishes, the real "from" rate and the running promotion. Each part fails soft. */
async function loadExtras(organizationId: string | null): Promise<ReferExtras> {
  const [pub, settings, catalog, promos] = await Promise.all([    menuService.getPublishedWeek(undefined, organizationId).catch(() => null),
    getAppSettings(),
    loadCatalogSnapshot(organizationId).catch(() => null),
    loadLandingPromos(),
  ]);
  const rate = catalog ? lowestRate(catalog) : null;
  const days = pub ? buildWeekBoard(pub, settings.timezone).days : [];
  const day = days.find((d) => d.today) ?? days[0] ?? null;
  const sticker = promos?.sticker;
  return {
    fromRate: rate == null ? null : shortMoney(rate, settings.currency),
    day: day ? { label: day.label, today: day.today, tiers: Object.entries(day.dishes).map(([row, dishes]) => ({ row, dishes })) } : null,
    // A coupon sticker's title is already couponHeadline + code; a staff promotion pairs its badge with its code.
    promo: sticker?.code ? (sticker.id.startsWith("coupon:") ? sticker.title : `${sticker.badge ?? sticker.title} with ${sticker.code}`) : null,
  };
}

export default async function ReferPage({ params }: { params: Promise<{ org: string }> }) {
  const organizationId = await siteOrgId((await params).org);
  const [offer, extras] = await Promise.all([loadReferralOffer(), loadExtras(organizationId)]);
  return (
    <>
      <BreadcrumbSchema name="Refer a friend" path="/refer" />
      <ReferContent offer={offer} extras={extras} />
    </>
  );
}
