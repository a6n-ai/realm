import type { Metadata } from "next";
import { EventsView } from "./events-view";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Cricket & Football Watch Parties in Scarborough | Puchkaman",
  description:
    "Scarborough's street-food watch party spot. Cricket, football & big-match nights with live puchka stations and event combo boxes. Limited seating — reserve your spot.",
  path: "/events",
});

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Events", path: "/events" },
]);

export default function EventsPage() {
  // No Event (schema.org) structured data here yet — the UPCOMING list in
  // events-view.tsx uses month/day labels with no year, so there's no real
  // ISO startDate to emit without guessing. Add it once the events data has
  // real dates (flagged in the SEO audit report as a content gap).
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <EventsView />
    </>
  );
}
