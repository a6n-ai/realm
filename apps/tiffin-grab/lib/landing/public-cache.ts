import { sharedCache } from "@/lib/cache";

/**
 * Data the public pages read on every visit but staff change rarely: the FAQ, the
 * franchise kitchens, the store origin the delivery map centres on. Kept in the
 * shared Redis cache for ten minutes; the admin writes that change them evict it.
 * Pricing and the catalog stay on their own short-lived cache (checkout reads them).
 */
export const publicPagesCache = sharedCache("public-pages", 10 * 60 * 1000);

export const evictPublicPages = () => publicPagesCache.evictAll();
