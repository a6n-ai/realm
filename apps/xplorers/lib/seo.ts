import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/brand";

export function buildMetadata({
  title,
  description,
  path,
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
}): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_SG",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
  };
}
