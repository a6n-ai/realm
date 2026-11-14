import type { MetadataRoute } from "next";
import { reviewsConnected } from "@/lib/landing/reviews";
import { publicOrigin } from "@/lib/routing/apex";
import { PUBLIC_PAGES } from "@/lib/routing/public-pages";

// Per request: /reviews is listed only while Google Reviews is connected.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const reviews = await reviewsConnected();
  const pages = PUBLIC_PAGES.filter((p) => p.only !== "reviews" || reviews);
  // Apex URLs only: /subscribe lives on app. (the apex 302s it), so it is left out.
  const base = publicOrigin();
  return pages.map((p) => ({ url: `${base}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
