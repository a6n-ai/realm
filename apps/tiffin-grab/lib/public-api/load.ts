import { sharedCache } from "@/lib/cache";
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

// Answers shared through Workers KV (L1 in-process, then KV) for 60 s, the edge cache's TTL: MCP tool calls are POSTs,
// which the edge cache never stores, so without this every call ran its queries. Bodies are plain JSON.
const apiCache = sharedCache("public-api", 60_000, 0, 60_000);
const cached = <T>(key: string, load: () => Promise<T>) => () => apiCache.getOrSet(key, load);

// Each public answer, loaded and shaped once: the v1 routes and the MCP tools both call these.
// check() is not memoized per postal code: it reads the catalog snapshot, which loadCatalogSnapshot already caches in KV.
export const loadPublic = {
  plans: cached("plans", async () => plansBody(await loadSiteFacts(), publicOrigin())),
  delivery: cached("delivery", async () => {
    const [facts, catalog] = await Promise.all([loadSiteFacts(), loadCatalogSnapshot()]);
    return deliveryBody(facts, catalog, publicOrigin());
  }),
  /** `postal` already normalized (normalizePostal). */
  check: async (postal: string) => deliveryCheck((await loadCatalogSnapshot()).zones, postal),
  promotions: cached("promotions", async () => promotionsBody(await loadLandingPromos(), publicOrigin())),
  // The brand's published week, as /menu shows it.
  menu: cached("menu", async () => {
    const [pub, { timezone }] = await Promise.all([menuService.getPublishedWeek(undefined, null), getAppSettings()]);
    const board = pub ? buildWeekBoard(pub, timezone, await menuService.dishPickCounts(popularSince(pub.weekStart)).then(foldPicks)) : { days: [], rows: [], weekend: null };
    return menuBody(pub?.weekStart ?? null, board, publicOrigin());
  }),
  referral: cached("referral", async () => referralBody(await loadReferralOffer(), publicOrigin())),
  faq: cached("faq", async () => faqBody(await loadFaqGroups(null), publicOrigin())),
  contact: async () => contactBody(publicOrigin()),
};
