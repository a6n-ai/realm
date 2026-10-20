import type { MetadataRoute } from "next";

const base = process.env.SITE_URL ?? "https://app.tiffingrab.ca";

// Public marketing pages are crawlable; the signed-in app and its APIs are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/me", "/checkout", "/activate", "/lock"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
