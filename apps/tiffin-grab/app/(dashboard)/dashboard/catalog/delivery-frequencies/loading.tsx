import { TruckIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { ResourceEditorSkeleton } from "../[resource]/resource-editor";
import { GroupedResourceTabs } from "../grouped-resource-tabs";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader icon={TruckIcon} title="Delivery settings" />
        <SectionCard title="Entries">
          <GroupedResourceTabs
            tabs={[
              { value: "delivery-frequencies", label: "Frequencies", content: <ResourceEditorSkeleton resource="delivery-frequencies" /> },
              { value: "duration-packages", label: "Duration packages", content: null },
              { value: "delivery-zones", label: "Zones", content: null },
              { value: "delivery-types", label: "Delivery types", content: null },
              { value: "tiffins-per-week", label: "Tiffins per week", content: null },
              { value: "delivery-charges", label: "Delivery charges", content: null },
            ]}
          />
        </SectionCard>
      </PageShell>
    </div>
  );
}
