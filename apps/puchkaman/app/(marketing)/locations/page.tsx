import type { Metadata } from "next";
import { PageBanner } from "@/components/brutal/shared";
import { listFranchiseLocations } from "@/lib/services/organizations.service";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";
import { LocationCard } from "./location-card";

export const metadata: Metadata = buildMetadata({
  title: "Our Locations — Puchkaman",
  description: "Find the Puchkaman location closest to you.",
  path: "/locations",
});
export const dynamic = "force-dynamic";

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Locations", path: "/locations" },
]);

export default async function LocationsPage() {
  const locations = await listFranchiseLocations();
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <PageBanner kicker="Where we deliver" title="Our Locations" sub="Find the Puchkaman closest to you." />
      <div className="mx-auto max-w-5xl px-4 py-12">
        {locations.length === 0 ? (
          <p className="text-center text-muted-foreground">No locations published yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {locations.map((loc) => (
              <LocationCard key={loc.id} location={loc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
