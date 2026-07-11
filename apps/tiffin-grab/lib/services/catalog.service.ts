import { ValidationError } from "@realm/commons";
import { UpdatableRepository } from "@realm/database";
import { eq, or } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, deliveryZones, durationPackages, mealSizeItems, mealSizes, plans, pricingTiers } from "@/db/schema";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { dishCategoriesService } from "./dish-categories.service";
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

type CompositionItem = {
  name: string;
  category: string;
  weightValue: string | null;
  weightUnit: "oz" | "g" | "ml" | "piece" | null;
  qty: number;
};

// A meal size owns a `meal_size_items` composition and belongs to exactly one
// plan. The generic CatalogService can't express either: the plan dropdown works
// in publicId space (resolved to plans.id on write, mirroring menu.service), and
// the items are a second table that must be full-replaced atomically. This
// subclass keeps SoftDeleteService's retire/restore and the base session audit
// stamping on the parent `meal_sizes` row.
class MealSizeService extends SoftDeleteService<typeof mealSizes> {
  private schema = RESOURCES["meal-sizes"].schema;

  async create(values: Record<string, unknown>) {
    return this.persist(null, this.schema.parse(values), true);
  }

  async update(id: string, patch: Record<string, unknown>) {
    return this.persist(id, this.schema.partial().parse(patch), false);
  }

  private async persist(id: string | null, parsed: Record<string, unknown>, isCreate: boolean) {
    const { items, planId, ...rest } = parsed as {
      items?: CompositionItem[];
      planId?: string;
    } & Record<string, unknown>;

    const parentPatch: Record<string, unknown> = { ...rest };
    if (planId !== undefined) parentPatch.planId = await this.resolvePlanId(planId);
    // `components` is derived from the item names, never hand-edited.
    if (items !== undefined) parentPatch.components = items.map((i) => i.name);

    // Validate every category soft-ref BEFORE any write, so a bad row rejects the
    // whole save (create/update + item replace) rather than half-applying it.
    let rows: (typeof mealSizeItems.$inferInsert)[] | undefined;
    if (items !== undefined) {
      const categories = await dishCategoriesService.enabledCategories();
      const labelByKey = new Map(categories.map((c) => [c.key, c.label]));
      rows = items.map((item, index) => {
        if (!labelByKey.has(item.category)) throw new ValidationError(`Unknown category: ${item.category}`);
        return {
          mealSizeId: 0n, // placeholder; set once the parent id is known
          name: item.name,
          category: item.category,
          label: labelByKey.get(item.category) ?? item.name,
          qty: item.qty,
          weightValue: item.weightValue,
          weightUnit: item.weightUnit,
          sortOrder: index,
        };
      });
    }

    // Parent upsert through the base path preserves createdBy/updatedBy stamping
    // and the audit-trail write.
    const parent = isCreate ? await super.create(parentPatch) : await super.update(id as string, parentPatch);
    const mealSizeId = (parent as { id: bigint }).id;

    if (rows !== undefined) {
      const itemRows = rows;
      await db.transaction(async (tx) => {
        await tx.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, mealSizeId));
        if (itemRows.length) await tx.insert(mealSizeItems).values(itemRows.map((r) => ({ ...r, mealSizeId })));
      });
    }
    return parent;
  }

  private async resolvePlanId(value: string): Promise<bigint> {
    const [row] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(or(eq(plans.publicId, value), eq(plans.key, value)))
      .limit(1);
    if (!row) throw new ValidationError(`Unknown plan: ${value}`);
    return row.id;
  }
}

export const planService = new CatalogService(new UpdatableRepository(db, plans, plans.publicId, plans.id), RESOURCES.plans.schema);
export const mealSizeService = new MealSizeService(new UpdatableRepository(db, mealSizes, mealSizes.publicId, mealSizes.id));
export const addonService = new CatalogService(new UpdatableRepository(db, addons, addons.publicId, addons.id), RESOURCES.addons.schema);
export const deliveryFrequencyService = new CatalogService(new UpdatableRepository(db, deliveryFrequencies, deliveryFrequencies.publicId, deliveryFrequencies.id), RESOURCES["delivery-frequencies"].schema);
export const durationPackageService = new CatalogService(new UpdatableRepository(db, durationPackages, durationPackages.publicId, durationPackages.id), RESOURCES["duration-packages"].schema);
export const deliveryZoneService = new CatalogService(new UpdatableRepository(db, deliveryZones, deliveryZones.publicId, deliveryZones.id), RESOURCES["delivery-zones"].schema);
export const pricingTierService = new CatalogService(new UpdatableRepository(db, pricingTiers, pricingTiers.publicId, pricingTiers.id), RESOURCES["pricing-tiers"].schema);
