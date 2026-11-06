import type { MetadataRoute } from "next";
import { reviewsConnected } from "@/components/landing/landing-reviews";
import { publicOrigin } from "@/lib/routing/apex";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { areaSlug, areaZones } from "@/lib/landing/areas";

const PAGES: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/menu", changeFrequency: "weekly", priority: 0.9 },
  { path: "/locations", changeFrequency: "monthly", priority: 0.7 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.6 },
  { path: "/refer", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/legal", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/delivery-policy", changeFrequency: "yearly", priority: 0.3 },
];

// Per request: /reviews is listed only while Google Reviews is connected.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = (await reviewsConnected()) ? [...PAGES, { path: "/reviews", changeFrequency: "weekly" as const, priority: 0.6 }] : PAGES;
  // Apex URLs only: /subscribe lives on app. (the apex 302s it), so it is left out.
  const base = publicOrigin();
  // One page per delivery area (lib/landing/areas.ts decides which zones get one).
  const zones = await loadCatalogSnapshot().then((c) => areaZones(c.zones)).catch(() => []);
  const all = [...pages, ...zones.map((z) => ({ path: `/locations/${areaSlug(z.name)}`, changeFrequency: "weekly" as const, priority: 0.7 }))];
  return all.map((p) => ({ url: `${base}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
