import { requirePagePermission } from "@/lib/auth/guards";
import { Suspense } from "react";
import { CatalogResourceChrome } from "../catalog-resource-chrome";
import { ResourceEditorSkeleton } from "./resource-editor";
import { CatalogData, type SearchParams } from "../catalog-data";

export default async function CatalogResourcePage({
  params, searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: SearchParams;
}) {
  await requirePagePermission({ catalog: ["read"] });
  const { resource } = await params;
  return (
    <CatalogResourceChrome
      resource={resource}
      list={
        <Suspense fallback={<ResourceEditorSkeleton resource={resource} />}>
          <CatalogData resource={resource} searchParams={searchParams} />
        </Suspense>
      }
    />
  );
}
