import type { MetadataRoute } from "next";

const base = process.env.SITE_URL ?? "https://app.tiffingrab.ca";

// Public marketing pages are crawlable; the signed-in app and its APIs are not.
// Rules match by prefix, so the customer area is "/me$" and "/me/": a bare "/me"
// would also block /menu.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/me$", "/me/", "/checkout", "/activate", "/lock"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
