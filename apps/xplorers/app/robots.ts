import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api", "/login", "/signup", "/forgot-password", "/set-password", "/me"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
