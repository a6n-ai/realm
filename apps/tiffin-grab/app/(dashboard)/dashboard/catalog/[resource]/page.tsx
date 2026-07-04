import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, dishes, durationPackages, mealSizes, plans, pricingTiers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { RESOURCES, WEEKDAY_OPTIONS, WEEKDAY_LABELS, type ResourceDef } from "../resource-config";
import { ResourceEditor, ResourceEditorSkeleton } from "./resource-editor";

const TABLES: Record<string, PgTable> = {
  dishes,
  plans,
  "meal-sizes": mealSizes,
  "delivery-frequencies": deliveryFrequencies,
  "duration-packages": durationPackages,
  "delivery-zones": deliveryZones,
  "pricing-tiers": pricingTiers,
  addons,
};

export default async function CatalogResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const def: ResourceDef | undefined = RESOURCES[resource];
  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title={def?.label ?? "Catalog"} />
      <SectionCard title="Entries">
        <Suspense fallback={<ResourceEditorSkeleton resource={resource} />}>
          <CatalogData resource={resource} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function CatalogData({ resource }: { resource: string }) {
  await requireAdmin();
  const def: ResourceDef | undefined = RESOURCES[resource];
  const table = TABLES[resource];
  if (!def || !table) notFound();

  const needsSlots = def.fields.some((f) => f.optionsSource === "mealSlots");
  const slotRows = needsSlots ? await mealSlotsService.enabledSlots() : [];
  const dynamicOptions: Record<string, { value: string; label: string }[]> = {};
  for (const f of def.fields) {
    if (f.optionsSource === "mealSlots") {
      dynamicOptions[f.key] = slotRows.map((s) => ({ value: s.key, label: s.label }));
    } else if (f.optionsSource === "weekdays") {
      dynamicOptions[f.key] = WEEKDAY_OPTIONS.map((d) => ({ value: d, label: WEEKDAY_LABELS[d] }));
    }
  }

  const raw = (await db.select().from(table)) as Record<string, unknown>[];
  const rows = raw.map((r) => {
    const dto: Record<string, unknown> & { publicId: string } = {
      publicId: r.publicId as string,
      active: r.active,
    };
    for (const f of def.fields) dto[f.key] = r[f.key];
    return dto;
  });

  return <ResourceEditor resource={resource} rows={rows} dynamicOptions={dynamicOptions} />;
}
