import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "/",
    "/whats-on",
    "/kids",
    "/families",
    "/schools",
    "/birthdays",
    "/the-place",
    "/contact",
    "/membership",
    "/community",
    "/faq",
  ];
  return paths.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly" as const,
    priority: path === "/" ? 1 : 0.7,
  }));
}
