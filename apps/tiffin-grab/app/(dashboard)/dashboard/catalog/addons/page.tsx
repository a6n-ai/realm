import { Suspense } from "react";
import { PlusCircleIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { CatalogData, type SearchParams } from "../[resource]/page";
import { ResourceEditorSkeleton } from "../[resource]/resource-editor";
import { GroupedResourceTabs } from "../grouped-resource-tabs";

// Combines "addons" and "addon-categories" into one tabbed card, same pattern
// as dishes/page.tsx for dishes + dish-categories: both stay distinct
// RESOURCES entries with their own schema/service, only the page shell groups them.
export default function AddonsAndCategoriesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader icon={PlusCircleIcon} title="Add-ons & Categories" />
      <SectionCard title="Entries">
        <GroupedResourceTabs
          tabs={[
            {
              value: "addons",
              label: "Add-ons",
              content: (
                <Suspense fallback={<ResourceEditorSkeleton resource="addons" />}>
                  <CatalogData resource="addons" searchParams={searchParams} />
                </Suspense>
              ),
            },
            {
              value: "categories",
              label: "Categories",
              content: (
                <Suspense fallback={<ResourceEditorSkeleton resource="addon-categories" />}>
                  <CatalogData resource="addon-categories" searchParams={searchParams} />
                </Suspense>
              ),
            },
          ]}
        />
      </SectionCard>
    </PageShell>
  );
}
