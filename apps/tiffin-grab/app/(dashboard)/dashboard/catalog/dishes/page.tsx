import { Suspense } from "react";
import { UtensilsCrossedIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { CatalogData, type SearchParams } from "../[resource]/page";
import { ResourceEditorSkeleton } from "../[resource]/resource-editor";
import { CatalogTabs } from "./catalog-tabs";

// Combines the "dishes" and "dish-categories" resources into one tabbed card
// (Task 5): both remain distinct RESOURCES entries with their own schema and
// service, and both editors reuse the existing per-resource CatalogData loader
// and ResourceEditor — only the page shell is new.
export default function DishesAndCategoriesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title="Dishes & Categories" />
      <SectionCard title="Entries">
        <CatalogTabs
          dishes={
            <Suspense fallback={<ResourceEditorSkeleton resource="dishes" />}>
              <CatalogData resource="dishes" searchParams={searchParams} />
            </Suspense>
          }
          categories={
            <Suspense fallback={<ResourceEditorSkeleton resource="dish-categories" />}>
              <CatalogData resource="dish-categories" searchParams={searchParams} />
            </Suspense>
          }
        />
      </SectionCard>
    </PageShell>
  );
}
