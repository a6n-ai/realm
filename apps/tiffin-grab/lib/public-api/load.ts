import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { loadFaqGroups } from "@/lib/landing/faq-data";
import { loadLandingPromos } from "@/lib/landing/promos";
import { loadSiteFacts } from "@/lib/landing/site-facts";
import { buildWeekBoard } from "@/lib/landing/week-board";
import { foldPicks, popularSince } from "@/lib/menu/customer-week";
import { loadReferralOffer } from "@/lib/referrals/offer";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";
import { contactBody, deliveryBody, faqBody, menuBody, plansBody, promotionsBody, referralBody } from "@/lib/public-api/data";
import { deliveryCheck } from "@/lib/public-api/postal";
import { publicOrigin } from "@/lib/routing/apex";

// Each public answer, loaded and shaped once: the v1 routes and the MCP tools both call these.
export const loadPublic = {
  plans: async () => plansBody(await loadSiteFacts(), publicOrigin()),
  delivery: async () => {
    const [facts, catalog] = await Promise.all([loadSiteFacts(), loadCatalogSnapshot()]);
    return deliveryBody(facts, catalog, publicOrigin());
  },
  /** `postal` already normalized (normalizePostal). */
  check: async (postal: string) => deliveryCheck((await loadCatalogSnapshot()).zones, postal),
  promotions: async () => promotionsBody(await loadLandingPromos(), publicOrigin()),
  // The brand's published week, as /menu shows it.
  menu: async () => {
    const [pub, { timezone }] = await Promise.all([menuService.getPublishedWeek(undefined, null), getAppSettings()]);
    const board = pub ? buildWeekBoard(pub, timezone, await menuService.dishPickCounts(popularSince(pub.weekStart)).then(foldPicks)) : { days: [], rows: [], weekend: null };
    return menuBody(pub?.weekStart ?? null, board, publicOrigin());
  },
  referral: async () => referralBody(await loadReferralOffer(), publicOrigin()),
  faq: async () => faqBody(await loadFaqGroups(null), publicOrigin()),
  contact: async () => contactBody(publicOrigin()),
};
