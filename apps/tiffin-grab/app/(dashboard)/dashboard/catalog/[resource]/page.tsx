import { Suspense } from "react";
import { UtensilsCrossedIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { RESOURCES, type ResourceDef } from "@/lib/catalog/resource-config";
import { ResourceEditorSkeleton } from "./resource-editor";
import { CatalogData, type SearchParams } from "../catalog-data";

export default async function CatalogResourcePage({
  params, searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: SearchParams;
}) {
  const { resource } = await params;
  const def: ResourceDef | undefined = RESOURCES[resource];
  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title={def?.label ?? "Catalog"} />
      <SectionCard title="Entries">
        <Suspense fallback={<ResourceEditorSkeleton resource={resource} />}>
          <CatalogData resource={resource} searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}
