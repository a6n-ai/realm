import { Suspense } from "react";
import { TruckIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { CatalogData, type SearchParams } from "../[resource]/page";
import { ResourceEditorSkeleton } from "../[resource]/resource-editor";
import { GroupedResourceTabs } from "../grouped-resource-tabs";

// Combines "delivery-frequencies", "duration-packages" and "delivery-zones"
// into one tabbed "Delivery settings" card — same pattern as dishes/page.tsx
// and addons/page.tsx; each stays a distinct RESOURCES entry, only the page
// shell groups them. This static route shadows the dynamic [resource] route
// for the "delivery-frequencies" key, exactly as dishes/page.tsx does for "dishes".
export default function DeliverySettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader icon={TruckIcon} title="Delivery settings" />
      <SectionCard title="Entries">
        <GroupedResourceTabs
          tabs={[
            {
              value: "delivery-frequencies",
              label: "Frequencies",
              content: (
                <Suspense fallback={<ResourceEditorSkeleton resource="delivery-frequencies" />}>
                  <CatalogData resource="delivery-frequencies" searchParams={searchParams} />
                </Suspense>
              ),
            },
            {
              value: "duration-packages",
              label: "Duration packages",
              content: (
                <Suspense fallback={<ResourceEditorSkeleton resource="duration-packages" />}>
                  <CatalogData resource="duration-packages" searchParams={searchParams} />
                </Suspense>
              ),
            },
            {
              value: "delivery-zones",
              label: "Zones",
              content: (
                <Suspense fallback={<ResourceEditorSkeleton resource="delivery-zones" />}>
                  <CatalogData resource="delivery-zones" searchParams={searchParams} />
                </Suspense>
              ),
            },
          ]}
        />
      </SectionCard>
    </PageShell>
  );
}
