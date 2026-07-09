import { UpdatableRepository } from "@realm/database";
import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, durationPackages, mealSizes, plans, pricingTiers } from "@/db/schema";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { parseCategoryCounts } from "@/lib/menu/category-counts";
import { SessionUpdatableService } from "./session-service";

// "Delete" retires the row (active=false) so historical orders that reference
// it stay valid; the wizard loader filters these out, the admin editor shows them.
class SoftDeleteService<TTable extends PgTable> extends SessionUpdatableService<TTable> {
  async delete(id: string): Promise<number> {
    await this.update(id, { active: false });
    return 1;
  }
}

// Validates every write against the resource's zod schema before it reaches the
// repository, so any caller (action, seed, future API) is held to the same shape.
class CatalogService<TTable extends PgTable> extends SoftDeleteService<TTable> {
  constructor(repo: UpdatableRepository<TTable>, private schema: z.ZodObject<z.ZodRawShape>) {
    super(repo);
  }
  async create(values: Record<string, unknown>) {
    return super.create(this.schema.parse(values));
  }
  async update(id: string, patch: Record<string, unknown>) {
    return super.update(id, this.schema.partial().parse(patch));
  }
}

// offeredSlots is a derived column, not an independent input: whenever the
// editor submits categoryCounts, re-derive offeredSlots = Object.keys(counts)
// so the two never drift. parseCategoryCounts is the single source of "is this
// counts map valid" (positive integers, non-empty) — it throws before the row
// ever reaches the generic schema.parse.
function withDerivedOfferedSlots(values: Record<string, unknown>): Record<string, unknown> {
  if (!("categoryCounts" in values)) return values;
  const categoryCounts = parseCategoryCounts(values.categoryCounts);
  return { ...values, categoryCounts, offeredSlots: Object.keys(categoryCounts) };
}

class PlanService extends CatalogService<typeof plans> {
  async create(values: Record<string, unknown>) {
    return super.create(withDerivedOfferedSlots(values));
  }
  async update(id: string, patch: Record<string, unknown>) {
    return super.update(id, withDerivedOfferedSlots(patch));
  }
}

export const planService = new PlanService(new UpdatableRepository(db, plans, plans.publicId, plans.id), RESOURCES.plans.schema);
export const mealSizeService = new CatalogService(new UpdatableRepository(db, mealSizes, mealSizes.publicId, mealSizes.id), RESOURCES["meal-sizes"].schema);
export const addonService = new CatalogService(new UpdatableRepository(db, addons, addons.publicId, addons.id), RESOURCES.addons.schema);
export const deliveryFrequencyService = new CatalogService(new UpdatableRepository(db, deliveryFrequencies, deliveryFrequencies.publicId, deliveryFrequencies.id), RESOURCES["delivery-frequencies"].schema);
export const durationPackageService = new CatalogService(new UpdatableRepository(db, durationPackages, durationPackages.publicId, durationPackages.id), RESOURCES["duration-packages"].schema);
export const deliveryZoneService = new CatalogService(new UpdatableRepository(db, deliveryZones, deliveryZones.publicId, deliveryZones.id), RESOURCES["delivery-zones"].schema);
export const pricingTierService = new CatalogService(new UpdatableRepository(db, pricingTiers, pricingTiers.publicId, pricingTiers.id), RESOURCES["pricing-tiers"].schema);
