import { UtensilsCrossedIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { ResourceEditorSkeleton } from "../[resource]/resource-editor";
import { CatalogTabs } from "./catalog-tabs";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader icon={UtensilsCrossedIcon} title="Dishes & Categories" />
        <SectionCard title="Entries">
          <CatalogTabs
            dishes={<ResourceEditorSkeleton resource="dishes" />}
            addons={<ResourceEditorSkeleton resource="addons" />}
            categories={<ResourceEditorSkeleton resource="dish-categories" />}
          />
        </SectionCard>
      </PageShell>
    </div>
  );
}
