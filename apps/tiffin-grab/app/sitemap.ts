import type { MetadataRoute } from "next";

const base = process.env.SITE_URL ?? "https://app.tiffingrab.ca";

const PAGES: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/menu/weekly", changeFrequency: "weekly", priority: 0.9 },
  { path: "/plans", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/menu", changeFrequency: "monthly", priority: 0.7 },
  { path: "/locations", changeFrequency: "monthly", priority: 0.7 },
  { path: "/reviews", changeFrequency: "weekly", priority: 0.6 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/subscribe", changeFrequency: "monthly", priority: 0.6 },
  { path: "/legal", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/delivery-policy", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: `${base}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
