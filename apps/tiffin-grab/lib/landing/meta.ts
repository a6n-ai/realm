import { BRAND_NAME } from "@/lib/brand";
import type { Metadata } from "next";

/** Title, description, canonical and share-card tags for one public page. The share image
 *  is app/opengraph-image.png, named here because a page's own openGraph replaces the
 *  root one whole, file image included. */
const IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: `${BRAND_NAME}: home-style food, packed the way you eat.` };
export function pageMeta(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: BRAND_NAME, type: "website", locale: "en_CA", images: [IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [IMAGE.url] },
  };
}

/** Legal and policy pages share the "<title> | Brand" tab title. */
export const legalMeta = (title: string, description: string, path: string): Metadata => pageMeta(`${title} | ${BRAND_NAME}`, description, path);
