import { and, asc, eq, isNotNull, type SQL } from "drizzle-orm";
import { UpdatableRepository } from "@foundry/database";
import type { FileDetail } from "@foundry/storage/model";
import { db } from "@/db/client";
import { dishes, plans } from "@/db/schema";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { SessionUpdatableService } from "./session-service";

/** A plan's display tag, rendered verbatim — the code never interprets it. */
export type PlanTag = { label: string; color: string };

export type CustomerDish = {
  publicId: string;
  name: string;
  description: string | null;
  image: FileDetail | null;
  category: string | null;
  // Tag of the single plan this dish is on. Replaces the old veg/non-veg
  // dot: what a dish "is" comes from the plan an admin put it on, not from a
  // hardcoded key.
  planTags: PlanTag[];
};

class DishesService extends SessionUpdatableService<typeof dishes> {
  private schema = RESOURCES.dishes.schema;

  // Validate every write (incl. the soft-ref `category`) server-side, so any
  // caller — catalog editor, menu-builder inline create, seed — is held to the
  // same shape rather than trusting client-submitted fields. planId resolves
  // from planPublicId, the form-facing field.
  async create(values: Record<string, unknown>) {
    const { planId: planPublicId, ...rest } = this.schema.parse(values);
    const planId = await this.resolvePlanId(planPublicId as string);
    return super.create({ ...rest, planId });
  }

  async update(id: string, patch: Record<string, unknown>) {
    const { planId: planPublicId, ...rest } = this.schema.partial().parse(patch);
    const planId = planPublicId ? await this.resolvePlanId(planPublicId as string) : undefined;
    return super.update(id, { ...rest, ...(planId ? { planId } : {}) });
  }

  private async resolvePlanId(planPublicId: string) {
    const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.publicId, planPublicId)).limit(1);
    if (!plan) throw new Error("Unknown plan");
    return plan.id;
  }

  async delete(id: string): Promise<number> {
    await super.update(id, { active: false });
    return 1;
  }

  // Customer-facing read: active dishes that actually have a photo, for meal-size
  // slideshows. Text-only (imageless) dishes are excluded so those surfaces stay photo-driven.
  async listActiveWithImages(): Promise<CustomerDish[]> {
    const rows = await this.selectWithPlanTag(and(eq(dishes.active, true), isNotNull(dishes.image))!);
    return rows.map((r) => ({ ...r, image: r.image as FileDetail }));
  }

  // Menu gallery: all active dishes — DishImage falls back to a gradient tile when
  // image is null so seed catalogs still browse like a food app.
  async listActive(): Promise<CustomerDish[]> {
    const rows = await this.selectWithPlanTag(eq(dishes.active, true));
    return rows.map((r) => ({ ...r, image: (r.image as FileDetail | null) ?? null }));
  }

  private async selectWithPlanTag(where: SQL) {
    const rows = await db
      .select({
        publicId: dishes.publicId,
        name: dishes.name,
        description: dishes.description,
        image: dishes.image,
        category: dishes.category,
        planLabel: plans.tagLabel,
        planColor: plans.tagColor,
      })
      .from(dishes)
      .innerJoin(plans, eq(plans.id, dishes.planId))
      .where(where)
      .orderBy(asc(dishes.name));
    return rows.map((r) => ({
      publicId: r.publicId,
      name: r.name,
      description: r.description,
      image: r.image,
      category: r.category,
      planTags: r.planLabel && r.planColor ? [{ label: r.planLabel, color: r.planColor }] : [],
    }));
  }
}
const repo = new UpdatableRepository(db, dishes, dishes.publicId, dishes.id);
export const dishesService = new DishesService(repo);
