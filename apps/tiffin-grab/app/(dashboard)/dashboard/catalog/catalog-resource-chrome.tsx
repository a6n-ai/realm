import type { ReactNode } from "react";
import { UtensilsCrossedIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { RESOURCES } from "@/lib/catalog/resource-config";

export function CatalogResourceChrome({ resource, list }: { resource: string; list: ReactNode }) {
  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title={RESOURCES[resource]?.label ?? "Catalog"} />
      <SectionCard title="Entries">{list}</SectionCard>
    </PageShell>
  );
}
