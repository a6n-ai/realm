import type { MetadataRoute } from "next";
import { reviewsConnected } from "@/components/landing/landing-reviews";

const base = process.env.SITE_URL ?? "https://app.tiffingrab.ca";

const PAGES: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/menu/weekly", changeFrequency: "weekly", priority: 0.9 },
  { path: "/plans", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/menu", changeFrequency: "monthly", priority: 0.7 },
  { path: "/locations", changeFrequency: "monthly", priority: 0.7 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/subscribe", changeFrequency: "monthly", priority: 0.6 },
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
  return pages.map((p) => ({ url: `${base}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
