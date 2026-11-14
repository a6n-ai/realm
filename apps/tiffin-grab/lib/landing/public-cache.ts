import { sharedCache } from "@/lib/cache";
import { revalidatePublicSite } from "@/lib/landing/revalidate-site";

/**
 * Data the public pages read on every visit but staff change rarely: the FAQ, the
 * franchise kitchens, the store origin the delivery map centres on. Kept in the
 * shared cache (Workers KV) for ten minutes; the admin writes that change them evict it.
 * Pricing and the catalog stay on their own short-lived cache (checkout reads them).
 */
export const publicPagesCache = sharedCache("public-pages", 10 * 60 * 1000, 0, true);

export async function evictPublicPages(): Promise<void> {
  await publicPagesCache.evictAll();
  revalidatePublicSite();
}
