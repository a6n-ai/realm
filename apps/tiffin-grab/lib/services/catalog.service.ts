import { ValidationError, cutoffMsFor } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { eq, or } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db } from "@/db/client";
import { addonCategories, addons, deliveryFrequencies, deliveryZones, discounts, durationPackages, mealSizeItems, mealSizes, plans, pricingTiers } from "@/db/schema";
import { RESOURCES, slug } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import {
  emptyActiveCompositionMessage,
  maxTuBelowBaseMessage,
  unknownPlanCategoryMessage,
} from "@/lib/menu/admin-config-guards";
import { getAppSettings } from "./app-settings.service";
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
  tuAmount: string;
  maxTuAmount: string | null;
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
      active?: boolean;
    } & Record<string, unknown>;

    const parentPatch: Record<string, unknown> = { ...rest };
    if (planId !== undefined) parentPatch.planId = await this.resolvePlanId(planId);
    // `components` is derived from the category labels, never hand-edited.
    // Resolved below, once the label map is loaded.

    // Resolve plan for plan-scoped category checks (create requires planId; update may inherit).
    let resolvedPlanId: bigint | null = (parentPatch.planId as bigint | undefined) ?? null;
    let currentlyActive = true;
    let mealSizeInternalId: bigint | null = null;
    if (id) {
      const [existing] = await db
        .select({ id: mealSizes.id, planId: mealSizes.planId, active: mealSizes.active })
        .from(mealSizes)
        .where(eq(mealSizes.publicId, id))
        .limit(1);
      mealSizeInternalId = existing?.id ?? null;
      if (resolvedPlanId == null) resolvedPlanId = existing?.planId ?? null;
      currentlyActive = existing?.active ?? true;
    }
    const willBeActive = parentPatch.active !== undefined ? Boolean(parentPatch.active) : currentlyActive;

    // Validate every category soft-ref BEFORE any write, so a bad row rejects the
    // whole save (create/update + item replace) rather than half-applying it.
    let rows: (typeof mealSizeItems.$inferInsert)[] | undefined;
    if (items !== undefined) {
      if (items.length === 0 && willBeActive) {
        throw new ValidationError(emptyActiveCompositionMessage());
      }

      const maxTuErr = maxTuBelowBaseMessage(items);
      if (maxTuErr) throw new ValidationError(maxTuErr);

      if (items.length > 0 && resolvedPlanId == null) {
        throw new ValidationError("Select a plan for this meal size.");
      }
      const planCats = resolvedPlanId != null ? await dishCategoriesService.forPlan(resolvedPlanId) : [];
      const labelByKey = new Map(planCats.map((c) => [c.key, c.label]));
      // An item's name IS its category label now, so the two can never disagree.
      parentPatch.components = items.map((i) => labelByKey.get(i.category) ?? i.category);
      rows = items.map((item, index) => {
        if (!labelByKey.has(item.category)) throw new ValidationError(unknownPlanCategoryMessage(item.category));
        const label = labelByKey.get(item.category)!;
        return {
          mealSizeId: 0n, // placeholder; set once the parent id is known
          name: label,
          category: item.category,
          planId: resolvedPlanId!,
          label,
          tuAmount: item.tuAmount,
          maxTuAmount: item.maxTuAmount,
          sortOrder: index,
        };
      });
    } else if (willBeActive && mealSizeInternalId != null && !currentlyActive) {
      // Restore / re-activate without re-sending items: still refuse an empty composition.
      const existingItems = await db
        .select({ id: mealSizeItems.id })
        .from(mealSizeItems)
        .where(eq(mealSizeItems.mealSizeId, mealSizeInternalId))
        .limit(1);
      if (existingItems.length === 0) throw new ValidationError(emptyActiveCompositionMessage());
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

// Discounts store dates as epoch ms and the target as a bigint soft ref, while the form
// works in yyyy-mm-dd and target publicIds — this resolves both and checks target vs kind.
class DiscountService extends SoftDeleteService<typeof discounts> {
  private schema = RESOURCES.discounts.schema;

  async create(values: Record<string, unknown>) {
    const parsed = this.schema.parse(values) as Record<string, unknown>;
    parsed.key = await this.uniqueKey((parsed.key as string | undefined) || slug(String(parsed.name)) || "discount");
    return super.create(await this.toRow(parsed, parsed.kind as string));
  }

  async update(id: string, patch: Record<string, unknown>) {
    const parsed = this.schema.partial().parse(patch) as Record<string, unknown>;
    delete parsed.key; // immutable after create, like every keyed resource
    const kind = (parsed.kind as string | undefined) ?? (parsed.targetId !== undefined ? ((await this.read(id)) as { kind: string }).kind : undefined);
    return super.update(id, await this.toRow(parsed, kind));
  }

  private async uniqueKey(base: string) {
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      const [hit] = await db.select({ id: discounts.id }).from(discounts).where(eq(discounts.key, candidate)).limit(1);
      if (!hit) return candidate;
    }
  }

  private async toRow(parsed: Record<string, unknown>, kind: string | undefined) {
    const out: Record<string, unknown> = { ...parsed };
    if (parsed.targetId !== undefined) {
      if (parsed.targetId === null) out.targetId = null;
      else {
        const table = kind === "duration" ? durationPackages : deliveryFrequencies;
        const [row] = await db.select({ id: table.id }).from(table).where(eq(table.publicId, parsed.targetId as string)).limit(1);
        if (!row) throw new ValidationError(`Target does not match a ${kind === "duration" ? "duration package" : "delivery frequency"}`);
        out.targetId = row.id;
      }
    }
    const { timezone } = await getAppSettings();
    if (parsed.startsAt !== undefined) out.startsAt = parsed.startsAt ? cutoffMsFor(parsed.startsAt as string, 0, timezone) : null;
    // Inclusive end date: last minute of that local day.
    if (parsed.endsAt !== undefined) out.endsAt = parsed.endsAt ? cutoffMsFor(parsed.endsAt as string, 23, timezone) + 3_599_999 : null;
    if (typeof out.startsAt === "number" && typeof out.endsAt === "number" && out.endsAt < out.startsAt) {
      throw new ValidationError("End date cannot be before start date");
    }
    return out;
  }
}

export const planService = new CatalogService(new UpdatableRepository(db, plans, plans.publicId, plans.id), RESOURCES.plans.schema);
export const mealSizeService = new MealSizeService(new UpdatableRepository(db, mealSizes, mealSizes.publicId, mealSizes.id));
export const addonCategoryService = new CatalogService(new UpdatableRepository(db, addonCategories, addonCategories.publicId, addonCategories.id), RESOURCES["addon-categories"].schema);
export const addonService = new CatalogService(new UpdatableRepository(db, addons, addons.publicId, addons.id), RESOURCES.addons.schema);
export const deliveryFrequencyService = new CatalogService(new UpdatableRepository(db, deliveryFrequencies, deliveryFrequencies.publicId, deliveryFrequencies.id), RESOURCES["delivery-frequencies"].schema);
export const durationPackageService = new CatalogService(new UpdatableRepository(db, durationPackages, durationPackages.publicId, durationPackages.id), RESOURCES["duration-packages"].schema);
export const deliveryZoneService = new CatalogService(new UpdatableRepository(db, deliveryZones, deliveryZones.publicId, deliveryZones.id), RESOURCES["delivery-zones"].schema);
export const pricingTierService = new CatalogService(new UpdatableRepository(db, pricingTiers, pricingTiers.publicId, pricingTiers.id), RESOURCES["pricing-tiers"].schema);
export const discountService = new DiscountService(new UpdatableRepository(db, discounts, discounts.publicId, discounts.id));
