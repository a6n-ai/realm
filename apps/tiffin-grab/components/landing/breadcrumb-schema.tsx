import { breadcrumbJsonLd, jsonLdScript } from "@/lib/landing/business-jsonld";
import { publicOrigin } from "@/lib/routing/apex";

/** Home > this page, as BreadcrumbList JSON-LD. */
export function BreadcrumbSchema({ name, path }: { name: string; path: string }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd(publicOrigin(), name, path)) }} />;
}
