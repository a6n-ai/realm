import type { Metadata } from "next";
import { ReferContent, referHeadline, type ReferExtras } from "@/components/landing/refer/refer-content";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { lowestRate, shortMoney } from "@/lib/landing/live-figures";
import { pageMeta } from "@/lib/landing/meta";
import { loadLandingPromos } from "@/lib/landing/promos";
import { buildWeekBoard } from "@/lib/landing/week-board";
import { loadReferralOffer } from "@/lib/referrals/offer";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";
import { siteOrgId } from "@/lib/tenant/site-org";
import "@/components/landing/styles/refer.css";

// Reward settings change rarely; five minutes keeps the figures close to live without a DB read per view.
export const revalidate = 300;
export const dynamic = "error";

export async function generateMetadata(): Promise<Metadata> {
  const offer = await loadReferralOffer();
  const description = offer.on ? `${referHeadline(offer)} Share your TiffinGrab link; when a friend pays for their first plan, you both get coins.` : "TiffinGrab referrals are paused right now.";
  const title = offer.on ? `Refer a Friend: ${referHeadline(offer).replace(/\.$/, "")} | Tiffin Grab` : "Refer a Friend | Tiffin Grab";
  return pageMeta(title, description, "/refer");
}

/** The food proof a stranger needs: this week's dishes, the real "from" rate and the running promotion. Each part fails soft. */
async function loadExtras(organizationId: string | null): Promise<ReferExtras> {
  const [pub, settings, catalog, promos] = await Promise.all([    menuService.getPublishedWeek(undefined, organizationId).catch(() => null),
    getAppSettings(),
    loadCatalogSnapshot(organizationId).catch(() => null),
    loadLandingPromos().catch(() => null),
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
  return <ReferContent offer={offer} extras={extras} />;
}
