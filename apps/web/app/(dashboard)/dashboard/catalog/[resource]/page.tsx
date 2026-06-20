import { notFound } from "next/navigation";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, durationPackages, mealSizes, plans } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { RESOURCES, type ResourceDef } from "../resource-config";
import { ResourceEditor } from "./resource-editor";

const TABLES: Record<string, PgTable> = {
  plans,
  "meal-sizes": mealSizes,
  addons,
  "delivery-frequencies": deliveryFrequencies,
  "duration-packages": durationPackages,
  "delivery-zones": deliveryZones,
};

export default async function CatalogResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  await requireAdmin();
  const { resource } = await params;
  const def: ResourceDef | undefined = RESOURCES[resource];
  const table = TABLES[resource];
  if (!def || !table) notFound();

  const raw = (await db.select().from(table)) as Record<string, unknown>[];
  const rows = raw.map((r) => {
    const dto: Record<string, unknown> & { publicId: string } = {
      publicId: r.publicId as string,
      active: r.active,
    };
    for (const f of def.fields) dto[f.key] = r[f.key];
    return dto;
  });

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{def.label}</h1>
      <ResourceEditor resource={resource} def={def} rows={rows} />
    </section>
  );
}
